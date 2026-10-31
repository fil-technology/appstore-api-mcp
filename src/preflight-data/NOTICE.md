# Preflight data — attribution

The JSON data files in this directory are derived from the
**app-store-preflight** project by Ilan Uzan, used under the MIT License:

- Source: https://github.com/ilan-uzan/app-store-preflight
- License: MIT (Copyright (c) 2026 Ilan Uzan)

Files:

- `required_reason_apis.json` — Apple's required-reason API categories and the
  symbols used as grep patterns (generated from Apple's DocC JSON).
- `purpose_string_keys.json` — Info.plist purpose-string (`*UsageDescription`)
  keys and their Apple descriptions.
- `sdks_requiring_manifest.json` — SDKs Apple lists as requiring a privacy
  manifest + signature.

These lists mirror Apple's published requirements and are bundled so the
preflight checks run without network access. They are data, not Apple's
guideline text; each is maintained upstream against Apple's own pages.

The local-project scanner (`src/preflight-scan.js`) is a JavaScript port of the
upstream `scripts/scan_project.py`. The rules that turn scanner + App Store
Connect facts into guideline-cited findings (`src/preflight-rules.js`) are
original to this project.
