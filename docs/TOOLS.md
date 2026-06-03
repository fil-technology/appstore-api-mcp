# Tool reference

Every tool the server exposes, with parameters and return shape. You normally
don't call these by hand — you ask the model in plain language and it picks the
right ones. This is for when you want the exact contract.

All tools return JSON (pretty-printed text). IDs are App Store Connect resource
ids (strings). Required params are marked **(required)**.

---

## Apps

### `list_apps`
List all apps in the account.
- `limit` — max apps (default 100)
- `filterBundleId` — exact bundle id filter
- **Returns:** array of `{ id, name, bundleId, sku, primaryLocale, ... }`

### `get_app`
Get one app's details.
- `appId` **(required)**

---

## App info — name, subtitle, privacy policy

These live on `appInfo` records, separate from version-specific copy.

### `list_app_infos`
List the appInfo records for an app. Usually one is editable.
- `appId` **(required)**

### `list_app_info_localizations`
List per-locale name/subtitle/privacy for an appInfo.
- `appInfoId` **(required)**
- **Returns:** array of `{ id, locale, name, subtitle, privacyPolicyUrl, privacyPolicyText }`

### `update_app_info_localization`
Update name/subtitle/privacy for one locale. Only pass fields you want to change.
- `localizationId` **(required)** — an appInfoLocalization id
- `name` — app name (max 30 chars)
- `subtitle` — subtitle (max 30 chars)
- `privacyPolicyUrl`
- `privacyPolicyText`
- `dryRun` — if true, **write nothing**; return a diff + length/limit checks (see [Dry-run mode](#dry-run-mode))

### `create_app_info_localization`
Add a brand-new locale's name/subtitle/privacy.
- `appInfoId` **(required)**
- `locale` **(required)** — e.g. `fr-FR`, `de-DE`
- `name`, `subtitle`, `privacyPolicyUrl`, `privacyPolicyText`

---

## Versions

### `list_app_store_versions`
List versions and states for an app.
- `appId` **(required)**
- `filterState` — e.g. `PREPARE_FOR_SUBMISSION`, `READY_FOR_SALE`
- `filterPlatform` — `IOS`, `MAC_OS`, `TV_OS`, `VISION_OS`

### `create_app_store_version`
Create a new version to prepare for submission.
- `appId` **(required)**
- `versionString` **(required)** — e.g. `1.3.0`
- `platform` — default `IOS`

---

## Version localizations — description, keywords, what's-new

### `list_app_store_version_localizations`
List per-locale listing copy for a version.
- `versionId` **(required)**
- **Returns:** array of `{ id, locale, description, keywords, promotionalText, whatsNew, marketingUrl, supportUrl }`

### `get_app_store_version_localization`
Read one locale's listing copy.
- `localizationId` **(required)**

### `update_app_store_version_localization`
Update keywords/description/etc. for one locale. Only pass fields to change.
- `localizationId` **(required)**
- `keywords` — comma-separated, **max 100 chars total** (e.g. `todo,tasks,planner`)
- `description` — max 4000 chars
- `promotionalText` — max 170 chars (editable without a new version)
- `whatsNew` — release notes, max 4000 chars
- `marketingUrl`
- `supportUrl`
- `dryRun` — if true, **write nothing**; return a diff + length/limit checks (see [Dry-run mode](#dry-run-mode))

### `create_app_store_version_localization`
Add a new locale to a version.
- `versionId` **(required)**
- `locale` **(required)**
- `description`, `keywords`, `promotionalText`, `whatsNew`, `marketingUrl`, `supportUrl`

---

## Screenshots

Screenshots are organized into **sets**, one per device display type, attached to
a version localization.

Common `displayType` values: `APP_IPHONE_67`, `APP_IPHONE_65`, `APP_IPHONE_61`,
`APP_IPHONE_55`, `APP_IPAD_PRO_129`, `APP_IPAD_PRO_3GEN_11`.

### `list_screenshot_sets`
- `localizationId` **(required)** — an appStoreVersionLocalization id

### `create_screenshot_set`
- `localizationId` **(required)**
- `displayType` **(required)**

### `list_screenshots`
- `screenshotSetId` **(required)**

### `get_screenshot`
Fetch the actual screenshot **image** (not just metadata) and return it as an
image the agent can see — review/compare what's currently live.
- `screenshotId` **(required)**
- `maxWidth` — downscale width in px for a lighter preview (default `750`; `0` = full size)
- **Returns:** an `image/png` content block + a caption with the file name and original dimensions.

### `upload_screenshot`
Upload an image into a set. Handles reserve → upload bytes → commit (with checksum).
- `screenshotSetId` **(required)**
- `filePath` **(required)** — absolute path to a PNG/JPEG matching the device's exact dimensions
- `fileName` — optional override for the stored name

### `delete_screenshot`
- `screenshotId` **(required)**

---

## Fleet audit

### audit_apps
Read-only health check across **all** your apps (or a subset). For each app it
inspects the editable App Store version and app info, then flags listing/ASO
issues. Writes nothing.

- `appIds` — array of app ids to limit the audit to (default: all apps)
- `limit` — audit at most this many apps (default: all)
- `checkScreenshots` — also flag the primary locale when it has no screenshots
  (slower; extra API calls). Default `false`.
- `keywordUseThreshold` — flag the keyword field as under-used below this many
  chars (default `70` of 100).

**Issue codes** (each finding has `severity` of `error` / `warning` / `info` / `opportunity`):

| code | meaning |
| --- | --- |
| `missing_subtitle` | No subtitle (wasted free ASO keywords) |
| `missing_keywords` | Keyword field empty |
| `keywords_underused` | Keyword field uses < threshold of 100 chars |
| `missing_description` | No description |
| `missing_promotional_text` | No promotional text |
| `missing_whats_new` | No release notes |
| `single_locale` | Listing in only one locale |
| `missing_screenshots` | No screenshots (only when `checkScreenshots: true`) |
| `no_editable_version` | No version in an editable state right now |
| `audit_failed` | The app could not be fully read (details in the message) |

**Returns**
```jsonc
{
  "summary": {
    "appsAudited": 62,
    "appsWithNoIssues": 11,
    "appsWithIssues": 51,
    "issuesByType": { "missing_subtitle": 8, "keywords_underused": 14, ... },
    "screenshotsChecked": false
  },
  "findings": [
    { "appId": "…", "name": "…", "bundleId": "…", "primaryLocale": "en-US",
      "issueCount": 6, "issues": [ { "severity": "warning", "code": "missing_keywords", "message": "…" } ] }
  ]  // sorted by issueCount, worst first
}
```

---

## Dry-run mode

The `update_app_store_version_localization` and `update_app_info_localization`
tools accept `dryRun: true`. Instead of writing, the tool reads the current
values, computes a diff, validates lengths against Apple's limits, and returns:

```jsonc
{
  "dryRun": true,
  "id": "…",
  "changes": [
    { "field": "keywords", "from": "old,kw", "to": "new,kw",
      "changed": true, "newLength": 6, "limit": 100, "exceedsLimit": false }
  ],
  "warnings": [ "'keywords' is 111 chars — exceeds Apple's limit of 100." ],
  "note": "No changes were written. Re-run without dryRun to apply."
}
```

Re-run the same call **without** `dryRun` to apply. On a real write, any
length warnings are attached to the response under `_warnings`.

---

## Analytics, sales, subscriptions & finance

> **Permissions:** these tools require an API key with the **Admin, Finance, or
> Sales** role. An **App Manager** key returns `403`. Sales/finance also need a
> **Vendor Number** (App Store Connect → Payments and Financial Reports; 8–9
> digits) — pass `vendorNumber` or set the `ASC_VENDOR_NUMBER` env var.
> Full setup walkthrough: **[ANALYTICS.md](ANALYTICS.md)**.

All report tools return `{ reportType, columns, rowCount, returned, truncated, rows }`
with `rows` capped at `limit` (default 200).

### get_sales_report
Units/downloads, proceeds, and subscription data from Sales & Trends.
- `reportDate` **(required)** — `YYYY-MM-DD` (daily/weekly), `YYYY-MM` (monthly), `YYYY` (yearly)
- `vendorNumber` — or `ASC_VENDOR_NUMBER`
- `frequency` — `DAILY` (default), `WEEKLY`, `MONTHLY`, `YEARLY`
- `reportType` — `SALES` (default), `SUBSCRIPTION`, `SUBSCRIBER`, `SUBSCRIPTION_EVENT`, `INSTALLS`, …
- `reportSubType` — `SUMMARY` (default) or `DETAILED`
- `version` — report-version override (e.g. `1_1` for SALES, `1_4` for subscriptions)
- `limit` — max rows (default 200)

### get_subscription_report
Convenience wrapper for subscription analytics (DAILY only).
- `reportDate` **(required)** — `YYYY-MM-DD`
- `kind` — `ACTIVE` (default, active-subscriber snapshot), `EVENTS` (subscribe/cancel/renew/retention), `SUBSCRIBERS` (per-subscriber detail)
- `vendorNumber`, `limit`

### get_finance_report
Proceeds/earnings by region.
- `reportDate` **(required)** — fiscal month `YYYY-MM`
- `regionCode` — `ZZ` (default, consolidated), `US`, `EU`, `JP`, …
- `vendorNumber`, `limit`

### request_analytics_report
Start an Analytics report request for an app (downloads, sessions, active
devices, App Store engagement). **Async** — generation can take minutes to hours.
- `appId` **(required)**
- `accessType` — `ONE_TIME_SNAPSHOT` (default) or `ONGOING`

### list_analytics_reports
- `requestId` **(required)** — from `request_analytics_report`
- `category` — `APP_USAGE`, `APP_STORE_ENGAGEMENT`, `COMMERCE`, `FRAMEWORK_USAGE`, `PERFORMANCE`

### list_analytics_report_instances
- `reportId` **(required)**
- `granularity` — `DAILY`, `WEEKLY`, `MONTHLY`
- `processingDate` — `YYYY-MM-DD`

### get_analytics_report_data
Download + decompress + parse an instance's segments into rows.
- `instanceId` **(required)**
- `limit` — max rows (default 200)

**Typical analytics flow:** `request_analytics_report` → (wait) →
`list_analytics_reports` → `list_analytics_report_instances` →
`get_analytics_report_data`.

---

## Customer reviews

### list_customer_reviews
- `appId` **(required)**
- `rating` — filter to a star rating 1–5
- `territory` — 3-letter code, e.g. `USA`, `GBR`
- `sort` — `-createdDate` (default), `createdDate`, `rating`, `-rating`
- `limit` — max reviews (default 50)
- **Returns:** reviews with `rating`, `title`, `body`, `reviewerNickname`, `createdDate`, `territory`, and `hasResponse`.

### reply_to_customer_review
Posts a **public** reply (confirm the text with the user first).
- `reviewId` **(required)**
- `responseBody` **(required)** — max ~5970 chars

## TestFlight

### list_builds
- `appId` **(required)**, `limit` (default 25) — newest first: `version`, `processingState`, upload/expiration dates, min OS.

### list_beta_groups
- `appId` **(required)** — group `name`, internal/external, public-link status.

### list_beta_testers
- `appId` **or** `betaGroupId` **(one required)**, `limit` (default 100).

### add_beta_tester
Invites a tester by email (emails a real person — confirm first).
- `betaGroupId` **(required)**, `email` **(required)**, `firstName`, `lastName`

## Catalog, pricing & availability

### list_in_app_purchases
- `appId` **(required)** — `name`, `productId`, type, `state`.

### get_app_price_schedule
- `appId` **(required)** — base territory + manual price points (raw schedule for inspection).

### list_available_territories
- `appId` **(required)**, `limit` (default 200) — `{ count, territories: [{ territory, available, releaseDate }] }`.

### get_age_rating
- `appId` **(required)** — the app's age-rating declaration (content descriptors).

## Submission, release & fleet status

### apps_review_status
Fleet review-status board across all (or selected) apps. Read-only.
- `appIds` — limit to these apps; `platform`; `limit`
- **Returns:** `{ summary: { apps, byState }, apps: [{ name, version, state, platform }] }`

### submit_for_review
Submits a version to Apple review (create submission → add version → submit).
**Sends the app to review — confirm first.**
- `appId` **(required)**, `versionId` **(required)**, `platform` (default IOS)

### release_version
Release an approved version waiting for manual release (PENDING_DEVELOPER_RELEASE).
**Makes it live — confirm first.**
- `versionId` **(required)**

### set_phased_release
Control a version's 7-day gradual rollout.
- `versionId` **(required)**, `state` **(required)** — `ACTIVE`, `PAUSE`, `COMPLETE`

### update_in_app_purchase
- `inAppPurchaseId` **(required)**, `name`, `reviewNote`

## Bulk localization

### bulk_update_version_localizations
Update listing copy across many locales in one call (creates missing locales).
The agent does the translating; this writes them.
- `versionId` **(required)**
- `locales` **(required)** — array of `{ locale, description?, keywords?, promotionalText?, whatsNew?, marketingUrl?, supportUrl? }`
- `dryRun` — preview every create/update without writing

## Pricing

### list_app_price_points
- `appId` **(required)**, `territory` **(required)** — each point has `customerPrice`, proceeds, and the `id` for `set_app_price`.

### set_app_price
Creates a new price schedule from a price point. **Changes live pricing — confirm first.**
- `appId` **(required)**, `baseTerritory` **(required)**, `pricePointId` **(required)**, `startDate` (YYYY-MM-DD, optional)

## Product Page Optimization

### list_app_store_version_experiments
- `appId` **(required)** — A/B tests with name, state, traffic proportion, start/end.

## Code-signing health

### signing_health
Lists certificates and provisioning profiles, flagging expired/expiring (within
`withinDays`, default 30) and INVALID profiles. Read-only.
- `withinDays` — threshold in days
- **Returns:** `{ summary, certIssues, profileIssues }` (each with `daysLeft`).

## Provisioning & code signing

### list_bundle_ids
- `filterIdentifier`, `limit` (default 200)

### register_bundle_id
- `identifier` **(required)**, `name` **(required)**, `platform` (IOS/MAC_OS/UNIVERSAL)

### list_devices / register_device
- register: `name` **(required)**, `udid` **(required)**, `platform` (IOS/MAC_OS)

### list_certificates / create_certificate / revoke_certificate
- `create_certificate` needs a CSR you generate yourself (`csrContent` PEM) + `certificateType` (e.g. IOS_DISTRIBUTION).
- `revoke_certificate` — `certificateId`.

### list_profiles / create_profile / download_profile / delete_profile
- `create_profile` — `name`, `profileType` (IOS_APP_DEVELOPMENT/IOS_APP_STORE/IOS_APP_ADHOC), `bundleId` (resource id), `certificateIds[]`, `deviceIds[]` (dev/ad-hoc).
- `download_profile` — returns base64 `.mobileprovision` in `profileContent`.

## Game Center

### list_game_center_leaderboards / list_game_center_achievements
- `appId` **(required)** — requires Game Center enabled on the app.

## Diagnostics & snapshots

### doctor
No args. Read-only setup check: Node version, credentials, whether the API key
works, report-role capability, Vendor Number, Mac build tools, and the active
safe-mode write settings. Run this first when something isn't working.

### snapshot_app_metadata
Save a timestamped JSON snapshot of an app's editable **text** metadata (name,
subtitle, privacy, description, keywords, promo, what's-new, URLs, per locale).
- `appId` **(required)**, `label` (optional)
- `includeScreenshots` — also **download the screenshot images** to a local
  folder so deleted screenshots can be restored. Slower/larger; for apps with
  many locales it can take a while.
- Returns the snapshot file path (+ `assetsDir` when images were saved).

### diff_app_metadata_snapshot
- `appId` **(required)**, `snapshotFile` **(required)** — current vs snapshot diff.

### restore_app_metadata
Restore **text** metadata from a snapshot (writes to the listing draft). `dryRun` to preview.
- `appId` **(required)**, `snapshotFile` **(required)**, `dryRun`

### restore_screenshots
Re-upload screenshots from a snapshot that was taken with `includeScreenshots:true`
— e.g. after some were deleted. Finds/creates each set and uploads the saved images.
- `appId` **(required)**, `snapshotFile` **(required)**
- `replace` — delete the set's current screenshots first (true restore)
- `dryRun` — preview what would be uploaded

### restore_app_previews
Re-upload app preview **videos** from a snapshot taken with `includePreviews:true`.
- `appId` **(required)**, `snapshotFile` **(required)**, `replace`, `dryRun`

> **Auto-snapshot:** set `APPSTORE_MCP_AUTO_SNAPSHOT=true` and the server saves a
> text-metadata snapshot of an app before the **first** listing edit of the session
> — a built-in safety net so you can always revert. (Screenshots/previews still
> need `includeScreenshots` / `includePreviews` to be restorable.)

## App previews (video)

### list_app_preview_sets / list_app_previews / get_app_preview
- sets: `localizationId`; previews: `previewSetId`; one preview: `previewId` (includes `videoUrl` when available).

### create_app_preview_set
- `localizationId` **(required)**, `previewType` **(required)** (e.g. IPHONE_67).

### upload_app_preview
- `previewSetId` **(required)**, `filePath` **(required)** (.mp4/.mov), `fileName`, `previewFrameTimeCode` (e.g. `00:00:05:00`).

### delete_app_preview
- `previewId` **(required)**.

## Safe mode (guardrails)

Set these env vars to enforce limits at the **server** (blocked calls return a
clear error):

| Variable | Effect |
| --- | --- |
| `APPSTORE_MCP_READ_ONLY=true` | block all writes |
| `APPSTORE_MCP_ALLOW_RELEASE=false` | block `release_version` / `set_phased_release` |
| `APPSTORE_MCP_ALLOW_PRICE_CHANGES=false` | block `set_app_price` |
| `APPSTORE_MCP_ALLOW_REVIEW_REPLIES=false` | block public review replies |
| `APPSTORE_MCP_ALLOW_EXTERNAL_TESTFLIGHT=false` | block `submit_beta_review` |

## Recipes & aggregators (read-only)

### release_readiness_check
- `appId` **(required)** — returns `{ app, ready, verdict, summary, checks[] }` (each check has `area`, `status` pass/warn/fail/info, `detail`).

### aso_opportunity_report
- `appIds` (default all), `limit` — ranked `{ app, issue, fix, effort }` wins.

### portfolio_growth_report
- `reportDate` **(required)**, `frequency` (DAILY default) — units sold per app from a Sales report. Needs a Vendor Number + report-capable key.

## TestFlight actions

### add_build_to_beta_group
- `betaGroupId` **(required)**, `buildId` **(required)** — makes the build available to that group's testers.

### submit_beta_review
- `buildId` **(required)** — submit for TestFlight external beta review.

> See **[RECIPES.md](RECIPES.md)** for copy-paste prompts that chain these into
> workflows (prepare-version, release-train-with-gates, review→notes, portfolio audit).

## Build & ship (macOS + Xcode)

These run local Xcode tooling, so they only work on a Mac with Xcode installed.
Each returns clear install guidance if a tool is missing.

### bump_build_number
- `projectDir` **(required)** — folder containing the `.xcodeproj`
- `setTo` — exact build number (omit to increment by 1). Uses `agvtool`.

### archive_app
Archive + export a signed `.ipa` for App Store upload (`xcodebuild`). **Can take
several minutes** — your MCP client may need a longer tool timeout.
- `project` **or** `workspace` **(one required)** — absolute path
- `scheme` **(required)**, `configuration` (default Release)
- `exportMethod` (default `app-store-connect`), `teamId`, `outputDir`
- **Returns:** `{ ipaPath, archivePath, exportPath }`

### upload_build
Upload an `.ipa` via `xcrun altool --upload-app`, using your App Store Connect
API key (`ASC_KEY_ID` / `ASC_ISSUER_ID`). The `.p8` is auto-placed where altool
looks (`~/.appstoreconnect/private_keys/`). After processing, the build appears
in `list_builds` and can be submitted with `submit_for_review`.
- `ipaPath` **(required)**, `platform` (default `ios`), `apiKey`, `apiIssuer`

---

## Rate limits

App Store Connect allows ~3,500 requests/hour and returns `429` when exceeded.
The client handles this automatically: on `429`/`503` it waits (honoring
`Retry-After` when present, else exponential backoff up to ~16 s) and retries up
to 4 times. The latest `x-rate-limit` header is kept on the client for visibility.
See <https://developer.apple.com/documentation/appstoreconnectapi/identifying-rate-limits>.

---

## Raw API access

### `raw_request`
Call any App Store Connect endpoint not covered above — previews, pricing,
availability, TestFlight, in-app purchases, subscriptions, customer reviews,
analytics, sales & finance reports, etc.

- `method` **(required)** — `GET` | `POST` | `PATCH` | `DELETE`
- `path` **(required)** — relative (e.g. `/apps` or `/appStoreVersions/{id}`; `/v1`
  is prepended automatically) or a full `https://…` URL (e.g. a paging `next` link)
- `query` — flat object of query params
- `body` — JSON request body for POST/PATCH

**Examples**
```jsonc
// Read customer reviews
{ "method": "GET", "path": "/apps/123456/customerReviews", "query": { "limit": 50 } }

// Reply to a review
{ "method": "POST", "path": "/customerReviewResponses",
  "body": { "data": { "type": "customerReviewResponses",
    "attributes": { "responseBody": "Thanks for the feedback!" },
    "relationships": { "review": { "data": { "type": "customerReviews", "id": "REVIEW_ID" } } } } } }
```

Reference: <https://developer.apple.com/documentation/appstoreconnectapi>

---

## Notes on editability

- Listing copy (description, keywords, name, subtitle, what's-new) only **saves on a
  version in an editable state** such as `PREPARE_FOR_SUBMISSION`. Promotional text
  is the exception — it can be updated on a live version.
- Edits change the **draft**. Changes go public only after you submit and Apple approves.
- The API paginates; list tools auto-follow pages (up to a safety cap). For very
  large accounts use `raw_request` with explicit `limit`/cursor if needed.
