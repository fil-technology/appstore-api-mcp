# Using with different MCP clients

This is a standard [Model Context Protocol](https://modelcontextprotocol.io)
server over **stdio** — it works with **any** MCP-compatible agent, not just
Claude. The server itself contains nothing client-specific; only the *config
format and file location* differ per client.

Everything below runs the same command:

```
npx -y appstore-api-mcp
```

with these three env vars (see [SETUP.md](SETUP.md) to get them):

| Variable | Value |
| --- | --- |
| `ASC_KEY_ID` | your key id |
| `ASC_ISSUER_ID` | your issuer id |
| `ASC_PRIVATE_KEY_PATH` | absolute path to your `.p8` (or use `ASC_PRIVATE_KEY` / `ASC_PRIVATE_KEY_BASE64`) |

> Tip: most clients use the identical `{ "mcpServers": { … } }` block shown for
> Claude Desktop. Where a client differs (VS Code, Zed), it's called out below.

---

## Claude Code (CLI)

```bash
# --scope user installs it for ALL your projects (recommended).
# Remove the --scope user line to install for the current project only.
claude mcp add appstore-api \
  --scope user \
  --env ASC_KEY_ID=YOUR_KEY_ID \
  --env ASC_ISSUER_ID=YOUR_ISSUER_ID \
  --env ASC_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey.p8 \
  -- npx -y appstore-api-mcp
```

## Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) /
`%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "appstore-api": {
      "command": "npx",
      "args": ["-y", "appstore-api-mcp"],
      "env": {
        "ASC_KEY_ID": "YOUR_KEY_ID",
        "ASC_ISSUER_ID": "YOUR_ISSUER_ID",
        "ASC_PRIVATE_KEY_PATH": "/absolute/path/to/AuthKey.p8"
      }
    }
  }
}
```

## OpenAI Codex CLI

Codex uses **TOML**, not JSON. Add to `~/.codex/config.toml`:

```toml
[mcp_servers.appstore-api]
command = "npx"
args = ["-y", "appstore-api-mcp"]
env = { ASC_KEY_ID = "YOUR_KEY_ID", ASC_ISSUER_ID = "YOUR_ISSUER_ID", ASC_PRIVATE_KEY_PATH = "/absolute/path/to/AuthKey.p8" }
```

(You can also manage this with `codex mcp add` if your Codex version supports it.)

## Cursor

Project-level `.cursor/mcp.json` (or global `~/.cursor/mcp.json`) — same shape:

```json
{
  "mcpServers": {
    "appstore-api": {
      "command": "npx",
      "args": ["-y", "appstore-api-mcp"],
      "env": {
        "ASC_KEY_ID": "YOUR_KEY_ID",
        "ASC_ISSUER_ID": "YOUR_ISSUER_ID",
        "ASC_PRIVATE_KEY_PATH": "/absolute/path/to/AuthKey.p8"
      }
    }
  }
}
```

## Cline (VS Code extension)

Open the Cline MCP settings (`cline_mcp_settings.json`) and add the same
`mcpServers` entry as above.

## Windsurf (Codeium)

`~/.codeium/windsurf/mcp_config.json` — same `mcpServers` shape as Claude Desktop.

## VS Code (native MCP / Copilot agent mode)

VS Code uses a `servers` key (note: **not** `mcpServers`). Project file
`.vscode/mcp.json`:

```json
{
  "servers": {
    "appstore-api": {
      "command": "npx",
      "args": ["-y", "appstore-api-mcp"],
      "env": {
        "ASC_KEY_ID": "YOUR_KEY_ID",
        "ASC_ISSUER_ID": "YOUR_ISSUER_ID",
        "ASC_PRIVATE_KEY_PATH": "/absolute/path/to/AuthKey.p8"
      }
    }
  }
}
```

## Zed

In `settings.json`, Zed uses `context_servers` with a nested `command` object:

```json
{
  "context_servers": {
    "appstore-api": {
      "command": {
        "path": "npx",
        "args": ["-y", "appstore-api-mcp"],
        "env": {
          "ASC_KEY_ID": "YOUR_KEY_ID",
          "ASC_ISSUER_ID": "YOUR_ISSUER_ID",
          "ASC_PRIVATE_KEY_PATH": "/absolute/path/to/AuthKey.p8"
        }
      }
    }
  }
}
```

## Continue

In `~/.continue/config.yaml`:

```yaml
mcpServers:
  - name: appstore-api
    command: npx
    args: ["-y", "appstore-api-mcp"]
    env:
      ASC_KEY_ID: YOUR_KEY_ID
      ASC_ISSUER_ID: YOUR_ISSUER_ID
      ASC_PRIVATE_KEY_PATH: /absolute/path/to/AuthKey.p8
```

## Gemini CLI

In `~/.gemini/settings.json` — same `mcpServers` shape as Claude Desktop:

```json
{
  "mcpServers": {
    "appstore-api": {
      "command": "npx",
      "args": ["-y", "appstore-api-mcp"],
      "env": {
        "ASC_KEY_ID": "YOUR_KEY_ID",
        "ASC_ISSUER_ID": "YOUR_ISSUER_ID",
        "ASC_PRIVATE_KEY_PATH": "/absolute/path/to/AuthKey.p8"
      }
    }
  }
}
```

## Google Antigravity

Antigravity is Google's agentic IDE and supports MCP servers. Open its **MCP
settings** ("Manage MCP servers" → edit the JSON config) and add the standard
`mcpServers` block:

```json
{
  "mcpServers": {
    "appstore-api": {
      "command": "npx",
      "args": ["-y", "appstore-api-mcp"],
      "env": {
        "ASC_KEY_ID": "YOUR_KEY_ID",
        "ASC_ISSUER_ID": "YOUR_ISSUER_ID",
        "ASC_PRIVATE_KEY_PATH": "/absolute/path/to/AuthKey.p8"
      }
    }
  }
}
```

## Amazon Q Developer CLI

`~/.aws/amazonq/mcp.json` — same `mcpServers` shape as Claude Desktop.

## Goose (Block)

`~/.config/goose/config.yaml`, under `extensions` (type `stdio`):

```yaml
extensions:
  appstore-api:
    type: stdio
    cmd: npx
    args: ["-y", "appstore-api-mcp"]
    envs:
      ASC_KEY_ID: YOUR_KEY_ID
      ASC_ISSUER_ID: YOUR_ISSUER_ID
      ASC_PRIVATE_KEY_PATH: /absolute/path/to/AuthKey.p8
```

## More MCP-compatible clients

The following also speak MCP and use the **same** `mcpServers` JSON block shown
above (consult each client's MCP docs for the exact config file/UI):

- **Kiro** (AWS agentic IDE) — `.kiro/settings/mcp.json`
- **Roo Code** (VS Code) — MCP settings
- **Trae** (ByteDance IDE)
- **JetBrains AI Assistant / Junie** — Settings → Tools → MCP
- **Warp** terminal — MCP servers settings
- **BoltAI**, **LibreChat**, **Witsy**, **Tome**, **5ire** — desktop MCP clients

## Any other MCP client / custom agent

Point your client at a stdio server with:

- **command:** `npx`
- **args:** `["-y", "appstore-api-mcp"]`
- **env:** the three `ASC_*` variables

Or, if your client launches binaries by path, install globally
(`npm i -g appstore-api-mcp`) and run `appstore-api-mcp` directly. For SDK-based
agents (e.g. the Python/TypeScript MCP SDKs, OpenAI Agents SDK, LangChain MCP
adapters), spawn the same stdio command and pass the env vars through.

---

### Notes that apply to every client

- The server speaks MCP over **stdio** — no ports, no network server to manage.
- It needs **Node.js ≥ 18** on the machine running the client.
- Credentials are read from the env you supply and used **only** to call Apple directly.
- After editing a client's config, **restart the client** (or start a new session)
  so it picks up the server.
