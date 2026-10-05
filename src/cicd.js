// iOS CI/CD → TestFlight bootstrap: template rendering + project auto-detection.
//
// Pure logic only (string templating + filesystem reads). The git/gh/ASC side
// effects live in index.js, which has the shell-out (`runCmd`) and ASC client.
//
// The pipeline is the same one shipped by hand in fil-technology/okcircle:
// two GitHub Actions workflows driving fastlane, Xcode automatic ("cloud")
// signing via -allowProvisioningUpdates (no `match` repo), and a build number
// computed as latest-TestFlight-build + 1.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename, relative, dirname, sep } from "node:path";

// Pinned toolchain — matches the okcircle reference. Bump here in one place.
const RUNNER = "macos-15";
const XCODE_PATH = "/Applications/Xcode_16.app";
const RUBY_VERSION = "3.3";

/** Path globs / working-dir derived from where the app lives in the repo. */
function paths(appDir) {
  const root = appDir === "." || appDir === "";
  return {
    workDir: root ? "." : appDir,
    glob: root ? "**" : `${appDir}/**`,
    gemfile: root ? "Gemfile" : `${appDir}/Gemfile`,
    fastlaneDir: root ? "fastlane" : `${appDir}/fastlane`,
    reportXml: root ? "fastlane/report.xml" : `${appDir}/fastlane/report.xml`,
  };
}

/**
 * Render the seven pipeline files. Returns { "<repo-relative path>": contents }.
 * `vars`: { appDir, projectName, scheme, target, bundleId, teamId }.
 */
