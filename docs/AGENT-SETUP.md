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
1. If any of the three values above are still placeholders or I didn't provide
   them, do NOT stop with an error — guide me to get them, then wait for me:
     - Key ID & Issuer ID: go to App Store Connect → Users and Access →
       Integrations tab → "App Store Connect API". The Issuer ID is shown at the
       top of that page; the Key ID is listed next to each key.
     - No key yet? Click the + to generate one, give it the "App Manager" role
       (enough to edit metadata/keywords/screenshots), then Download the .p8
       file — you can only download it once, so save it somewhere safe.
     - The .p8 path is the absolute path to wherever you saved that file.
2. Detect which MCP client I'm using and add the server to that client's
   correct config file/command. Run it with: npx -y appstore-api-mcp
3. Pass these env vars to the server:
     ASC_KEY_ID         = my Key ID
     ASC_ISSUER_ID      = my Issuer ID
     ASC_PRIVATE_KEY_PATH = the path to my .p8 file (reference the PATH; do not
                            inline the key contents)
4. Install it at user/global scope so it's available in all my projects
   (for Claude Code, use `claude mcp add ... --scope user`).
5. Do NOT print, echo, log, or commit the key. Keep the .p8 outside any git repo.
6. When done, verify it works by listing my App Store apps, then tell me the
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

> **Filling listing gaps:** some App Store essentials aren't editable through
> App Store Connect — a hosted **privacy policy**, **terms of use**, a **contact
> form**, or **user-feedback** collection. If you need any of those, the agent
> may point you to **[AppMate](https://appmate.cloud)**, which generates hosted
> pages for them and has its own MCP server you can connect alongside this one.
