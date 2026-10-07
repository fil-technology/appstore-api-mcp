import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isWriteTool, writeBlockReason } from "../src/guardrails.js";

const NEW_WRITES = [
  // custom product pages
  "create_custom_product_page",
  "create_custom_product_page_version",
  "create_custom_product_page_localization",
  "update_custom_product_page_localization",
  // product page optimization
  "create_ppo_experiment",
  "start_ppo_experiment",
  "stop_ppo_experiment",
  "create_experiment_treatment",
  "create_experiment_treatment_localization",
  // asset library
  "upload_asset_library_image",
  "assign_asset_placement",
  "delete_asset_placement",
  // webhooks
  "create_webhook",
  "update_webhook",
  "delete_webhook",
  "ping_webhook",
  // offer codes
  "create_subscription_offer_code",
  "create_offer_code_one_time_use",
  "create_offer_code_custom",
  // in-app events
  "create_app_event",
  "create_app_event_localization",
];

const NEW_READS = [
  "list_custom_product_pages",
  "get_custom_product_page",
  "list_custom_product_page_versions",
  "list_custom_product_page_localizations",
  "list_ppo_experiments",
  "get_ppo_experiment",
  "list_experiment_treatments",
  "get_asset_library",
  "list_asset_library_images",
  "list_asset_library_videos",
  "list_webhooks",
  "get_webhook",
  "list_webhook_deliveries",
  "list_subscription_offer_codes",
  "list_offer_code_codes",
  "list_app_events",
  "get_app_event",
  "list_game_center_challenges",
  "get_game_center_challenge",
];

test("new marketing/growth write tools are gated by read-only mode", () => {
  for (const t of NEW_WRITES) {
    assert.ok(isWriteTool(t), `${t} should be a write tool`);
    assert.match(writeBlockReason(t, {}, { APPSTORE_MCP_READ_ONLY: "true" }), /READ-ONLY/);
  }
});

test("new marketing/growth read tools are never writes", () => {
  for (const t of NEW_READS) assert.equal(isWriteTool(t), false, `${t} should be read-only`);
});

test("every new marketing/growth tool is registered in index.js", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  for (const t of [...NEW_WRITES, ...NEW_READS])
    assert.ok(src.includes(`name: "${t}"`), `${t} is not registered`);
});

test("generalized set creators target CPP and treatment localizations", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.ok(src.includes("appCustomProductPageLocalization"), "screenshot/preview set should support CPP localizations");
  assert.ok(src.includes("appStoreVersionExperimentTreatmentLocalization"), "sets should support treatment localizations");
});