export function renderTemplates(vars) {
  const { appDir, projectName, scheme, target, bundleId, teamId } = vars;
  const p = paths(appDir);
  const project = `${projectName}.xcodeproj`;
  const files = {};

  files[".github/workflows/ios-ci.yml"] = `name: iOS CI

# Fast compile check on every PR / push that touches the app. No secrets and no
# code signing — it just proves the project still builds.
on:
  push:
    branches: [main]
    paths:
      - "${p.glob}"
      - ".github/workflows/ios-ci.yml"
  pull_request:
    paths:
      - "${p.glob}"
      - ".github/workflows/ios-ci.yml"

concurrency:
  group: ios-ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    runs-on: ${RUNNER}
    timeout-minutes: 30
    defaults:
      run:
        working-directory: ${p.workDir}
    steps:
      - uses: actions/checkout@v4

      - name: Select Xcode
        run: sudo xcode-select -s ${XCODE_PATH}

      - name: Set up Ruby
        uses: ruby/setup-ruby@v1
        with:
          ruby-version: "${RUBY_VERSION}"
          bundler-cache: true
          working-directory: ${p.workDir}

      - name: Build for simulator
        run: bundle exec fastlane ci_build
`;

  files[".github/workflows/ios-testflight.yml"] = `name: iOS TestFlight

# Ships a signed build to TestFlight. Runs on demand (Actions → Run workflow) and
# automatically when app code lands on main. Requires the ASC_* secrets below.
on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - "${p.glob}"
      - ".github/workflows/ios-testflight.yml"

# Never run two TestFlight uploads at once (build-number collisions).
concurrency:
  group: ios-testflight
  cancel-in-progress: false

jobs:
  testflight:
    runs-on: ${RUNNER}
    timeout-minutes: 45
    defaults:
      run:
        working-directory: ${p.workDir}
    steps:
      - uses: actions/checkout@v4

      - name: Select Xcode
        run: sudo xcode-select -s ${XCODE_PATH}

      - name: Set up Ruby
        uses: ruby/setup-ruby@v1
        with:
          ruby-version: "${RUBY_VERSION}"
          bundler-cache: true
          working-directory: ${p.workDir}

      - name: Build & upload to TestFlight
        run: bundle exec fastlane beta
        env:
          ASC_KEY_ID: \${{ secrets.ASC_KEY_ID }}
          ASC_ISSUER_ID: \${{ secrets.ASC_ISSUER_ID }}
          ASC_KEY_P8: \${{ secrets.ASC_KEY_P8 }}
          # Give xcodebuild's settings probe extra time on cold CI runners.
          FASTLANE_XCODEBUILD_SETTINGS_TIMEOUT: "120"

      - name: Upload build logs on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: build-logs
          path: |
            ~/Library/Logs/gym
            ${p.reportXml}
          if-no-files-found: ignore
`;

  files[p.gemfile] = `source "https://rubygems.org"

gem "fastlane"
`;

  files[`${p.fastlaneDir}/Appfile`] = `app_identifier("${bundleId}")
team_id("${teamId}") # Apple Developer portal team

# Authentication is via an App Store Connect API key (see Fastfile / CI secrets),
# so no apple_id / itc_team is required here.
`;

  files[`${p.fastlaneDir}/Fastfile`] = `default_platform(:ios)

PROJECT    = "${project}"
SCHEME     = "${scheme}"
TARGET     = "${target}"
BUNDLE_ID  = "${bundleId}"
TEAM_ID    = "${teamId}"

platform :ios do
  # ---------------------------------------------------------------------------
  # PR / push sanity check: does the app still compile? Builds for the simulator,
  # which needs no code signing and therefore no secrets.
  # ---------------------------------------------------------------------------
  desc "Compile the app for the simulator (no signing / no secrets)"
  lane :ci_build do
    build_app(
      project: PROJECT,
      scheme: SCHEME,
      configuration: "Debug",
      destination: "generic/platform=iOS Simulator",
      skip_archive: true,
      skip_codesigning: true,
      skip_package_ipa: true
    )
  end

  # ---------------------------------------------------------------------------
  # Build a signed Release archive and ship it to TestFlight.
  #
  # Signing uses Xcode automatic ("cloud") signing driven by the App Store
  # Connect API key (-allowProvisioningUpdates), so there is no certificate or
  # provisioning-profile repo to manage. The same API key authenticates the
  # TestFlight upload.
  #
  # The build number is computed as (latest TestFlight build for this marketing
  # version) + 1, so uploads never collide and no manual pbxproj bump is needed.
  # ---------------------------------------------------------------------------
  desc "Build and upload a new build to TestFlight"
  lane :beta do
    setup_ci # ephemeral keychain when running on CI; no-op locally

    api_key = app_store_connect_api_key(
      key_id: ENV.fetch("ASC_KEY_ID"),
      issuer_id: ENV.fetch("ASC_ISSUER_ID"),
      key_content: ENV.fetch("ASC_KEY_P8"),
      is_key_content_base64: true,
      in_house: false
    )

    version = get_version_number(xcodeproj: PROJECT, target: TARGET)
    next_build = latest_testflight_build_number(
      api_key: api_key,
      app_identifier: BUNDLE_ID,
      version: version,
      initial_build_number: 0
    ) + 1
    increment_build_number(build_number: next_build, xcodeproj: PROJECT)
    UI.message("Building #{version} (#{next_build}) for TestFlight")

    build_app(
      project: PROJECT,
      scheme: SCHEME,
      configuration: "Release",
      export_method: "app-store",
      xcargs: "-allowProvisioningUpdates",
      export_options: {
        signingStyle: "automatic",
        teamID: TEAM_ID
      }
    )

    upload_to_testflight(
      api_key: api_key,
      app_identifier: BUNDLE_ID,
      skip_waiting_for_build_processing: true,
      distribute_external: false
    )
  end
end
`;

  files[`${p.fastlaneDir}/.gitignore`] = `README.md
report.xml
Preview.html
*.mobileprovision
*.cer
*.p12
*.p8
test_output/
`;

  files[`${p.fastlaneDir}/SETUP.md`] = `# iOS CI / TestFlight

Two GitHub Actions workflows live in \`.github/workflows/\`:

| Workflow             | Trigger                                  | Signing | Secrets |
|----------------------|------------------------------------------|---------|---------|
| \`ios-ci.yml\`         | PRs + pushes to \`main\` touching the app | none (simulator build) | none |
| \`ios-testflight.yml\` | manual (**Run workflow**) + push to \`main\` | Xcode automatic / cloud | \`ASC_*\` |

Both run on \`${RUNNER}\` and drive [fastlane](https://fastlane.tools) (\`${p.fastlaneDir}/Fastfile\`).

## One-time setup

### 1. App Store Connect API key — create it once at the TEAM level

App Store Connect → Users and Access → **Integrations** → App Store Connect API.
Create a **team** key (not an individual key) with the **App Manager** role, so the
same three secret values work for *every* app in the account. Download the \`.p8\`
(you only get one chance) and note the **Key ID** and the team-level **Issuer ID**.

### 2. Add three repository secrets

Settings → Secrets and variables → Actions → **New repository secret** (or let
the \`set_repo_ci_secrets\` MCP tool push them for you):

| Secret          | Value                                                    |
|-----------------|----------------------------------------------------------|
| \`ASC_KEY_ID\`    | the Key ID (e.g. \`ABC123XYZ\`)                            |
| \`ASC_ISSUER_ID\` | the Issuer ID (a UUID)                                   |
| \`ASC_KEY_P8\`    | the \`.p8\` contents, **base64-encoded** (see below)      |

\`\`\`bash
base64 -i AuthKey_ABC123XYZ.p8 | pbcopy   # paste as ASC_KEY_P8
\`\`\`

### 3. Prerequisite on the Apple side

The app record for \`${bundleId}\` must already exist in App Store Connect. The
public API cannot create it — create it once in the App Store Connect web UI
(the bundle ID can be registered with the \`register_bundle_id\` tool first).

## How it works

- **Signing:** automatic ("cloud") signing via \`-allowProvisioningUpdates\`,
  authenticated by the API key — Apple manages the distribution certificate and
  provisioning profile, so there is no \`match\` repo or \`.p12\`/profile to maintain.
- **Build number:** computed as the latest TestFlight build for the current
  marketing version **+ 1**. Manual \`CURRENT_PROJECT_VERSION\` bumps in the
  project are no longer needed for shipping — CI sets a unique number per upload.
  Bump \`MARKETING_VERSION\` (e.g. 1.0 → 1.1) when you want a new version train.

## Run it locally

\`\`\`bash
cd ${p.workDir}
bundle install
export ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_P8="$(base64 -i AuthKey_*.p8)"
bundle exec fastlane beta
\`\`\`

## If cloud signing gives you trouble

Automatic signing on CI occasionally fails for apps with several capabilities.
The fallback is [\`fastlane match\`](https://docs.fastlane.tools/actions/match/)
with a private certificates repo and manual signing — ask and it can be wired in.
`;

  return files;
}

