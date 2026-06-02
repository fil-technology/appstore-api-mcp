# Recipes — copy-paste workflow prompts

These are ready-made prompts you can paste into your agent. They chain the
server's tools into real workflows. **Replace `AppName` / `1.4.0` with yours.**

The agent does the reasoning (writing copy, ranking, deciding); the MCP does the
App Store Connect work. Where a step changes live state (submit, release, post a
review reply, invite a tester), these prompts tell the agent to **stop and ask
first** — keep that discipline.

---

## 1. Prepare the next version

```text
Prepare version 1.4.0 for AppName. Use the current live listing as the baseline:
create the new App Store version if it doesn't exist, draft "what's new" from
these release notes/commits [paste here], audit the metadata, and propose ASO
improvements (keywords, subtitle, promo text). Dry-run every edit and show me a
diff table (field / current / proposed / why / limit) BEFORE writing anything.
```

Uses: `list_app_store_versions`, `create_app_store_version`,
`update_app_store_version_localization` (with `dryRun`), `audit_apps`,
`aso_opportunity_report`.

## 2. Release readiness check

```text
Is AppName v1.4.0 ready to submit? Run a full readiness check and show a
pass/warn/fail table covering build, metadata, ASO, screenshots, compliance
(privacy policy, age rating), TestFlight, and recent low-star reviews. List the
blockers first.
```

Uses: `release_readiness_check` (single call), or the individual tools.

## 3. Release train — with approval gates

```text
Promote the latest processed build of AppName v1.4.0 to TestFlight internal
testers. Do NOT submit to App Review or release to production without asking me
first. Show me the build number, the beta groups, the tester count, and the exact
action plan before changing anything. After I approve each gate, proceed to the
next: (1) verify build processed → (2) add to internal beta group → (3) pause for
my OK → (4) submit to App Review → (5) pause → (6) release or start phased rollout.
```

Uses: `list_builds`, `list_beta_groups`, `list_beta_testers`,
`add_build_to_beta_group`, `submit_beta_review`, `submit_for_review`,
`release_version`, `set_phased_release`. **Stops at each human gate.**

## 4. Customer reviews → release notes loop

```text
Summarize recent 1–3 star reviews for AppName, cluster the complaints by theme,
and suggest fixes to mention in the next release notes. Also draft polite public
replies for reviews that mention bugs we've fixed — but do NOT post any reply
without my approval.
```

Uses: `list_customer_reviews`, `reply_to_customer_review` (only after approval),
`update_app_store_version_localization` (for the what's-new).

## 5. Portfolio operator — weekly ASO wins

```text
Audit all my apps and rank the top 10 easiest ASO wins. For each, show app,
issue, suggested fix, and rough effort (low/medium). Then pull last week's units
per app so I can prioritize the wins on apps that actually get traffic.
```

Uses: `aso_opportunity_report`, `audit_apps`, `portfolio_growth_report`,
`get_sales_report`.

## 6. ASO research → dry-run apply

The App Store Connect API has no competitor or keyword-volume data, so the
**research** is the agent's job (web/app-page reading or an ASO API you have).
This MCP handles reading your current listing and applying the result safely.

**a) Keyword expansion**
```text
For AppName, show the current keyword field and how many of the 100 characters
are used. Research 10–15 high-intent keywords for this app's category (use web
search if available), pick the best set that fits 100 chars without duplicating
words already in the title/subtitle, and dry-run the new keyword field so I can
approve before it's written.
```

**b) Competitor positioning**
```text
Here are 3 competitors for AppName: [App A], [App B], [App C]. Look at their App
Store titles, subtitles, and how they position the app. Compare to AppName's
current title/subtitle/keywords, point out gaps, and propose an improved subtitle
(<=30 chars) and keyword set. Dry-run the changes; don't write until I confirm.
```

**c) Localized keyword spread**
```text
AppName ranks only in en-US. Propose localized keyword sets for en-GB, en-CA, and
en-AU that use each store's keyword field for *additional* terms (a known ASO
trick — extra locales add searchable keywords). Dry-run a bulk localization update
across those locales and show me the diff first.
```

Uses: `get_app_store_version_localization`, `list_app_info_localizations`,
`update_app_store_version_localization` (with `dryRun`),
`bulk_update_version_localizations`, `aso_opportunity_report`.

## 7. Build & ship (Mac only)

```text
Bump AppName's build number, archive it, and upload the new build to App Store
Connect. Tell me the new build number and confirm the upload succeeded. Don't
submit for review yet.
```

Uses: `bump_build_number`, `archive_app`, `upload_build`, then `list_builds`.
Requires macOS + Xcode and the project path.

---

> **Tip:** these are starting points — tweak the gates and outputs to taste. For a
> first run, keep the "ask before any write" instruction so you can watch what the
> agent proposes before it changes anything live.
