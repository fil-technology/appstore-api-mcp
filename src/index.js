#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AppStoreConnectClient } from "./client.js";

const client = new AppStoreConnectClient({
  keyId: process.env.ASC_KEY_ID,
  issuerId: process.env.ASC_ISSUER_ID,
  privateKeyPath: process.env.ASC_PRIVATE_KEY_PATH,
  privateKey: process.env.ASC_PRIVATE_KEY,
  privateKeyBase64: process.env.ASC_PRIVATE_KEY_BASE64,
});

const ok = (data) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});
const fail = (e) => ({
  content: [{ type: "text", text: `Error: ${e.message}` }],
  isError: true,
});

// ---- Shared helpers (validation, diff, concurrency) -------------------------

// Apple's documented length limits for editable metadata fields.
const LIMITS = {
  name: 30,
  subtitle: 30,
  keywords: 100,
  promotionalText: 170,
  description: 4000,
  whatsNew: 4000,
};

/** Warn about fields that exceed Apple's limits. Non-blocking. */
function validateAttributes(attributes) {
  const warnings = [];
  for (const [field, value] of Object.entries(attributes)) {
    const limit = LIMITS[field];
    if (limit && typeof value === "string" && value.length > limit) {
      warnings.push(
        `'${field}' is ${value.length} chars — exceeds Apple's limit of ${limit}.`,
      );
    }
  }
  return warnings;
}

/**
 * Build a field-by-field diff between current attributes and proposed changes,
 * including length/limit info. Used by dry-run mode.
 */
function buildDiff(current = {}, attributes) {
  const changes = [];
  for (const [field, to] of Object.entries(attributes)) {
    const from = current[field] ?? null;
    const limit = LIMITS[field];
    changes.push({
      field,
      from,
      to,
      changed: from !== to,
      ...(limit
        ? {
            newLength: typeof to === "string" ? to.length : null,
            limit,
            exceedsLimit:
              typeof to === "string" ? to.length > limit : false,
          }
        : {}),
    });
  }
  return changes;
}

/**
 * Dry-run vs apply for an update. When dryRun is true, fetch current values,
 * return a diff + warnings, and write nothing. Otherwise PATCH and return the
 * result (with any validation warnings attached).
 */
async function previewOrApply({ dryRun, fetchCurrent, attributes, apply, id }) {
  const warnings = validateAttributes(attributes);
  if (dryRun) {
    let current = {};
    try {
      const res = await fetchCurrent();
      current = res?.data?.attributes || {};
    } catch {
      /* fall back to empty current if the read fails */
    }
    return {
      dryRun: true,
      id,
      changes: buildDiff(current, attributes),
      warnings,
      note: "No changes were written. Re-run without dryRun to apply.",
    };
  }
  const result = await apply();
  return warnings.length ? { ...result, _warnings: warnings } : result;
}

