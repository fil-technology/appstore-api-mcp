# Setup guide

Step-by-step from zero to a working server.

## 1. Prerequisites

- **Node.js ≥ 18** — check with `node --version`. Install from [nodejs.org](https://nodejs.org) or `brew install node`.
- An **Apple Developer Program** membership with access to App Store Connect.
- A role that can create API keys: **Account Holder** or **Admin** creates the key;
  the key itself can carry a lower role (see below).

## 2. Create an App Store Connect API key

1. Sign in to [App Store Connect](https://appstoreconnect.apple.com).
2. Go to **Users and Access** → **Integrations** tab → **App Store Connect API**.
3. Copy the **Issuer ID** shown near the top — this is your `ASC_ISSUER_ID`
   (a UUID like `12345678-90ab-cdef-1234-567890abcdef`).
4. Click the **+** button to create a new key.
   - **Name:** something like `mcp-metadata`.
   - **Access (role):** choose the **least privilege** that covers your use:
     - **App Manager** — edit metadata, keywords, screenshots, versions, TestFlight. ✅ Recommended.
     - **Developer** — narrower; may not allow all edits.
     - **Admin** — full control. Only if you genuinely need it.
5. Click **Generate**. You'll now see the key listed with a **Key ID** — that's your `ASC_KEY_ID`.
6. Click **Download API Key** to get the `AuthKey_XXXXXXXXXX.p8` file.
   > ⚠️ You can only download this **once**. Save it somewhere safe and backed up.
   > If you lose it, revoke the key and create a new one.

## 3. Store the key safely

Pick a stable location outside any git repo, e.g.:

```bash
mkdir -p ~/.appstoreconnect
mv ~/Downloads/AuthKey_XXXXXXXXXX.p8 ~/.appstoreconnect/
chmod 600 ~/.appstoreconnect/AuthKey_XXXXXXXXXX.p8
```

## 4. Add the server to your MCP client

### Claude Code

```bash
# --scope user installs it for ALL your projects (recommended).
# Remove the --scope user line to install for the current project only.
claude mcp add appstore-api \
  --scope user \
  --env ASC_KEY_ID=YOUR_KEY_ID \
  --env ASC_ISSUER_ID=YOUR_ISSUER_ID \
  --env ASC_PRIVATE_KEY_PATH=$HOME/.appstoreconnect/AuthKey_XXXXXXXXXX.p8 \
  -- npx -y appstore-api-mcp
```

`--scope user` makes it available in all projects. Drop it to scope to the current project only.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "appstore-api": {
      "command": "npx",
      "args": ["-y", "appstore-api-mcp"],
      "env": {
        "ASC_KEY_ID": "YOUR_KEY_ID",
        "ASC_ISSUER_ID": "YOUR_ISSUER_ID",
        "ASC_PRIVATE_KEY_PATH": "/Users/you/.appstoreconnect/AuthKey_XXXXXXXXXX.p8"
      }
    }
  }
}
```

Then fully quit and reopen Claude Desktop.

### Cursor / Windsurf / other clients

Use the same `command` / `args` / `env` shape in that client's MCP settings file.

## 5. Verify

Start a new chat / session and ask: **"List my App Store Connect apps."**
You should get your app list back. If not, see [Troubleshooting](#troubleshooting) below.

## Alternative: passing the key without a file path

If your environment makes file paths awkward (containers, CI), base64-encode the key:

```bash
base64 -i AuthKey_XXXXXXXXXX.p8     # macOS
base64 -w0 AuthKey_XXXXXXXXXX.p8    # Linux
```

Then set `ASC_PRIVATE_KEY_BASE64` instead of `ASC_PRIVATE_KEY_PATH`.

## Troubleshooting

- **`401 NOT_AUTHORIZED` / `403`** — issuer ID or key ID doesn't match the `.p8`,
  or the key's role lacks permission for that action. Double-check all three.
- **`ASC_*_is required`** — an env var didn't reach the process. In Claude Desktop,
  confirm the JSON is valid and you restarted the app.
- **`409 CONFLICT` on a metadata update** — the App Store version isn't editable.
  Create or select a version in `PREPARE_FOR_SUBMISSION` state.
- **Token/clock errors** — JWTs are time-based; make sure your system clock is correct.
- **`npx` fails to resolve the package** — verify Node ≥ 18 and the published package name.
