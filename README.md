# App Store Connect MCP

An [MCP](https://modelcontextprotocol.io) server that lets **any AI agent** read
and edit your **App Store Connect** apps in plain language — keywords,
descriptions, titles, subtitles, promotional text, what's-new, screenshots,
versions — plus a raw-request tool that reaches the **entire**
[App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi).

> Ask things like *"update the keywords for my app to X, Y, Z"*,
> *"show the English description for MyApp"*, or
> *"upload these screenshots to the 6.7-inch set"* — the agent calls the right tools.

- 🤖 **Works with any MCP client** — Claude Code/Desktop, OpenAI Codex CLI, Cursor, Cline, Windsurf, VS Code (agent mode), Zed, Continue, Gemini CLI, Google Antigravity, Amazon Q, Goose, JetBrains AI, Warp, and custom agents on the MCP SDKs. Standard stdio server, no client-specific code. → [docs/CLIENTS.md](docs/CLIENTS.md)
- ✅ **One-line install** via `npx` — no clone, no build
- ✅ **Credentials stay on your machine** — calls go straight to Apple, nothing is proxied
- ✅ **Slim, well-described tool set** + a `raw_request` escape hatch for the whole API
- 🛡️ **Dry-run mode** — preview any metadata change (old→new + length checks) before writing
- 🚀 **Fleet audit** — one call health-checks **all** your apps for ASO gaps (built for indies with many apps)
- ✅ MIT licensed, actively maintained

---

## Table of contents

- [Quick start](#quick-start) — incl. [agent-assisted setup](docs/AGENT-SETUP.md)
- [Supported clients](#supported-clients) → full guide in [docs/CLIENTS.md](docs/CLIENTS.md)
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
git clone https://github.com/fil-technology/appstore-api-mcp.git
cd appstore-api-mcp
npm install
cp .env.example .env   # fill in your credentials
node src/index.js      # runs the server on stdio (Ctrl-C to stop)
```

The server is plain ES modules, no build step. Source:
- `src/index.js` — tool definitions + MCP wiring
- `src/client.js` — JWT (ES256) auth, request/paging helpers, asset upload

## License

MIT © Sviatoslav Fil — see [LICENSE](LICENSE).
