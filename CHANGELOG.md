# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.15.0] - 2026-10-05

### Added — submission flow (from 5 field reports of real submissions)
- **Build ↔ version ↔ review loop** (the biggest gap; previously `raw_request`):
  `attach_build_to_version`, `get_app_store_version` (incl. attached build),
  `update_app_store_version` (`usesIdfa`, releaseType…), `update_build`
  (per-build `usesNonExemptEncryption` export compliance; `expired`),
  `expire_build`, `get_build`, `wait_for_build_processing`, `next_build_number`.
- **Review submissions:** `list_review_submissions`, `get_review_submission`,
  `add_review_submission_item`, `cancel_review_submission` (surfaces Apple's
  "can't cancel empty/non-cancellable" cleanly), `get_app_store_review_detail`.
- **TestFlight:** `get_beta_review_status`, `set_beta_build_notes` ("What to Test").
- **Screenshots:** `find_incomplete_screenshots` (assets stuck != COMPLETE that
  silently block submission), `reorder_screenshots`, `replace_screenshots` (bulk
  delete + re-upload in order).
- **Subscriptions:** `list_subscription_groups`, `list_subscriptions`,
  `list_subscription_offers` (**flags overlapping offer date ranges** — the
  sandbox `countMismatch` cause), `create_subscription_group`,
  `create_subscription`, `create_in_app_purchase`.
- **Territories:** `list_app_territories` (compact appAvailabilityV2 summary).
- **Diagnostics & orchestrators:** `diagnose_submission` (the exact blockers
  behind submit's opaque 409), `swap_build` (wait→cancel→attach), `release_pipeline`
  (attach→diagnose→submit), `bulk_upsert_localizations` (version + app-info, all
  locales, creates missing ones, whitespace preserved verbatim).

### Fixed
- `list_builds` ignored `limit` (it paged via `getAll`). Now returns a single
  page capped to `limit`; added `version` / `processingState` filters.
- `submit_for_review` now pre-flights and, on failure, surfaces the real blockers
  (no attached build, build not VALID, unset export compliance / IDFA, assets
  still processing) instead of Apple's opaque `409 ENTITY_STATE_INVALID`; cleans
  up the half-created empty submission.
- `create_app_info_localization` upserts instead of failing "already exists"
  (Apple auto-creates the name/subtitle row with the version localization).
- `release_readiness_check` now verifies a build is attached + VALID, checks
  description/screenshots across **all** locales, and flags assets still processing.
- `upload_screenshot` returns a compact result (dropped ~700 tokens of signed
  upload URLs per image).
- `list_app_store_version_localizations` gains `omitLongFields` (return lengths
  instead of full description/promotionalText/whatsNew).
- `list_analytics_reports` accepts `appId` (uses the app's newest report request)
  instead of crashing on a missing `requestId`.

## [1.14.0] - 2026-10-05

### Added
- **PPP regional pricing for IAPs & subscriptions.** Bulk-set in-app purchase and
  subscription prices across ~174 territories from a US base price, scaled by
  purchasing-power parity. Logic + the 175-country dataset are ported from the
  MIT-licensed [appstore-ppp-prices](https://github.com/duceum/appstore-ppp-pricing-agent-skill).
  - `list_purchasable_products` — IAPs (v2) + subscriptions with current US prices.
  - `preview_ppp_prices` — read-only dry run: per-territory target table, scaled in
    local currency via Apple's equalizations and snapped to each territory's real
    price grid (ratio-preserving floors of 0.99 / 0.49).
  - `apply_ppp_prices` — applies the prices (IAP = one atomic price-schedule POST;
    subscriptions = per-territory with `preserveCurrentPrice` + future `startDate`,
    clearing pending prices first). **Irreversible**: requires `confirm:true`, is
    gated by `APPSTORE_MCP_ALLOW_PRICE_CHANGES` and read-only mode, and the docs
    mandate previewing first.
  - Per-tier coefficients use embedded defaults; override any tier (premium,
    high_income, upper_middle, lower_middle, emerging) by passing a `coefficients`
    map — the agent reasons about elasticity, no server-side LLM or extra key.
  - New `client.getAllPages()` helper returns side-loaded `included` resources.

## [1.13.0] - 2026-06-13

### Added
- **iOS CI/CD → TestFlight bootstrap.** Turn a new iOS app into a fastlane +
  GitHub Actions → TestFlight pipeline in one call:
  - `ensure_asc_app` — find the App Store Connect app record for a bundle id
    (find-only; the public API has no `POST /apps`, so it returns guidance when
    the record doesn't exist yet).
  - `bootstrap_ios_cicd` — scaffold the 7 pipeline files (Gemfile, fastlane
    Appfile/Fastfile/.gitignore/SETUP.md, two GitHub Actions workflows) into the
    app's repo, auto-detecting `appDir`/`bundleId`/`teamId`/`scheme`/`target`
    from the `.xcodeproj`. Commits to a branch or opens a PR. Xcode automatic
    ("cloud") signing via `-allowProvisioningUpdates` — no `match` repo.
  - `set_repo_ci_secrets` — push `ASC_KEY_ID` / `ASC_ISSUER_ID` / `ASC_KEY_P8`
    (base64) to the repo's Actions secrets. The API key is read from this
    server's own config, never passed as an argument or returned in output;
    values are piped to `gh secret set` over stdin.
  - `bootstrap_testflight` — one-call orchestrator running all three.
  - GitHub operations shell out to the `gh` CLI (no extra token, no new
    dependency). The bootstrap writers respect read-only / safe mode.

## [1.12.0] - 2026-06-03

### Added
- **App preview videos:** `list_app_preview_sets`, `list_app_previews`,
  `get_app_preview` (incl. `videoUrl`), `create_app_preview_set`,
  `upload_app_preview`, `delete_app_preview`. Snapshots can back up previews
  (`includePreviews:true`) and **`restore_app_previews`** re-uploads them.
- **Auto-snapshot safety net:** `APPSTORE_MCP_AUTO_SNAPSHOT=true` makes the server
  save a text-metadata snapshot of an app before the **first** listing edit of the
  session — so "revert" works even if you forgot to snapshot. Plus a server-side
  habit nudge to snapshot before bulk/risky edits, and a revert recipe.

## [1.11.0] - 2026-06-03

### Added
- **Screenshot backup & restore.** `snapshot_app_metadata` now takes
  `includeScreenshots:true` to download the actual screenshot **images** locally,
  and **`restore_screenshots`** re-uploads them — so deleted screenshots can be
  brought back (use `replace:true` for a true restore). Previously only screenshot
  *references* were stored; now the pixels can be too.

## [1.10.2] - 2026-06-02

### Changed
- Feature read-only / safe mode as a headline differentiator in the README's
  "What makes it stand out" section.

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
