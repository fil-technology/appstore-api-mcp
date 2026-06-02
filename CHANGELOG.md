# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

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
