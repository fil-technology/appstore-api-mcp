# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.10.1] - 2026-06-02

### Changed
- Surface **Safe mode / read-only** prominently: a headline highlight ("you can
  run this read-only"), a table-of-contents entry, and a clearer Safe mode intro.

## [1.10.0] - 2026-06-02

### Added
- **Safe mode (tool-level guardrails):** `APPSTORE_MCP_READ_ONLY` plus per-category
  `APPSTORE_MCP_ALLOW_RELEASE` / `_PRICE_CHANGES` / `_REVIEW_REPLIES` /
  `_EXTERNAL_TESTFLIGHT`. Blocked writes return a clear error — enforced by the
  server, not just the agent.
- **`doctor`** — diagnose Node, credentials, key validity, report-role capability,
  Vendor Number, Mac build tools, and the active write mode.
- **Metadata snapshots:** `snapshot_app_metadata`, `diff_app_metadata_snapshot`,
  `restore_app_metadata` (text metadata; reversible ASO edits).
- **Test suite** (`npm test`, `node:test`): validation, guardrails, gzip/TSV
  parsing, and 429-retry — locking in the safety guarantees.
- Docs: golden-output example for the readiness check, an ASO-tool-CSV recipe,
  and a Safe-mode section in README/SECURITY.

### Changed
- Extracted `src/validation.js` and `src/guardrails.js` (unit-tested modules).

## [1.9.1] - 2026-06-02

### Added
- **ASO research prompt pack** in `docs/RECIPES.md` — keyword expansion,
  competitor positioning, and localized keyword spread, each ending in a dry-run
  apply (the research is agent-side; App Store Connect exposes no competitor data).

## [1.9.0] - 2026-06-02

### Added
- **`release_readiness_check`** — one-call go/no-go report (build, metadata, ASO,
  screenshots, compliance, TestFlight, reviews).
- **`aso_opportunity_report`** — ranked easiest ASO wins across apps.
- **`portfolio_growth_report`** — units sold per app from a Sales report.
- **TestFlight actions:** `add_build_to_beta_group`, `submit_beta_review`.
- **`docs/RECIPES.md`** — copy-paste workflow prompts (prepare-version,
  release-train-with-gates, readiness check, reviews→notes, portfolio operator,
  build & ship), linked from the README.

## [1.8.1] - 2026-06-02

### Changed
- Docs clarify that **build & ship** (`archive_app` / `upload_build` /
  `bump_build_number`) is an optional, **Mac + Xcode** add-on — everything else
  works from any OS. Added "build & ship" examples (archive, upload a new build)
  to the README "What you can ask" section and refreshed the other groups.

## [1.8.0] - 2026-06-02

### Added
- **Build & ship from a Mac** (local Xcode tooling):
  - `bump_build_number` — increment/set the build number via agvtool.
  - `archive_app` — archive + export a signed `.ipa` via xcodebuild.
  - `upload_build` — upload to App Store Connect via `xcrun altool`, reusing the
    same API key; auto-places the `.p8` where altool expects it.
  - Each tool returns friendly install guidance if Xcode/CLI tools are missing.

## [1.7.2] - 2026-06-02

### Changed
- The companion (AppMate) suggestion now also triggers when the user *asks about*
  adding a privacy policy / terms / contact form / feedback collection — not only
  on a detected gap. Added an AppMate tip to the agent-setup doc and reflowed the
  README Companion section.

## [1.7.1] - 2026-06-02

### Fixed
- Correct author attribution to **Sviatoslav (Sviat) Fil** (given name Sviatoslav;
  Fil is the family name) in the server instructions and README.

## [1.7.0] - 2026-06-02

### Added
- **MCP server instructions** — the server now hands the agent contextual
  guidance, including a tightly-guarded, non-intrusive suggestion: when (and only
  when) the user hits an App-Store-listing gap that App Store Connect can't fill
  (privacy policy / terms / contact / feedback pages), the agent may briefly
  mention [AppMate](https://appmate.cloud) once. README adds a "Companion &
  credits" section ([Fil](https://filsv.com)).

## [1.6.0] - 2026-06-02

### Added
- **`bulk_update_version_localizations`** — update listing copy across many
  locales at once (creates missing ones); `dryRun` to preview.
- **`set_phased_release`** — control a version's 7-day gradual rollout (ACTIVE/PAUSE/COMPLETE).
- **Pricing:** `list_app_price_points` (find a territory's price points) and
  `set_app_price` (set base price from a price point).
- **`list_app_store_version_experiments`** — Product Page Optimization A/B tests.

### Changed
- README tools table: removed emojis from the tool-name column and moved them
  into the description column.

## [1.5.0] - 2026-06-02

### Added
- **`apps_review_status`** — fleet review-status board: every app's current
  version + state (waiting/in-review/rejected/ready) in one call, with a summary.
- **`submit_for_review`** — full submit flow (create submission → add version →
  submit) and **`release_version`** for manually releasing an approved build.
- **`signing_health`** — flags certificates & provisioning profiles that are
  expired/expiring (within `withinDays`) or invalid, across the account.
- **`update_in_app_purchase`** — edit an IAP's reference name / review note.

## [1.4.0] - 2026-06-02

### Added
- **Provisioning & code signing:** `list_bundle_ids`, `register_bundle_id`,
  `list_devices`, `register_device`, `list_certificates`, `create_certificate`,
  `revoke_certificate`, `list_profiles`, `create_profile`, `download_profile`,
  `delete_profile`.
- **Game Center:** `list_game_center_leaderboards`, `list_game_center_achievements`.
- **Automatic rate-limit handling** — the client backs off and retries on `429`/`503`
  (honoring `Retry-After`, else exponential backoff), so large multi-app sweeps
  don't fail. The latest `x-rate-limit` header is exposed on the client.

## [1.3.0] - 2026-06-02

### Added
- Promoted popular App Store Connect capabilities from `raw_request` to dedicated tools:
  - **Customer reviews:** `list_customer_reviews` (filter by rating/territory, shows reply status) + `reply_to_customer_review`.
  - **TestFlight:** `list_builds`, `list_beta_groups`, `list_beta_testers`, `add_beta_tester`.
  - **Catalog/pricing/availability:** `list_in_app_purchases`, `get_app_price_schedule`, `list_available_territories`, `get_age_rating`.
- All read tools validated end-to-end against a live account (reviews, builds, groups, testers, IAPs, 175 territories, age rating).

## [1.2.0] - 2026-06-02

### Added
- **`get_screenshot`** — fetch a live screenshot as an actual **image the agent
  can see** (not just metadata). Downloads the App Store Connect image asset,
  downscaled by default (`maxWidth`), and returns an `image/png` content block.
  Lets an agent review/compare what's currently on a listing.

## [1.1.3] - 2026-06-02

### Changed
- Lead with analytics in the package/repo description, README one-liner, and
  keywords — downloads, revenue, and subscriptions are now front and center.

## [1.1.2] - 2026-06-02

### Fixed
- Report tools now treat a `404` ("no data for this report/date") as a clean
  empty result with an explanatory `note`, instead of surfacing it as an error.
  Validated end-to-end with an Admin key: sales, subscriptions, finance, and the
  Analytics Reports API all return real data.

## [1.1.1] - 2026-06-02

### Changed
- Documented the analytics/reporting requirements clearly: a dedicated
  [docs/ANALYTICS.md](docs/ANALYTICS.md) (role table — App Manager returns 403,
  Vendor Number, two-key setup, examples, troubleshooting), plus notes in the
  README config section, SETUP, and the tools reference.

## [1.1.0] - 2026-06-02

### Added
- **Analytics, sales, subscriptions & finance reporting:**
  - `get_sales_report` — units/downloads, proceeds, and subscription data (Sales & Trends).
  - `get_subscription_report` — active subscribers, events, and per-subscriber detail.
  - `get_finance_report` — proceeds/earnings by region.
  - `request_analytics_report` + `list_analytics_reports` +
    `list_analytics_report_instances` + `get_analytics_report_data` — the async
    Analytics Reports API (downloads, sessions, active devices, engagement).
  - Gzip/TSV/CSV handling in the client so report files are decompressed and
    returned as parsed rows.
  - Optional `ASC_VENDOR_NUMBER` env var as a default for sales/finance reports.
  - Friendly 403 hint: report APIs need a key with the Admin, Finance, or Sales
    role (App Manager is not sufficient).

## [1.0.4] - 2026-06-02

### Changed
- Agent-setup prompt now **guides the user to obtain missing credentials**
  (where to find the Key ID / Issuer ID, how to generate and download the .p8)
  instead of stopping with an error when values are still placeholders.

## [1.0.3] - 2026-06-02

### Changed
- README Quick start reworked to be agent-agnostic: the **agent-setup prompt is
  now shown inline**, and manual setup leads with the universal config block
  (Claude Code is presented as one shortcut among equals, not the default).

### Fixed
- Publish workflow now triggers on tag push **only** (removed the duplicate
  `release: published` trigger that caused a second, failing publish run), and
  skips publishing if the version is already on npm.

## [1.0.2] - 2026-06-02

### Added
- Setup instructions for more MCP clients: **Google Antigravity**,
  **Amazon Q Developer CLI**, **Goose**, and a list of others (Kiro, Roo Code,
  Trae, JetBrains AI, Warp, …).
- **Agent-assisted setup** (`docs/AGENT-SETUP.md`) — a copy-paste prompt so your
  AI agent configures the server from just your Key ID, Issuer ID, and `.p8` path.
- `.github/workflows/npm-publish.yml` — publish to npm on version-tag push /
  release, with provenance and a version-match guard.

### Changed
- Install docs default to `--scope user` (global) with an opt-out comment for
  project-only installs; fixed stale server aliases.

## [1.0.1] - 2026-06-02

### Added
- Setup instructions for **OpenAI Codex CLI** (TOML config) and **Gemini CLI**.

### Changed
- Description and docs reworded to make the client-agnostic support explicit (no longer Claude-centric).

## [1.0.0] - 2026-06-02

### Added
- Initial release.
- App browsing: `list_apps`, `get_app`.
- App info localizations (name, subtitle, privacy policy): list / update / create.
- App Store versions: list / create.
- Version localizations (description, keywords, promotional text, what's-new, URLs): list / get / update / create.
- Screenshots: list/create sets, list/upload/delete screenshots (full reserve→upload→commit flow).
- `audit_apps` — fleet-wide ASO/listing health check across all apps, read-only, with an account summary.
- Dry-run mode (`dryRun: true`) on the update tools — preview a field-by-field diff with length/limit checks before writing.
- `raw_request` escape hatch covering the entire App Store Connect API.
- ES256 JWT auth with three key-input methods: file path, raw PEM, base64.
- Multi-client setup guide (`docs/CLIENTS.md`) — Claude, Cursor, Cline, Windsurf, VS Code, Zed, Continue, and custom agents.