// ---- Project auto-detection -------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules", ".git", "Pods", "Carthage", "DerivedData", "build", ".build",
]);

/** Recursively find .xcodeproj bundles under root (shallow-ish, skips junk). */
function findXcodeprojs(root, depth = 0, acc = []) {
  if (depth > 4) return acc;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.endsWith(".xcodeproj")) {
      acc.push(join(root, e.name));
      continue; // don't descend into the project bundle
    }
    if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
    findXcodeprojs(join(root, e.name), depth + 1, acc);
  }
  return acc;
}

/** Most frequent value in a list (ties → first seen). */
function mostCommon(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

function unquote(s) {
  return s.trim().replace(/^["']|["']$/g, "").trim();
}

/**
 * Scan project.pbxproj for bundle ids and the development team.
 * Test targets and build-variable placeholders are filtered out.
 */
function scanPbxproj(xcodeprojPath) {
  const pbx = join(xcodeprojPath, "project.pbxproj");
  let text = "";
  try {
    text = readFileSync(pbx, "utf8");
  } catch {
    return { bundleId: null, teamId: null, bundleCandidates: [] };
  }
  const bundles = [];
  for (const m of text.matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;]+);/g)) {
    const v = unquote(m[1]);
    if (!v || v.includes("$(")) continue; // skip placeholders
    if (/tests?$/i.test(v) || /\.(test|uitest)/i.test(v)) continue; // skip test targets
    bundles.push(v);
  }
  const teams = [];
  for (const m of text.matchAll(/DEVELOPMENT_TEAM\s*=\s*([^;]+);/g)) {
    const v = unquote(m[1]);
    if (v && v !== '""' && !v.includes("$(")) teams.push(v);
  }
  return {
    bundleId: mostCommon(bundles),
    teamId: mostCommon(teams),
    bundleCandidates: [...new Set(bundles)],
  };
}

