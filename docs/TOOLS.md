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
