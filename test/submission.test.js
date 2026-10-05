import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectOverlappingOffers } from "../src/subscriptions.js";
import { isWriteTool, writeBlockReason, WRITE_TOOLS } from "../src/guardrails.js";

// ---- Overlapping subscription offers ----

test("detectOverlappingOffers: non-overlapping date ranges are fine", () => {
  const offers = [
    { id: "a", kind: "introductory", startDate: "2026-01-01", endDate: "2026-01-31" },
    { id: "b", kind: "promotional", startDate: "2026-02-01", endDate: "2026-02-28" },
  ];
  assert.deepEqual(detectOverlappingOffers(offers), []);
});

test("detectOverlappingOffers: overlapping ranges are flagged", () => {
  const offers = [
    { id: "a", kind: "introductory", startDate: "2026-01-01", endDate: "2026-01-20" },
    { id: "b", kind: "introductory", startDate: "2026-01-15", endDate: "2026-02-01" },
  ];
  const overlaps = detectOverlappingOffers(offers);
  assert.equal(overlaps.length, 1);
  assert.deepEqual([overlaps[0].a.id, overlaps[0].b.id].sort(), ["a", "b"]);
});

test("detectOverlappingOffers: two open-ended offers always overlap", () => {
  // the qm_299_1w failure mode — two always-on introductory offers
  const offers = [
    { id: "a", kind: "introductory", startDate: null, endDate: null },
    { id: "b", kind: "introductory", startDate: null, endDate: null },
  ];
  assert.equal(detectOverlappingOffers(offers).length, 1);
});

test("detectOverlappingOffers: open-ended end overlaps a later offer", () => {
  const offers = [
    { id: "a", startDate: "2026-01-01", endDate: null },
    { id: "b", startDate: "2026-06-01", endDate: "2026-06-30" },
  ];
  assert.equal(detectOverlappingOffers(offers).length, 1);
});

test("detectOverlappingOffers: handles empty / single", () => {
  assert.deepEqual(detectOverlappingOffers([]), []);
  assert.deepEqual(detectOverlappingOffers([{ id: "a" }]), []);
});

// ---- Guardrails for the new write tools ----

const NEW_WRITES = [
  "attach_build_to_version",
  "update_app_store_version",
  "update_build",
  "expire_build",
  "add_review_submission_item",
  "cancel_review_submission",
  "set_beta_build_notes",
  "reorder_screenshots",
  "replace_screenshots",
  "create_subscription_group",
  "create_subscription",
  "create_in_app_purchase",
  "swap_build",
  "release_pipeline",
  "bulk_upsert_localizations",
];

const NEW_READS = [
  "get_app_store_version",
  "get_build",
  "wait_for_build_processing",
  "next_build_number",
  "list_review_submissions",
  "get_review_submission",
  "get_beta_review_status",
  "get_app_store_review_detail",
  "list_app_territories",
  "list_subscription_groups",
  "list_subscriptions",
  "list_subscription_offers",
  "find_incomplete_screenshots",
  "diagnose_submission",
];

test("new write tools are gated by read-only mode", () => {
  for (const t of NEW_WRITES) {
    assert.ok(isWriteTool(t), `${t} should be a write tool`);
    assert.match(writeBlockReason(t, {}, { APPSTORE_MCP_READ_ONLY: "true" }), /READ-ONLY/);
  }
});

test("new read tools are never writes", () => {
  for (const t of NEW_READS) {
    assert.equal(isWriteTool(t), false, `${t} should be read-only`);
  }
});

// ---- Tool registry integrity (guards against copy-paste dup names) ----

test("no duplicate tool names in index.js", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const names = [...src.matchAll(/^\s{4}name: "([a-z_]+)",$/gm)].map((m) => m[1]);
  const dups = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual([...new Set(dups)], [], `duplicate tool names: ${dups}`);
  assert.ok(names.length > 60, `expected 60+ tools, found ${names.length}`);
});

test("every new tool is actually registered in index.js", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  for (const t of [...NEW_WRITES, ...NEW_READS]) {
    assert.ok(src.includes(`name: "${t}"`), `${t} is not registered`);
  }
});
