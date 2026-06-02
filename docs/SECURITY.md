# Security

This server talks to Apple on your behalf using an App Store Connect API key.
That key can **read and modify your live App Store presence**. Treat it with the
same care as a password.

## What the key can do

Depending on the role you assign, the key can edit metadata and keywords, upload
screenshots, manage TestFlight, change pricing, respond to reviews, and download
sales/finance data. Scope it down.

## Safe mode (tool-level write guardrails)

Beyond least-privilege keys, the server can **refuse** writes regardless of what
an agent tries. Set env vars to enforce it:

- `APPSTORE_MCP_READ_ONLY=true` — blocks every write (great for demos, audits, CI).
- `APPSTORE_MCP_ALLOW_RELEASE=false`, `..._ALLOW_PRICE_CHANGES=false`,
  `..._ALLOW_REVIEW_REPLIES=false`, `..._ALLOW_EXTERNAL_TESTFLIGHT=false` — block
  individual high-impact categories.

Blocked calls return a clear error. This turns "the agent should ask" into "the
tool cannot do it." Run `doctor` to see the active mode.

## Principle of least privilege

- Create a **dedicated key** just for this server — don't reuse one.
- Give it the **lowest role** that covers your tasks. **App Manager** is enough for
  metadata, keywords, and screenshots. Avoid **Admin** unless you truly need it.
- You can **revoke** the key at any time in App Store Connect → Users and Access →
  Integrations. Revoking is instant and breaks only this integration.

## Where credentials live

- Credentials are read from **environment variables** at startup.
- They are used **only** to mint a short-lived (≤20 min) JWT and call
  `api.appstoreconnect.apple.com` **directly**. Nothing is proxied through any
  third party, and nothing is logged to disk by this server.
- The JWT is held in memory and regenerated as needed.

## Never commit secrets

This project is set up to keep secrets out of git and npm:

- `.gitignore` excludes `secrets/`, `*.p8`, `.env`, `*.key`.
- `package.json` uses a `files` allow-list, so **only** `src/`, docs, README,
  LICENSE, and `.env.example` are published to npm — even if a key sits in the
  folder, `npm publish` won't include it.

**Before committing or publishing, always verify:**

```bash
git status                 # no .p8, no .env, no secrets/
npm pack --dry-run         # review the file list — there must be NO key files
```

If a key is ever exposed (committed, pasted, shared), **revoke it immediately**
and generate a new one — that's a 60-second operation and the only safe response.

## Handling the .p8 file

- Store it outside any repo (e.g. `~/.appstoreconnect/`), `chmod 600`.
- Prefer `ASC_PRIVATE_KEY_PATH`. For containers/CI where files are awkward, use
  `ASC_PRIVATE_KEY_BASE64` injected as a secret — not committed to the repo.

## Reporting a vulnerability

Found a security issue in this server? Please open a private report / security
advisory on the GitHub repository rather than a public issue.
