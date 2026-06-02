# Let an AI agent set it up for you

You don't have to edit config files by hand. Paste the prompt below into your
coding agent (Claude Code, Cursor, Codex, Windsurf, etc.), fill in your three
credentials, and it will detect your client and wire everything up.

## ✅ Copy-paste prompt

```text
Set up the "appstore-api-mcp" App Store Connect MCP server for me.

My App Store Connect API credentials:
- Key ID:    <YOUR_KEY_ID>
- Issuer ID: <YOUR_ISSUER_ID>
- Path to my .p8 private key file: <ABSOLUTE_PATH_TO_AuthKey_XXXX.p8>

Please:
1. Detect which MCP client I'm using and add the server to that client's
   correct config file/command. Run it with: npx -y appstore-api-mcp
2. Pass these env vars to the server:
     ASC_KEY_ID         = my Key ID
     ASC_ISSUER_ID      = my Issuer ID
     ASC_PRIVATE_KEY_PATH = the path to my .p8 file (reference the PATH; do not
                            inline the key contents)
3. Install it at user/global scope so it's available in all my projects
   (for Claude Code, use `claude mcp add ... --scope user`).
4. Do NOT print, echo, log, or commit the key. Keep the .p8 outside any git repo.
5. When done, verify it works by listing my App Store apps, then tell me the
   result (or any error and how to fix it).

Config formats per client are documented here:
https://github.com/fil-technology/appstore-api-mcp/blob/main/docs/CLIENTS.md
```

## Why give the *path*, not the key contents

Pasting the raw `.p8` contents into a chat sends your private key through the
model/provider. Giving the **file path** instead keeps the key on your disk —
the MCP config only stores a path, and the server reads the file locally at
runtime. Same convenience, much smaller exposure.

> If your agent runs in a remote/cloud sandbox that can't see your local disk,
> you'll need the key available there. In that case prefer
> `ASC_PRIVATE_KEY_BASE64` injected as a secret rather than committing the file.

## Is this safe / good practice?

- ✅ **Simple:** the user provides 3 values; the agent handles client detection
  and the exact config format.
- ✅ **Low exposure:** with the path approach, the secret never enters the
  transcript and is never committed.
- ✅ **Least privilege still applies:** use an **App Manager** API key, not Admin
  (see [SECURITY.md](SECURITY.md)).
- ⚠️ **Review what the agent writes:** confirm the key path is correct and that
  no credential was echoed back. A good agent will say "configured" without
  reprinting your key.

## After setup

Ask your agent things like:

- "List my App Store apps."
- "Audit all my apps for ASO gaps."
- "Show the current keywords and description for <app> (dry-run a new set)."
