# App Store Connect MCP

An [MCP](https://modelcontextprotocol.io) server that lets Claude (and any other
MCP client) read and edit your **App Store Connect** apps in plain language —
keywords, descriptions, titles, subtitles, promotional text, what's-new,
screenshots, versions — plus a raw-request tool that reaches the **entire**
[App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi).

> Ask things like *"update the keywords for my app to X, Y, Z"*,
> *"show the English description for MyApp"*, or
> *"upload these screenshots to the 6.7-inch set"* — the model calls the right tools.

- ✅ **One-line install** via `npx` — no clone, no build
- ✅ **Credentials stay on your machine** — calls go straight to Apple, nothing is proxied
- ✅ **Slim, well-described tool set** + a `raw_request` escape hatch for the whole API
- 🛡️ **Dry-run mode** — preview any metadata change (old→new + length checks) before writing
- 🚀 **Fleet audit** — one call health-checks **all** your apps for ASO gaps (built for indies with many apps)
- ✅ MIT licensed, actively maintained

---

## Table of contents

- [Quick start](#quick-start)
- [Getting your API key](#getting-your-api-key) → full guide in [docs/SETUP.md](docs/SETUP.md)
- [Configuration](#configuration)
- [Tools](#tools) → full reference in [docs/TOOLS.md](docs/TOOLS.md)
- [Common workflows](#common-workflows)
- [Security](#security) → details in [docs/SECURITY.md](docs/SECURITY.md)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

---

## Quick start

**Requirements:** Node.js ≥ 18 and an Apple Developer account with an
[App Store Connect API key](#getting-your-api-key).

### Claude Code (CLI)

```bash
claude mcp add appstore-connect \
  --env ASC_KEY_ID=YOUR_KEY_ID \
  --env ASC_ISSUER_ID=YOUR_ISSUER_ID \
  --env ASC_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey_XXXXXXXXXX.p8 \
  -- npx -y storemate-mcp
```

Add `--scope user` to make it available in **every** project (default is the
current project only).

### Claude Desktop / Cursor / other MCP clients

Add this to your client's MCP config (for Claude Desktop:
`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "appstore-connect": {
      "command": "npx",
      "args": ["-y", "storemate-mcp"],
      "env": {
        "ASC_KEY_ID": "YOUR_KEY_ID",
        "ASC_ISSUER_ID": "YOUR_ISSUER_ID",
        "ASC_PRIVATE_KEY_PATH": "/absolute/path/to/AuthKey_XXXXXXXXXX.p8"
      }
    }
  }
}
```

Restart the client, then ask it to *"list my App Store apps"* to confirm it works.

---

## Getting your API key

1. Go to **[App Store Connect](https://appstoreconnect.apple.com) → Users and Access → Integrations → App Store Connect API**.
2. Click **+** to generate a key. Give it a name and the **least privilege** role
   you need — **App Manager** is enough to edit metadata, keywords and
   screenshots. (Avoid **Admin** unless you truly need it.)
3. Note the **Issuer ID** (top of the page) and the **Key ID** (next to the key).
4. **Download the `.p8` file** — you can only download it once. Store it somewhere safe.

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

See [.env.example](.env.example) for a copy-paste template.

---

## Tools

A compact set of high-level tools, plus `raw_request` for everything else.
Full parameter reference: **[docs/TOOLS.md](docs/TOOLS.md)**.

| Tool | What it does |
| --- | --- |
| `list_apps` / `get_app` | Browse your apps |
| `list_app_infos` | Find the record holding name/subtitle/privacy localizations |
| `list_app_info_localizations` | Read name, subtitle, privacy policy per locale |
| `update_app_info_localization` | Update **name, subtitle, privacy policy** |
| `create_app_info_localization` | Add a new locale's name/subtitle |
| `list_app_store_versions` | List versions and their states |
| `create_app_store_version` | Start a new version to prepare for submission |
| `list_app_store_version_localizations` | Read description/keywords/etc. per locale |
| `get_app_store_version_localization` | Read one locale's listing copy |
| `update_app_store_version_localization` | Update **keywords, description, promo text, what's-new, URLs** |
| `create_app_store_version_localization` | Add a new locale to a version |
| `list_screenshot_sets` / `create_screenshot_set` | Manage per-device screenshot sets |
| `list_screenshots` / `upload_screenshot` / `delete_screenshot` | Manage screenshots (upload handles the full reserve→upload→commit flow) |
| 🚀 `audit_apps` | **Fleet health check** — scan all (or selected) apps for missing subtitle/keywords/description, under-used keyword field, single-locale listings, missing screenshots, and more. Read-only. |
| `raw_request` | Any method/path against the API — previews, pricing, TestFlight, IAP, reviews, analytics, sales reports, … |

> 🛡️ **Dry-run:** the `update_*` tools accept `dryRun: true` — they return a field-by-field
> diff (old → new) with length/limit checks and **write nothing**. Drop the flag to apply.

---

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
git clone https://github.com/fil-technology/storemate-mcp.git
cd storemate-mcp
npm install
cp .env.example .env   # fill in your credentials
node src/index.js      # runs the server on stdio (Ctrl-C to stop)
```

The server is plain ES modules, no build step. Source:
- `src/index.js` — tool definitions + MCP wiring
- `src/client.js` — JWT (ES256) auth, request/paging helpers, asset upload

## License

MIT © Sviatoslav Fil — see [LICENSE](LICENSE).