/**
 * Detect appDir / projectName / scheme / target / bundleId / teamId for a repo.
 * Explicit `provided` values always win. Returns { detected, missing, warnings }.
 *   detected: the resolved vars (some may be null if undetectable)
 *   missing:  names of required fields still unresolved (bundleId / teamId)
 *   warnings: human-readable notes (multiple projects, workspace present, …)
 */
export function detectProject(repoRoot, provided = {}) {
  const warnings = [];
  const projects = findXcodeprojs(repoRoot);
  if (projects.length === 0 && !provided.appDir) {
    return {
      detected: { ...provided },
      missing: ["xcodeproj"],
      warnings: ["No .xcodeproj found under the repo — pass appDir/scheme/bundleId/teamId explicitly."],
    };
  }

  // Pick a project: prefer the shallowest path (closest to repo root).
  let projectPath = null;
  if (projects.length) {
    projectPath = projects.sort(
      (a, b) => a.split(sep).length - b.split(sep).length,
    )[0];
    if (projects.length > 1)
      warnings.push(
        `Multiple .xcodeproj found; using ${relative(repoRoot, projectPath)}. Override with appDir/scheme if wrong.`,
      );
  }

  let appDir = provided.appDir;
  let projectName = provided.projectName;
  if (projectPath) {
    const rel = relative(repoRoot, dirname(projectPath)) || ".";
    if (!appDir) appDir = rel === "" ? "." : rel;
    if (!projectName) projectName = basename(projectPath, ".xcodeproj");
    // Warn if a workspace sits alongside (CocoaPods/SPM) — we build the project.
    try {
      const sibling = readdirSync(dirname(projectPath)).find((f) =>
        f.endsWith(".xcworkspace"),
      );
      if (sibling)
        warnings.push(
          `A ${sibling} exists; the Fastfile builds the .xcodeproj directly. If the app needs the workspace (CocoaPods), switch build_app to use \`workspace:\`.`,
        );
    } catch {
      /* ignore */
    }
  }

  const scanned = projectPath ? scanPbxproj(projectPath) : {};
  const bundleId = provided.bundleId || scanned.bundleId || null;
  const teamId = provided.teamId || scanned.teamId || null;
  if (
    scanned.bundleCandidates &&
    scanned.bundleCandidates.length > 1 &&
    !provided.bundleId
  )
    warnings.push(
      `Multiple bundle ids in the project (${scanned.bundleCandidates.join(", ")}); picked ${bundleId}. Override bundleId if wrong.`,
    );

  const detected = {
    appDir: appDir || ".",
    projectName: projectName || null,
    scheme: provided.scheme || projectName || null,
    target: provided.target || provided.scheme || projectName || null,
    bundleId,
    teamId,
  };
  const missing = [];
  if (!detected.projectName) missing.push("scheme");
  if (!detected.bundleId) missing.push("bundleId");
  if (!detected.teamId) missing.push("teamId");
  return { detected, missing, warnings };
}

/** True if any pipeline file already exists in the repo (for safe overwrite UX). */
export function existingPipelineFiles(repoRoot, files) {
  return Object.keys(files).filter((rel) => existsSync(join(repoRoot, rel)));
}

/** Parse owner/name from a git remote URL (ssh or https forms). */
export function parseRepoSlug(remoteUrl) {
  if (!remoteUrl) return null;
  const u = remoteUrl.trim();
  // git@github.com:owner/name.git  or  ssh://git@github.com/owner/name.git
  let m = u.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
  if (m) return `${m[1]}/${m[2]}`;
  return null;
}
