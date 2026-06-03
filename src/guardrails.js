// Safe-mode guardrails: tool-level enforcement of read-only / category blocks.
// Extracted so it can be unit-tested without a live server.

// Tools that change App Store Connect state OR the user's local project.
export const WRITE_TOOLS = new Set([
  // listing metadata
  "update_app_info_localization",
  "create_app_info_localization",
  "create_app_store_version",
  "update_app_store_version_localization",
  "create_app_store_version_localization",
  "bulk_update_version_localizations",
  // screenshots
  "create_screenshot_set",
  "upload_screenshot",
  "delete_screenshot",
  // reviews
  "reply_to_customer_review",
  // testflight
  "add_beta_tester",
  "add_build_to_beta_group",
  "submit_beta_review",
  // catalog / pricing
  "update_in_app_purchase",
  "set_app_price",
  // provisioning
  "register_bundle_id",
  "register_device",
  "create_certificate",
  "revoke_certificate",
  "create_profile",
  "delete_profile",
  // submission / release
  "submit_for_review",
  "release_version",
  "set_phased_release",
  // build & ship (modify project / upload)
  "bump_build_number",
  "upload_build",
  // snapshots
  "restore_app_metadata",
  "restore_screenshots",
]);

// High-impact categories with their own opt-out env flags.
export const CATEGORY_TOOLS = {
  RELEASE: new Set(["release_version", "set_phased_release"]),
  PRICE_CHANGES: new Set(["set_app_price"]),
  REVIEW_REPLIES: new Set(["reply_to_customer_review"]),
  EXTERNAL_TESTFLIGHT: new Set(["submit_beta_review"]),
};

/** Parse an env var as a boolean, with a default when unset/blank. */
export function envBool(value, dflt = false) {
  if (value === undefined || value === null || value === "") return dflt;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

/** Is this tool call a write? raw_request is a write unless the method is GET. */
export function isWriteTool(name, args = {}) {
  if (name === "raw_request") {
    const m = (args.method || "GET").toUpperCase();
    return m !== "GET";
  }
  return WRITE_TOOLS.has(name);
}

/**
 * Return a human-readable reason this tool call is blocked by the current env,
 * or null if it's allowed. `env` defaults to process.env.
 */
export function writeBlockReason(name, args = {}, env = process.env) {
  if (!isWriteTool(name, args)) return null;
  if (envBool(env.APPSTORE_MCP_READ_ONLY)) {
    return "Blocked: the server is in READ-ONLY mode (APPSTORE_MCP_READ_ONLY=true). Unset it to allow writes.";
  }
  const gates = [
    ["RELEASE", "APPSTORE_MCP_ALLOW_RELEASE", "releasing a version"],
    ["PRICE_CHANGES", "APPSTORE_MCP_ALLOW_PRICE_CHANGES", "changing prices"],
    ["REVIEW_REPLIES", "APPSTORE_MCP_ALLOW_REVIEW_REPLIES", "posting public review replies"],
    ["EXTERNAL_TESTFLIGHT", "APPSTORE_MCP_ALLOW_EXTERNAL_TESTFLIGHT", "submitting external TestFlight review"],
  ];
  for (const [cat, flag, label] of gates) {
    if (CATEGORY_TOOLS[cat].has(name) && envBool(env[flag], true) === false) {
      return `Blocked: ${label} is disabled (${flag}=false). Set ${flag}=true to allow it.`;
    }
  }
  return null;
}

/** Summarize the current write-mode for the doctor tool. */
export function writeModeSummary(env = process.env) {
  return {
    readOnly: envBool(env.APPSTORE_MCP_READ_ONLY),
    allowRelease: envBool(env.APPSTORE_MCP_ALLOW_RELEASE, true),
    allowPriceChanges: envBool(env.APPSTORE_MCP_ALLOW_PRICE_CHANGES, true),
    allowReviewReplies: envBool(env.APPSTORE_MCP_ALLOW_REVIEW_REPLIES, true),
    allowExternalTestflight: envBool(env.APPSTORE_MCP_ALLOW_EXTERNAL_TESTFLIGHT, true),
  };
}