/** Run `fn` over `items` with limited concurrency, preserving order. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

// App Store version states in which listing metadata is editable.
const EDITABLE_VERSION_STATES = new Set([
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
  "INVALID_BINARY",
]);

// ---- Tool definitions -------------------------------------------------------

const tools = [
  {
    name: "list_apps",
    description:
      "List all apps in your App Store Connect account. Returns id, name, bundleId, sku, primaryLocale. Use the app id with the other tools.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max apps (default 100)" },
        filterBundleId: {
          type: "string",
          description: "Optional exact bundle id filter",
        },
      },
    },
    run: async (a) => {
      const query = { limit: a.limit ?? 100 };
      if (a.filterBundleId) query["filter[bundleId]"] = a.filterBundleId;
      const apps = await client.getAll("/apps", query);
      return apps.map((x) => ({ id: x.id, ...x.attributes }));
    },
  },
  {
    name: "get_app",
    description: "Get a single app's details by its App Store Connect id.",
    inputSchema: {
      type: "object",
      properties: { appId: { type: "string" } },
      required: ["appId"],
    },
    run: async (a) => client.get(`/apps/${a.appId}`),
  },

  // ---- App-level info (name / subtitle / privacy policy) ----
  {
    name: "list_app_infos",
    description:
      "List the appInfo records for an app. Each appInfo holds the localizations for the app NAME, SUBTITLE and privacy policy. There is typically one editable (state not READY_FOR_SALE) appInfo. Use its id with list_app_info_localizations.",
    inputSchema: {
      type: "object",
      properties: { appId: { type: "string" } },
      required: ["appId"],
    },
    run: async (a) => {
      const data = await client.getAll(`/apps/${a.appId}/appInfos`);
      return data.map((x) => ({ id: x.id, ...x.attributes }));
    },
  },
  {
    name: "list_app_info_localizations",
    description:
      "List localizations of an appInfo. Each one holds the app NAME, SUBTITLE, privacyPolicyUrl and privacyPolicyText for a given locale.",
    inputSchema: {
      type: "object",
      properties: { appInfoId: { type: "string" } },
      required: ["appInfoId"],
    },
    run: async (a) => {
      const data = await client.getAll(
        `/appInfos/${a.appInfoId}/appInfoLocalizations`,
      );
      return data.map((x) => ({ id: x.id, ...x.attributes }));
    },
  },
  {
    name: "update_app_info_localization",
    description:
      "Update the app NAME, SUBTITLE, privacy policy for one locale. Pass the appInfoLocalization id (from list_app_info_localizations). Only include the fields you want to change. Set dryRun:true to preview the diff (old→new + length checks) without writing anything.",
    inputSchema: {
      type: "object",
      properties: {
        localizationId: { type: "string" },
        name: { type: "string", description: "App name (max 30 chars)" },
        subtitle: { type: "string", description: "Subtitle (max 30 chars)" },
        privacyPolicyUrl: { type: "string" },
        privacyPolicyText: { type: "string" },
        dryRun: {
          type: "boolean",
          description: "Preview changes without writing (default false)",
        },
      },
      required: ["localizationId"],
    },
    run: async (a) => {
      const attributes = {};
      for (const k of [
        "name",
        "subtitle",
        "privacyPolicyUrl",
        "privacyPolicyText",
      ])
        if (a[k] !== undefined) attributes[k] = a[k];
      return previewOrApply({
        dryRun: a.dryRun,
        id: a.localizationId,
        attributes,
        fetchCurrent: () =>
          client.get(`/appInfoLocalizations/${a.localizationId}`),
        apply: () =>
          client.patch(`/appInfoLocalizations/${a.localizationId}`, {
            data: {
              type: "appInfoLocalizations",
              id: a.localizationId,
              attributes,
            },
          }),
      });
    },
  },
  {
    name: "create_app_info_localization",
    description:
      "Add a new locale's name/subtitle/privacy policy to an appInfo (for a locale that doesn't exist yet).",
    inputSchema: {
      type: "object",
      properties: {
        appInfoId: { type: "string" },
        locale: { type: "string", description: "e.g. 'fr-FR', 'de-DE'" },
        name: { type: "string" },
        subtitle: { type: "string" },
        privacyPolicyUrl: { type: "string" },
        privacyPolicyText: { type: "string" },
      },
      required: ["appInfoId", "locale"],
    },
    run: async (a) => {
      const attributes = { locale: a.locale };
      for (const k of ["name", "subtitle", "privacyPolicyUrl", "privacyPolicyText"])
        if (a[k] !== undefined) attributes[k] = a[k];
      return client.post(`/appInfoLocalizations`, {
        data: {
          type: "appInfoLocalizations",
          attributes,
          relationships: {
            appInfo: { data: { type: "appInfos", id: a.appInfoId } },
          },
        },
      });
    },
  },

  // ---- Versions ----
  {
    name: "list_app_store_versions",
    description:
      "List App Store versions for an app (e.g. 1.2.0). Filter by state to find the editable one (PREPARE_FOR_SUBMISSION etc.).",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string" },
        filterState: {
          type: "string",
          description:
            "Optional appStoreState filter, e.g. PREPARE_FOR_SUBMISSION, READY_FOR_SALE",
        },
        filterPlatform: {
          type: "string",
          description: "IOS, MAC_OS, TV_OS, VISION_OS",
        },
      },
      required: ["appId"],
    },
    run: async (a) => {
      const query = {};
      if (a.filterState) query["filter[appStoreState]"] = a.filterState;
      if (a.filterPlatform) query["filter[platform]"] = a.filterPlatform;
      const data = await client.getAll(
        `/apps/${a.appId}/appStoreVersions`,
        query,
      );
      return data.map((x) => ({ id: x.id, ...x.attributes }));
    },
  },
  {
    name: "create_app_store_version",
    description:
      "Create a new App Store version for an app (a new version string to prepare for submission).",
    inputSchema: {
      type: "object",
      properties: {
        appId: { type: "string" },
        versionString: { type: "string", description: "e.g. '1.3.0'" },
        platform: {
          type: "string",
          description: "IOS (default), MAC_OS, TV_OS, VISION_OS",
        },
      },
      required: ["appId", "versionString"],
    },
    run: async (a) =>
      client.post(`/appStoreVersions`, {
        data: {
          type: "appStoreVersions",
          attributes: {
            platform: a.platform || "IOS",
            versionString: a.versionString,
          },
          relationships: {
            app: { data: { type: "apps", id: a.appId } },
          },
        },
      }),
  },

  // ---- Version localizations (description, keywords, etc.) ----
  {
    name: "list_app_store_version_localizations",
    description:
      "List the per-locale localizations of an App Store version. Each holds: description, keywords, promotionalText, whatsNew, marketingUrl, supportUrl. Use the localization id to read/update copy and to find screenshot sets.",
    inputSchema: {
      type: "object",
      properties: { versionId: { type: "string" } },
      required: ["versionId"],
    },
    run: async (a) => {
      const data = await client.getAll(
        `/appStoreVersions/${a.versionId}/appStoreVersionLocalizations`,
      );
      return data.map((x) => ({ id: x.id, ...x.attributes }));
    },
  },
  {
    name: "get_app_store_version_localization",
    description:
      "Get one App Store version localization (description, keywords, promotional text, what's new, URLs) by its id.",
    inputSchema: {
      type: "object",
      properties: { localizationId: { type: "string" } },
      required: ["localizationId"],
    },
    run: async (a) =>
      client.get(`/appStoreVersionLocalizations/${a.localizationId}`),
  },
  {
    name: "update_app_store_version_localization",
    description:
      "Update KEYWORDS, DESCRIPTION, promotional text, what's new, marketing/support URLs for one locale. Pass the appStoreVersionLocalization id. Keywords is a comma-separated string, max 100 chars total. Only include fields you want to change. Set dryRun:true to preview the diff (old→new + length checks) without writing anything.",
    inputSchema: {
      type: "object",
      properties: {
        localizationId: { type: "string" },
        keywords: {
          type: "string",
          description: "Comma-separated, max 100 chars total. e.g. 'todo,tasks,planner'",
        },
        description: { type: "string", description: "Max 4000 chars" },
        promotionalText: { type: "string", description: "Max 170 chars" },
        whatsNew: {
          type: "string",
          description: "Release notes / what's new, max 4000 chars",
        },
        marketingUrl: { type: "string" },
        supportUrl: { type: "string" },
        dryRun: {
          type: "boolean",
          description: "Preview changes without writing (default false)",
        },
      },
      required: ["localizationId"],
    },
    run: async (a) => {
      const attributes = {};
      for (const k of [
        "keywords",
        "description",
        "promotionalText",
        "whatsNew",
        "marketingUrl",
        "supportUrl",
      ])
        if (a[k] !== undefined) attributes[k] = a[k];
      return previewOrApply({
        dryRun: a.dryRun,
        id: a.localizationId,
        attributes,
        fetchCurrent: () =>
          client.get(`/appStoreVersionLocalizations/${a.localizationId}`),
        apply: () =>
          client.patch(
            `/appStoreVersionLocalizations/${a.localizationId}`,
            {
              data: {
                type: "appStoreVersionLocalizations",
                id: a.localizationId,
                attributes,
              },
            },
          ),
      });
    },
  },
  {
    name: "create_app_store_version_localization",
    description:
      "Add a new locale to an App Store version with its description/keywords/etc.",
    inputSchema: {
      type: "object",
      properties: {
        versionId: { type: "string" },
        locale: { type: "string", description: "e.g. 'de-DE'" },
        description: { type: "string" },
        keywords: { type: "string" },
        promotionalText: { type: "string" },
        whatsNew: { type: "string" },
        marketingUrl: { type: "string" },
        supportUrl: { type: "string" },
      },
      required: ["versionId", "locale"],
    },
    run: async (a) => {
      const attributes = { locale: a.locale };
      for (const k of [
        "description",
        "keywords",
        "promotionalText",
        "whatsNew",
        "marketingUrl",
        "supportUrl",
      ])
        if (a[k] !== undefined) attributes[k] = a[k];
      return client.post(`/appStoreVersionLocalizations`, {
        data: {
          type: "appStoreVersionLocalizations",
          attributes,
          relationships: {
            appStoreVersion: {
              data: { type: "appStoreVersions", id: a.versionId },
            },
          },
        },
      });
    },
  },

  // ---- Screenshots ----
  {
    name: "list_screenshot_sets",
    description:
      "List screenshot sets for an App Store version localization. Each set is tied to one device size (screenshotDisplayType, e.g. APP_IPHONE_67). Use a set id to list or upload screenshots.",
    inputSchema: {
      type: "object",
      properties: { localizationId: { type: "string" } },
      required: ["localizationId"],
    },
    run: async (a) => {
      const data = await client.getAll(
        `/appStoreVersionLocalizations/${a.localizationId}/appScreenshotSets`,
      );
      return data.map((x) => ({ id: x.id, ...x.attributes }));
    },
  },
  {
    name: "create_screenshot_set",
    description:
      "Create a screenshot set for a given device display type on a version localization. displayType examples: APP_IPHONE_67, APP_IPHONE_65, APP_IPHONE_61, APP_IPAD_PRO_129, APP_IPAD_PRO_3GEN_11.",
    inputSchema: {
      type: "object",
      properties: {
        localizationId: { type: "string" },
        displayType: { type: "string" },
      },
      required: ["localizationId", "displayType"],
    },
    run: async (a) =>
      client.post(`/appScreenshotSets`, {
        data: {
          type: "appScreenshotSets",
          attributes: { screenshotDisplayType: a.displayType },
          relationships: {
            appStoreVersionLocalization: {
              data: {
                type: "appStoreVersionLocalizations",
                id: a.localizationId,
              },
            },
          },
        },
      }),
  },
  {
    name: "list_screenshots",
    description: "List the screenshots in a screenshot set.",
    inputSchema: {
      type: "object",
      properties: { screenshotSetId: { type: "string" } },
      required: ["screenshotSetId"],
    },
    run: async (a) => {
      const data = await client.getAll(
        `/appScreenshotSets/${a.screenshotSetId}/appScreenshots`,
      );
      return data.map((x) => ({ id: x.id, ...x.attributes }));
    },
  },
  {
    name: "upload_screenshot",
    description:
      "Upload a screenshot image file into a screenshot set. Handles the full reserve→upload→commit flow. Provide an absolute path to a PNG/JPEG on disk. The image must match the set's device dimensions.",
    inputSchema: {
      type: "object",
      properties: {
        screenshotSetId: { type: "string" },
        filePath: {
          type: "string",
          description: "Absolute path to the image file",
        },
        fileName: {
          type: "string",
          description: "Optional override for the stored file name",
        },
      },
      required: ["screenshotSetId", "filePath"],
    },
    run: async (a) => {
      const buf = readFileSync(a.filePath);
      const fileName = a.fileName || basename(a.filePath);
      // 1. Reserve
      const reservation = await client.post(`/appScreenshots`, {
        data: {
          type: "appScreenshots",
          attributes: { fileName, fileSize: buf.length },
          relationships: {
            appScreenshotSet: {
              data: { type: "appScreenshotSets", id: a.screenshotSetId },
            },
          },
        },
      });
      const id = reservation.data.id;
      const ops = reservation.data.attributes.uploadOperations;
      // 2. Upload bytes
      await client.uploadAsset(ops, buf);
      // 3. Commit with checksum
      const committed = await client.patch(`/appScreenshots/${id}`, {
        data: {
          type: "appScreenshots",
          id,
          attributes: {
            uploaded: true,
            sourceFileChecksum: AppStoreConnectClient.md5(buf),
          },
        },
      });
      return committed;
    },
  },
  {
    name: "delete_screenshot",
    description: "Delete a screenshot by its id.",
    inputSchema: {
      type: "object",
      properties: { screenshotId: { type: "string" } },
      required: ["screenshotId"],
    },
    run: async (a) => {
      await client.delete(`/appScreenshots/${a.screenshotId}`);
      return { deleted: a.screenshotId };
    },
  },

  // ---- Fleet-wide ASO health check ----
  {
    name: "audit_apps",
    description:
      "Fleet health check across ALL your apps (or a subset). For each app it inspects the editable App Store version + app info and flags listing/ASO issues: missing subtitle, missing/empty keywords, under-used keyword field (ASO opportunity), missing description, missing promotional text, missing what's-new, no editable version, single-locale-only, and (optionally) missing screenshots. Returns per-app findings plus an account-wide summary. Read-only — writes nothing. Ideal for indie devs managing many apps.",
    inputSchema: {
      type: "object",
      properties: {
        appIds: {
          type: "array",
          items: { type: "string" },
          description: "Limit the audit to these app ids (default: all apps)",
        },
        limit: {
          type: "number",
          description: "Audit at most this many apps (default: all)",
        },
        checkScreenshots: {
          type: "boolean",
          description:
            "Also check the primary locale for missing screenshots (slower — extra API calls). Default false.",
        },
        keywordUseThreshold: {
          type: "number",
          description:
            "Flag the keyword field as under-used below this many chars (default 70 of 100).",
        },
      },
    },
    run: async (a) => {
      const threshold = a.keywordUseThreshold ?? 70;
      // 1. Gather the app list.
      let apps = await client.getAll("/apps", { limit: 200 });
      if (a.appIds?.length)
        apps = apps.filter((x) => a.appIds.includes(x.id));
      if (a.limit) apps = apps.slice(0, a.limit);

      // 2. Audit each app with limited concurrency.
      const findings = await mapLimit(apps, 6, async (app) => {
        const issues = [];
        const add = (severity, code, message) =>
          issues.push({ severity, code, message });
        const primaryLocale = app.attributes.primaryLocale;
        try {
          // -- App info: name / subtitle --
          const appInfos = await client.getAll(
            `/apps/${app.id}/appInfos`,
          );
          if (appInfos.length) {
            const infoLocs = await client.getAll(
              `/appInfos/${appInfos[0].id}/appInfoLocalizations`,
            );
            const infoLoc =
              infoLocs.find((l) => l.attributes.locale === primaryLocale) ||
              infoLocs[0];
            if (infoLoc && !infoLoc.attributes.subtitle)
              add("opportunity", "missing_subtitle", "No subtitle set (free ASO keywords).");
          }

          // -- Versions: pick the editable one --
          const versions = await client.getAll(
            `/apps/${app.id}/appStoreVersions`,
            { limit: 20 },
          );
          const editable = versions.find((v) =>
            EDITABLE_VERSION_STATES.has(v.attributes.appStoreState),
          );
          if (!editable) {
            add(
              "info",
              "no_editable_version",
              "No version in an editable state — metadata can't be changed right now.",
            );
          } else {
            const locs = await client.getAll(
              `/appStoreVersions/${editable.id}/appStoreVersionLocalizations`,
            );
            if (locs.length <= 1)
              add(
                "opportunity",
                "single_locale",
                "Listing exists in only one locale — localizing can widen reach.",
              );
            const loc =
              locs.find((l) => l.attributes.locale === primaryLocale) ||
              locs[0];
            if (loc) {
              const at = loc.attributes;
              const kw = (at.keywords || "").trim();
              if (!kw)
                add("warning", "missing_keywords", "Keyword field is empty.");
              else if (kw.length < threshold)
                add(
                  "opportunity",
                  "keywords_underused",
                  `Keyword field uses only ${kw.length}/100 chars — room for more terms.`,
                );
              if (!at.description)
                add("warning", "missing_description", "No description set.");
              if (!at.promotionalText)
                add(
                  "info",
                  "missing_promotional_text",
                  "No promotional text (can be updated without a new version).",
                );
              if (!at.whatsNew)
                add("info", "missing_whats_new", "No what's-new / release notes.");

              if (a.checkScreenshots) {
                const sets = await client.getAll(
                  `/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`,
                );
                let total = 0;
                for (const s of sets) {
                  const shots = await client.getAll(
                    `/appScreenshotSets/${s.id}/appScreenshots`,
                  );
                  total += shots.length;
                }
                if (total === 0)
                  add(
                    "warning",
                    "missing_screenshots",
                    "No screenshots on the primary locale.",
                  );
              }
            }
          }
        } catch (e) {
          add("error", "audit_failed", `Could not fully audit: ${e.message}`);
        }
        return {
          appId: app.id,
          name: app.attributes.name,
          bundleId: app.attributes.bundleId,
          primaryLocale,
          issueCount: issues.length,
          issues,
        };
      });

      // 3. Account-wide summary.
      const byCode = {};
      let cleanApps = 0;
      for (const f of findings) {
        if (f.issueCount === 0) cleanApps++;
        for (const i of f.issues) byCode[i.code] = (byCode[i.code] || 0) + 1;
      }
      return {
        summary: {
          appsAudited: findings.length,
          appsWithNoIssues: cleanApps,
          appsWithIssues: findings.length - cleanApps,
          issuesByType: byCode,
          screenshotsChecked: !!a.checkScreenshots,
        },
        findings: findings.sort((x, y) => y.issueCount - x.issueCount),
      };
    },
  },

  // ---- Generic escape hatch ----
  {
    name: "raw_request",
    description:
      "Make a raw App Store Connect API call — use this for ANY endpoint not covered by a dedicated tool (app previews, pricing, TestFlight, in-app purchases, reviews, analytics, sales reports, etc.). path is relative (e.g. '/apps' or '/appStoreVersions/{id}') and '/v1' is added automatically; you can also pass a full https URL. See developer.apple.com/documentation/appstoreconnectapi.",
    inputSchema: {
      type: "object",
      properties: {
        method: {
          type: "string",
          enum: ["GET", "POST", "PATCH", "DELETE"],
        },
        path: { type: "string" },
        query: {
          type: "object",
          description: "Query params as a flat object",
          additionalProperties: true,
        },
        body: {
          type: "object",
          description: "JSON request body (for POST/PATCH)",
          additionalProperties: true,
        },
      },
      required: ["method", "path"],
    },
    run: async (a) =>
      client.request(a.method, a.path, { query: a.query, body: a.body }),
  },
];

const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));

// ---- Server wiring ----------------------------------------------------------

const server = new Server(
  { name: "appstore-connect", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = toolMap[req.params.name];
  if (!tool) return fail(new Error(`Unknown tool: ${req.params.name}`));
  try {
    const result = await tool.run(req.params.arguments || {});
    return ok(result);
  } catch (e) {
    return fail(e);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("App Store Connect MCP server running on stdio");
