import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderTemplates,
  detectProject,
  existingPipelineFiles,
  parseRepoSlug,
} from "../src/cicd.js";
import { isWriteTool, writeBlockReason } from "../src/guardrails.js";

const VARS = {
  appDir: "iOS",
  projectName: "OkCircle",
  scheme: "OkCircle",
  target: "OkCircle",
  bundleId: "technology.fil.okcircle",
  teamId: "L7T5538V86",
};

// ---- Template rendering ----

test("renders the seven pipeline files", () => {
  const f = renderTemplates(VARS);
  assert.deepEqual(
    Object.keys(f).sort(),
    [
      ".github/workflows/ios-ci.yml",
      ".github/workflows/ios-testflight.yml",
      "iOS/Gemfile",
      "iOS/fastlane/.gitignore",
      "iOS/fastlane/Appfile",
      "iOS/fastlane/Fastfile",
      "iOS/fastlane/SETUP.md",
    ].sort(),
  );
});

test("Fastfile carries detected values and cloud-signing flag", () => {
  const ff = renderTemplates(VARS)["iOS/fastlane/Fastfile"];
  assert.match(ff, /BUNDLE_ID\s*=\s*"technology\.fil\.okcircle"/);
  assert.match(ff, /TEAM_ID\s*=\s*"L7T5538V86"/);
  assert.match(ff, /PROJECT\s*=\s*"OkCircle\.xcodeproj"/);
  assert.match(ff, /-allowProvisioningUpdates/);
  assert.match(ff, /is_key_content_base64: true/);
});

test("workflows scope paths + working-dir to the app dir", () => {
  const ci = renderTemplates(VARS)[".github/workflows/ios-ci.yml"];
  assert.match(ci, /- "iOS\/\*\*"/);
  assert.match(ci, /working-directory: iOS/);
});

test("root app (appDir '.') uses sensible paths and Gemfile location", () => {
  const f = renderTemplates({ ...VARS, appDir: "." });
  assert.ok(f["Gemfile"], "Gemfile at repo root");
  assert.ok(f["fastlane/Fastfile"], "fastlane at repo root");
  assert.match(f[".github/workflows/ios-ci.yml"], /working-directory: \./);
});

// ---- Project auto-detection from a fixture repo ----

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "cicd-test-"));
  const proj = join(root, "iOS", "OkCircle.xcodeproj");
  mkdirSync(proj, { recursive: true });
  writeFileSync(
    join(proj, "project.pbxproj"),
    `// pbxproj fixture
    PRODUCT_BUNDLE_IDENTIFIER = technology.fil.okcircle;
    PRODUCT_BUNDLE_IDENTIFIER = technology.fil.okcircle;
    PRODUCT_BUNDLE_IDENTIFIER = technology.fil.okcircle.Tests;
    DEVELOPMENT_TEAM = L7T5538V86;
    DEVELOPMENT_TEAM = L7T5538V86;
    `,
  );
  return root;
}

test("detects appDir/project/bundleId/teamId from .xcodeproj", () => {
  const root = makeRepo();
  try {
    const { detected, missing } = detectProject(root);
    assert.equal(missing.length, 0);
    assert.equal(detected.appDir, "iOS");
    assert.equal(detected.projectName, "OkCircle");
    assert.equal(detected.scheme, "OkCircle");
    assert.equal(detected.bundleId, "technology.fil.okcircle");
    assert.equal(detected.teamId, "L7T5538V86");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("filters out test-target bundle ids", () => {
  const root = makeRepo();
  try {
    const { detected } = detectProject(root);
    assert.ok(!detected.bundleId.endsWith(".Tests"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit args override detection", () => {
  const root = makeRepo();
  try {
    const { detected } = detectProject(root, {
      bundleId: "com.override.app",
      scheme: "Custom",
    });
    assert.equal(detected.bundleId, "com.override.app");
    assert.equal(detected.scheme, "Custom");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports missing fields when no project and nothing provided", () => {
  const root = mkdtempSync(join(tmpdir(), "cicd-empty-"));
  try {
    const { missing } = detectProject(root);
    assert.ok(missing.includes("xcodeproj"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("existingPipelineFiles spots an already-present workflow", () => {
  const root = makeRepo();
  try {
    const wf = join(root, ".github", "workflows");
    mkdirSync(wf, { recursive: true });
    writeFileSync(join(wf, "ios-ci.yml"), "name: iOS CI\n");
    const files = renderTemplates(detectProject(root).detected);
    const existing = existingPipelineFiles(root, files);
    assert.ok(existing.includes(".github/workflows/ios-ci.yml"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---- Repo slug parsing ----

test("parseRepoSlug handles ssh and https remotes", () => {
  assert.equal(parseRepoSlug("git@github.com:fil-technology/okcircle.git"), "fil-technology/okcircle");
  assert.equal(parseRepoSlug("https://github.com/fil-technology/okcircle.git"), "fil-technology/okcircle");
  assert.equal(parseRepoSlug("https://github.com/fil-technology/okcircle"), "fil-technology/okcircle");
  assert.equal(parseRepoSlug(""), null);
});

// ---- Guardrails: new write tools are gated, ensure_asc_app is not ----

test("bootstrap write tools are blocked in read-only mode", () => {
  const env = { APPSTORE_MCP_READ_ONLY: "true" };
  for (const t of ["bootstrap_ios_cicd", "set_repo_ci_secrets", "bootstrap_testflight"]) {
    assert.ok(isWriteTool(t), `${t} should be a write tool`);
    assert.match(writeBlockReason(t, {}, env), /READ-ONLY/);
  }
});

test("ensure_asc_app is read-only (never blocked)", () => {
  assert.equal(isWriteTool("ensure_asc_app"), false);
  assert.equal(writeBlockReason("ensure_asc_app", {}, { APPSTORE_MCP_READ_ONLY: "true" }), null);
});
