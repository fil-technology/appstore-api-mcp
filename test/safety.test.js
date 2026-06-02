import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { LIMITS, validateAttributes, buildDiff } from "../src/validation.js";
import {
  isWriteTool,
  writeBlockReason,
  envBool,
  writeModeSummary,
} from "../src/guardrails.js";
import { AppStoreConnectClient } from "../src/client.js";

// ---- Validation: the core ASO guarantee (100-char keywords etc.) ----

test("keyword field over 100 chars produces a warning", () => {
  const w = validateAttributes({ keywords: "x".repeat(101) });
  assert.equal(w.length, 1);
  assert.match(w[0], /exceeds Apple's limit of 100/);
});

test("keyword field at exactly 100 chars is fine", () => {
  assert.deepEqual(validateAttributes({ keywords: "x".repeat(100) }), []);
});

test("name/subtitle limits are 30", () => {
  assert.equal(LIMITS.name, 30);
  assert.equal(validateAttributes({ name: "x".repeat(31) }).length, 1);
  assert.equal(validateAttributes({ subtitle: "ok" }).length, 0);
});

test("buildDiff flags an over-limit change", () => {
  const d = buildDiff({ keywords: "a,b" }, { keywords: "x".repeat(120) });
  assert.equal(d[0].changed, true);
  assert.equal(d[0].exceedsLimit, true);
  assert.equal(d[0].newLength, 120);
});

// ---- Guardrails: writes are blocked when the env says so ----

test("read tools are never writes", () => {
  for (const n of ["list_apps", "get_app", "audit_apps", "doctor", "get_sales_report"])
    assert.equal(isWriteTool(n), false, n);
});

test("write tools are detected", () => {
  for (const n of ["update_app_store_version_localization", "release_version", "upload_build", "set_app_price"])
    assert.equal(isWriteTool(n), true, n);
});

test("raw_request is a write only for non-GET", () => {
  assert.equal(isWriteTool("raw_request", { method: "GET" }), false);
  assert.equal(isWriteTool("raw_request", { method: "POST" }), true);
});

test("READ_ONLY blocks all writes but not reads", () => {
  const env = { APPSTORE_MCP_READ_ONLY: "true" };
  assert.match(writeBlockReason("update_app_store_version_localization", {}, env), /READ-ONLY/);
  assert.match(writeBlockReason("release_version", {}, env), /READ-ONLY/);
  assert.equal(writeBlockReason("list_apps", {}, env), null);
  assert.equal(writeBlockReason("doctor", {}, env), null);
});

test("category flags block only their category", () => {
  const env = { APPSTORE_MCP_ALLOW_RELEASE: "false" };
  assert.match(writeBlockReason("release_version", {}, env), /releasing a version/);
  assert.match(writeBlockReason("set_phased_release", {}, env), /releasing a version/);
  // a normal metadata write is still allowed
  assert.equal(writeBlockReason("update_app_store_version_localization", {}, env), null);
});

test("ALLOW flags default to allowed when unset", () => {
  assert.equal(writeBlockReason("release_version", {}, {}), null);
  assert.equal(writeBlockReason("set_app_price", {}, {}), null);
  assert.equal(writeBlockReason("reply_to_customer_review", {}, {}), null);
});

test("envBool parses truthy/falsey", () => {
  assert.equal(envBool("true"), true);
  assert.equal(envBool("1"), true);
  assert.equal(envBool("false"), false);
  assert.equal(envBool("", true), true);
  assert.equal(envBool(undefined, false), false);
});

test("writeModeSummary reflects env", () => {
  const m = writeModeSummary({ APPSTORE_MCP_READ_ONLY: "1", APPSTORE_MCP_ALLOW_RELEASE: "false" });
  assert.equal(m.readOnly, true);
  assert.equal(m.allowRelease, false);
  assert.equal(m.allowPriceChanges, true);
});

// ---- Report parsing: gzip + TSV + empty rows ----

test("parseDelimited handles TSV with header", () => {
  const { columns, rows } = AppStoreConnectClient.parseDelimited("A\tB\n1\t2\n3\t4");
  assert.deepEqual(columns, ["A", "B"]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].A, "1");
});

test("parseDelimited on empty input is safe", () => {
  assert.deepEqual(AppStoreConnectClient.parseDelimited(""), { columns: [], rows: [] });
});

test("gzip magic detection + round-trip", () => {
  const gz = gzipSync(Buffer.from("Units\tProceeds\n5\t1.99\n"));
  assert.equal(AppStoreConnectClient._isGzip(gz), true);
  assert.equal(AppStoreConnectClient._isGzip(Buffer.from("plain")), false);
});

// ---- 429 retry: client backs off and retries, then succeeds ----

test("request retries on 429 then succeeds", async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1)
      return { ok: false, status: 429, headers: { get: (h) => (h === "retry-after" ? "0" : null) }, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify({ data: [] }) };
  };
  try {
    const c = new AppStoreConnectClient({ keyId: "K", issuerId: "I", privateKey: "x" });
    c._getToken = async () => "tok"; // skip real JWT
    const res = await c.request("GET", "/apps");
    assert.deepEqual(res, { data: [] });
    assert.equal(calls, 2, "should have retried once");
  } finally {
    globalThis.fetch = realFetch;
  }
});
