# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

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
