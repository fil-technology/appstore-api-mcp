# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

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
