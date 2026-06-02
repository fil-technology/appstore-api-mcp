<p align="center">
  <img src="https://raw.githubusercontent.com/fil-technology/appstore-api-mcp/main/assets/banner.png" alt="appstore-api-mcp — manage App Store Connect from any AI agent" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/appstore-api-mcp"><img src="https://img.shields.io/npm/v/appstore-api-mcp?color=0a84ff&label=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/appstore-api-mcp"><img src="https://img.shields.io/npm/dm/appstore-api-mcp?color=22d3ee" alt="npm downloads"></a>
  <img src="https://img.shields.io/npm/l/appstore-api-mcp?color=blue" alt="license">
  <img src="https://img.shields.io/node/v/appstore-api-mcp" alt="node version">
</p>

# App Store Connect MCP

**Run App Store Connect by talking to your AI.** An
[MCP](https://modelcontextprotocol.io) server that turns Apple's
[App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi)
into plain-language actions — edit your listings, **track downloads, revenue &
subscriptions**, audit your whole portfolio, and reach the entire API, from
whatever AI agent you already use.

### ✨ What makes it stand out

> **🚀 Audit your whole portfolio in one shot.** *"Audit all my apps for ASO gaps"* → a ranked report across **every** app: empty keyword fields, missing subtitles, under-used 100‑char keyword space, single‑locale listings, missing screenshots. Built for indies shipping dozens of apps — not one at a time.

> **🛡️ See every change before it ships.** Dry-run mode returns the exact diff (old → new) with Apple's character limits pre-checked, so nothing hits your **live** listing by surprise.

> **📊 Track performance, not just listings.** Pull downloads, proceeds, **subscriptions & retention**, and engagement straight from the Sales, Finance, and Analytics report APIs — parsed into rows, gzip handled for you.

> **🌐 The whole API, not a curated slice.** First-class tools for the daily work (keywords, descriptions, titles, subtitles, screenshots, versions) **plus** a `raw_request` escape hatch for everything else — TestFlight, pricing, in-app purchases, customer reviews (read & reply), and more.

### 💬 Just ask

> *“Set the keywords for my budgeting app to budget, expenses, money tracker.”*
> *“Which of my apps are missing a subtitle or screenshots?”*
> *“Dry-run a shorter description for MyApp, then upload these 6.7″ screenshots.”*

### ⚙️ Built right

- 🤖 **Any MCP client** — Claude, Codex, Cursor, Windsurf, Antigravity, Gemini CLI, Amazon Q, Goose, Zed, VS Code… → [docs/CLIENTS.md](docs/CLIENTS.md)
- ⚡ **One-line install** (`npx`, no build) — or paste a prompt and let your agent set it up for you
- 🔒 **Keys never leave your machine** — calls go straight to Apple, nothing proxied
- 📦 **MIT · published with provenance · actively maintained**

---

## Table of contents

- [Quick start](#quick-start) — incl. [agent-assisted setup](docs/AGENT-SETUP.md)
- [Supported clients](#supported-clients) → full guide in [docs/CLIENTS.md](docs/CLIENTS.md)
- [Getting your API key](#getting-your-api-key) → full guide in [docs/SETUP.md](docs/SETUP.md)
- [Configuration](#configuration)
- [Tools](#tools) → full reference in [docs/TOOLS.md](docs/TOOLS.md)
- [What you can ask](#what-you-can-ask)
- [Analytics & reports setup](docs/ANALYTICS.md) — roles, Vendor Number, examples
- [Common workflows](#common-workflows)
- [Security](#security) → details in [docs/SECURITY.md](docs/SECURITY.md)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

---

## Quick start

**Requirements:** Node.js ≥ 18 and an Apple Developer account with an
[App Store Connect API key](#getting-your-api-key).

### 🤖 Easiest: let your AI agent set it up (works with any agent)

Don't want to touch config files? Paste this into your coding agent (Claude,
Codex, Cursor, Windsurf, Antigravity, Gemini CLI, …), fill in your three values,
and it will configure your client and verify it:

```text
Set up the "appstore-api-mcp" App Store Connect MCP server for me.

My App Store Connect API credentials:
- Key ID:    <YOUR_KEY_ID>
- Issuer ID: <YOUR_ISSUER_ID>
- Path to my .p8 private key file: <ABSOLUTE_PATH_TO_AuthKey_XXXX.p8>

Please:
1. If any of the three values above are still placeholders or I didn't provide
   them, do NOT stop with an error — guide me to get them, then wait for me:
     - Key ID & Issuer ID: go to App Store Connect → Users and Access →
       Integrations tab → "App Store Connect API". The Issuer ID is shown at the
       top of that page; the Key ID is listed next to each key.
     - No key yet? Click the + to generate one, give it the "App Manager" role
       (enough to edit metadata/keywords/screenshots), then Download the .p8
       file — you can only download it once, so save it somewhere safe.
     - The .p8 path is the absolute path to wherever you saved that file.
2. Detect which MCP client I'm using and add the server to its config (run it
   with: npx -y appstore-api-mcp).
3. Pass these env vars: ASC_KEY_ID, ASC_ISSUER_ID, and ASC_PRIVATE_KEY_PATH
   (point ASC_PRIVATE_KEY_PATH at my .p8 path — reference the PATH, do not
   inline the key contents).
4. Install it at user/global scope (for Claude Code use `--scope user`).
5. Do NOT print, echo, log, or commit the key. Keep the .p8 outside any git repo.
6. When done, verify by listing my App Store apps and report the result.

Config formats per client: https://github.com/fil-technology/appstore-api-mcp/blob/main/docs/CLIENTS.md
```

> Give the file **path**, not the key contents — that keeps the private key off
> the chat transcript. More detail + a remote/cloud variant in
> [docs/AGENT-SETUP.md](docs/AGENT-SETUP.md).

Prefer to do it manually? See below.

### Manual setup — any MCP client

This is a standard stdio MCP server, so **every** MCP client uses the same
command (`npx -y appstore-api-mcp`) and the same three `ASC_*` env vars. Most
clients (Cursor, Cline, Windsurf, Claude Desktop, Gemini CLI, Antigravity, …)
take this exact block — just put it in that client's config file:

```json
{
  "mcpServers": {
    "appstore-api": {
      "command": "npx",
      "args": ["-y", "appstore-api-mcp"],
      "env": {
        "ASC_KEY_ID": "YOUR_KEY_ID",
        "ASC_ISSUER_ID": "YOUR_ISSUER_ID",
        "ASC_PRIVATE_KEY_PATH": "/absolute/path/to/AuthKey_XXXXXXXXXX.p8"
      }
    }
  }
}
```

A few clients differ (VS Code uses `servers`, Codex uses TOML, Zed uses
`context_servers`) — see the [Supported clients](#supported-clients) table and
[docs/CLIENTS.md](docs/CLIENTS.md) for each exact format/location.

**Claude Code** has a one-line CLI shortcut instead of editing a file:

```bash
# --scope user installs it for ALL your projects (recommended).
# Remove the --scope user line to install for the current project only.
claude mcp add appstore-api \
  --scope user \
  --env ASC_KEY_ID=YOUR_KEY_ID \
  --env ASC_ISSUER_ID=YOUR_ISSUER_ID \
  --env ASC_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey_XXXXXXXXXX.p8 \
  -- npx -y appstore-api-mcp
```

After configuring, restart the client and ask it to *"list my App Store apps"* to confirm it works.

---

## Supported clients

This is a standard stdio MCP server — it works with **any MCP-compatible agent**.
The command (`npx -y appstore-api-mcp`) and the three `ASC_*` env vars are always
the same; only each client's config format/location differs.

| Client | Where to configure |
| --- | --- |
| **Claude Code** | `claude mcp add …` (see above) |
| **Claude Desktop** | `claude_desktop_config.json` → `mcpServers` |
| **OpenAI Codex CLI** | `~/.codex/config.toml` → `[mcp_servers.appstore-api]` |
| **Cursor** | `.cursor/mcp.json` → `mcpServers` |
| **Cline** (VS Code) | `cline_mcp_settings.json` → `mcpServers` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` → `mcpServers` |
| **VS Code** (agent mode) | `.vscode/mcp.json` → `servers` (note: not `mcpServers`) |
| **Zed** | `settings.json` → `context_servers` |
| **Continue** | `~/.continue/config.yaml` → `mcpServers` |
| **Gemini CLI** | `~/.gemini/settings.json` → `mcpServers` |
| **Google Antigravity** | MCP settings → `mcpServers` |
| **Amazon Q Developer CLI** | `~/.aws/amazonq/mcp.json` → `mcpServers` |
| **Goose** | `~/.config/goose/config.yaml` → `extensions` |
| **Kiro / Roo Code / Trae / JetBrains AI / Warp / others** | standard `mcpServers` block — see docs |
| **Custom agent** (MCP SDK / Agents SDK / LangChain) | spawn the stdio command with the env vars |

Copy-paste config snippets for each are in **[docs/CLIENTS.md](docs/CLIENTS.md)**.

---

## Getting your API key

1. Go to **[App Store Connect](https://appstoreconnect.apple.com) → Users and Access → Integrations → App Store Connect API**.
2. Click **+** to generate a key. Give it a name and the **least privilege** role
   you need — **App Manager** is enough to edit metadata, keywords and
   screenshots. (Avoid **Admin** unless you truly need it.)
3. Note the **Issuer ID** (top of the page) and the **Key ID** (next to the key).
4. **Download the `.p8` file** — you can only download it once. Store it somewhere safe.

<p align="center">
  <img src="https://raw.githubusercontent.com/fil-technology/appstore-api-mcp/main/assets/where-to-find-credentials.png" alt="Where to find the Issuer ID and Key ID in App Store Connect → Users and Access → Integrations → App Store Connect API" width="100%">
</p>

> The **Issuer ID** is at the top of the page; each key's **Key ID** is in its
> row. The `.p8` is downloaded from the **+** / key actions. These map to
> `ASC_ISSUER_ID`, `ASC_KEY_ID`, and `ASC_PRIVATE_KEY_PATH`.

Full walkthrough with screenshots-worth of detail: **[docs/SETUP.md](docs/SETUP.md)**.

---

## Configuration

All configuration is via environment variables.

| Variable | Required | Description |
| --- | --- | --- |
| `ASC_KEY_ID` | yes | The key's ID (short alphanumeric) |
| `ASC_ISSUER_ID` | yes | The issuer UUID from the Integrations page |
| `ASC_PRIVATE_KEY_PATH` | one of these three | Absolute path to the `.p8` file |
| `ASC_PRIVATE_KEY` | one of these three | The raw PEM contents of the key |
| `ASC_PRIVATE_KEY_BASE64` | one of these three | Base64 of the `.p8` (`base64 -i AuthKey.p8`) — easiest for env vars |
| `ASC_VENDOR_NUMBER` | optional | Default Vendor Number for sales/finance reports (8–9 digits; App Store Connect → Payments and Financial Reports) |

See [.env.example](.env.example) for a copy-paste template.

> **Reports need a higher-privilege key.** The sales/subscription/finance/analytics
> tools require an API key with the **Admin, Finance, or Sales** role — an **App
> Manager** key (fine for metadata/keywords/screenshots) returns `403` for reports.
> Sales/finance also need your **Vendor Number** (App Store Connect → Payments and
> Financial Reports) via `ASC_VENDOR_NUMBER` or the `vendorNumber` argument.
> Full walkthrough: **[docs/ANALYTICS.md](docs/ANALYTICS.md)**.

---

## Tools

A compact set of high-level tools, plus `raw_request` for everything else.
Full parameter reference: **[docs/TOOLS.md](docs/TOOLS.md)**.

| Tool | What it does |
| --- | --- |
| `list_apps` / `get_app` | Browse your apps |
| `list_app_infos` / `list_app_info_localizations` | Find/read the record holding name, subtitle & privacy policy per locale |
| `update_app_info_localization` / `create_app_info_localization` | Update or add a locale's **name, subtitle, privacy policy** |
| `list_app_store_versions` / `create_app_store_version` | List versions and their states; start a new version |
| `list_app_store_version_localizations` / `get_app_store_version_localization` | Read description / keywords / etc. per locale |
| `update_app_store_version_localization` / `create_app_store_version_localization` | Update or add a locale's **keywords, description, promo text, what's-new, URLs** |
| `bulk_update_version_localizations` | 🌍 Update listing copy across **many locales at once** (creates missing ones); `dryRun` to preview |
| `list_screenshot_sets` / `create_screenshot_set` | Manage per-device screenshot sets |
| `list_screenshots` / `upload_screenshot` / `delete_screenshot` | Manage screenshots (upload handles the full reserve→upload→commit flow) |
| `get_screenshot` | 👁️ Fetch a live screenshot **as an image the agent can see** — review/compare what's on a listing |
| `audit_apps` | 🩺 **Fleet ASO audit** — scan all apps for missing subtitle/keywords/description, under-used keyword field, single-locale listings, missing screenshots. Read-only |
| `apps_review_status` | 🗂️ **Fleet review board** — every app's current version + state (waiting / in-review / rejected / ready) in one call |
| `submit_for_review` / `release_version` / `set_phased_release` | 🚀 Submit a version to Apple review (full flow), release an approved build, and control phased rollout |
| `get_sales_report` / `get_subscription_report` / `get_finance_report` | 📊 Units/downloads, proceeds, **subscriptions & retention**, earnings by region. Needs a Vendor Number + Admin/Finance/Sales key |
| `request_analytics_report` → `list_analytics_reports` → `list_analytics_report_instances` → `get_analytics_report_data` | 📈 The async Analytics Reports API — downloads, sessions, active devices, App Store engagement |
| `list_customer_reviews` / `reply_to_customer_review` | ⭐ Read reviews (filter by rating/territory, shows if you've replied) and post public replies |
| `list_builds` / `list_beta_groups` / `list_beta_testers` / `add_beta_tester` | ✈️ TestFlight — builds, beta groups, testers, and inviting testers |
| `list_in_app_purchases` / `update_in_app_purchase` | 🛒 In-app purchase products — list and edit name / review note |
| `list_app_price_points` / `set_app_price` / `get_app_price_schedule` / `list_available_territories` / `get_age_rating` | 💵 Pricing (find price points, set base price), territory availability, and age rating |
| `list_app_store_version_experiments` | 🧪 Product Page Optimization — list A/B tests (experiments) |
| `list_game_center_leaderboards` / `list_game_center_achievements` | 🎮 Game Center leaderboards & achievements |
| `signing_health` | 🔐 Flag **certificates & profiles expiring soon** (or invalid) across the account — catches CI breakage early |
| `list_bundle_ids` / `register_bundle_id` / `list_devices` / `register_device` / `list_certificates` / `create_certificate` / `revoke_certificate` / `list_profiles` / `create_profile` / `download_profile` / `delete_profile` | 🔏 **Provisioning & code signing** — bundle IDs, devices, certificates, and provisioning profiles |
| `raw_request` | 🧰 Any method/path against the API — app previews, matchmaking, Xcode Cloud, anything not above |

> ⚙️ **Rate-limit aware:** the client automatically backs off and retries on
> App Store Connect's `429` (hourly quota), so large sweeps (e.g. auditing 60+
> apps) don't fall over.

> 🛡️ **Dry-run:** the `update_*` tools accept `dryRun: true` — they return a field-by-field
> diff (old → new) with length/limit checks and **write nothing**. Drop the flag to apply.

---

## What you can ask

Once it's connected, just talk to your agent in plain language. A few things to try:

**Listings & ASO**
- *"Which of my apps are missing a subtitle or screenshots?"* (fleet audit)
- *"Tighten the keywords for <app> — dry-run it first so I can confirm."*
- *"Show me <app>'s current screenshots and flag any that look outdated."*
- *"Translate <app>'s description and keywords into German and French."*

**Performance**
- *"How many downloads did all my apps get last week?"*
- *"Pull last month's proceeds broken down by country."*
- *"How many active subscribers do I have, and what's the recent churn?"*

**Releases & the rest of the API** (via `raw_request`)
- *"Create a new App Store version (1.4.0) for <app>."*
- *"Summarize this week's 1-star reviews and draft polite replies."*
- *"List my latest TestFlight builds and which beta groups can see them."*
- *"What's <app>'s price and which territories is it available in?"*

> **Dedicated tools cover it all:** app management, localization, screenshots
> (incl. *seeing* them), sales/subscriptions/analytics, ASO audit, dry-run,
> **customer reviews, TestFlight, in-app purchases, pricing, availability, and
> age-rating**. Anything else in the App Store Connect API is still reachable
> through the **`raw_request`** escape hatch — just ask.

## Common workflows

### Update keywords or description

1. `list_apps` → get the app id
2. `list_app_store_versions` (filter `PREPARE_FOR_SUBMISSION`) → the editable version id
3. `list_app_store_version_localizations` → the locale's localization id
4. `update_app_store_version_localization` with `keywords` and/or `description`

In practice you just ask: *"set the keywords for MyApp to a, b, c"* and the model
chains these for you.

### Update the app name or subtitle

`list_app_infos` → `list_app_info_localizations` → `update_app_info_localization`.

### Upload screenshots

`list_app_store_version_localizations` → `list_screenshot_sets`
(or `create_screenshot_set`) → `upload_screenshot` with an absolute image path.

### Audit your whole portfolio (the indie superpower)

Just ask: *"Audit all my apps for ASO gaps."* One `audit_apps` call returns a
ranked report — which apps are missing keywords, subtitles, descriptions, or
under-using the 100-char keyword field — plus an account-wide summary. Add
`checkScreenshots: true` to also flag apps with no screenshots.

```jsonc
// returns { summary: { appsAudited, appsWithIssues, issuesByType, … }, findings: [ … ] }
{ "name": "audit_apps", "arguments": { "checkScreenshots": false } }
```

### Preview before you write (dry-run)

Every `update_*` tool takes `dryRun: true`. You get the exact diff and length
checks, and **nothing is written** — so you (or the model) can confirm first:

```jsonc
{ "name": "update_app_store_version_localization",
  "arguments": { "localizationId": "…", "keywords": "todo,tasks,planner", "dryRun": true } }
// → { dryRun:true, changes:[{ field:"keywords", from:"…", to:"…", newLength:18, limit:100, exceedsLimit:false }], warnings:[] }
```

### Anything else

Use `raw_request`, e.g. read customer reviews:
`GET /apps/{id}/customerReviews`. The whole API surface is reachable this way.

---

## Field limits (enforced by Apple)

| Field | Limit |
| --- | --- |
| App name | 30 chars |
| Subtitle | 30 chars |
| Keywords (comma-separated, combined) | 100 chars |
| Promotional text | 170 chars |
| Description / What's New | 4000 chars |

Metadata only **saves on a version in an editable state** (e.g.
`PREPARE_FOR_SUBMISSION`) — except **promotional text**, which can change live.
Edits go to the **draft**; they go public only after you submit and Apple approves.

---

## Security

- Your API key is **powerful** — it can rewrite your live store listings. Treat it like a password.
- Credentials are read from env vars and used **only** to talk to Apple directly. Nothing is sent anywhere else.
- **Never commit your `.p8` or credentials.** This repo's `.gitignore` and npm `files` whitelist are set up to prevent that.
- Use a **dedicated, least-privilege key** (App Manager), and revoke it anytime in App Store Connect.

More: **[docs/SECURITY.md](docs/SECURITY.md)**.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `ASC_KEY_ID is required` etc. | An env var is missing — recheck your config. |
| `401`/`403` errors | Wrong issuer/key id, wrong `.p8`, or the key's role lacks permission. |
| `409` on metadata update | The version isn't in an editable state — create/select a `PREPARE_FOR_SUBMISSION` version. |
| `npx` can't find the package | Ensure Node ≥ 18 and that the package name is published/correct. |
| Tools don't appear | MCP servers load at client startup — restart the client / start a new session. |

---

## Development

```bash
git clone https://github.com/fil-technology/appstore-api-mcp.git
cd appstore-api-mcp
npm install
cp .env.example .env   # fill in your credentials
node src/index.js      # runs the server on stdio (Ctrl-C to stop)
```

The server is plain ES modules, no build step. Source:
- `src/index.js` — tool definitions + MCP wiring
- `src/client.js` — JWT (ES256) auth, request/paging helpers, asset upload

## Companion & credits

Some App Store essentials live *outside* App Store Connect and can't be set
through this API — a hosted **privacy policy** or **terms of use** page, a
**contact form**, or a way to **collect user feedback**. **[AppMate](https://appmate.cloud)**
generates hosted pages for exactly those (and has its own MCP server), so it
pairs naturally with this one when you're filling out a listing.

Built by **[Fil](https://filsv.com)** — indie iOS apps & developer tools.

## License

MIT © Sviatoslav Fil — see [LICENSE](LICENSE).
