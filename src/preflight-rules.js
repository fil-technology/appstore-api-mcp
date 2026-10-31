// Preflight rules engine.
//
// Turns the *facts* gathered by the local scanner (src/preflight-scan.js) and
// by the App Store Connect API (assembled in index.js) into guideline-cited
// findings. This is where the "learn from app-store-preflight" lives: the
// upstream project delegates pass/fail to LLM audit agents reading Apple's
// guideline texts; here we encode the highest-signal checks deterministically
// so the MCP can gate a submission without a model in the loop.
//
// Philosophy, borrowed from the upstream project: every finding names the
// Apple rule it is about and shows its evidence, and only high-confidence,
// low-false-positive checks are allowed to BLOCK a submission (verdict FAIL).
// Heuristic / regex-driven concerns surface as WARN or MANUAL so a real
// submission is never blocked by a guess.

// ---- Verdicts ----
export const VERDICT = {
  PASS: "PASS",     // requirement met
  FAIL: "FAIL",     // violated or a required item missing — blocks submission
  WARN: "WARN",     // probable problem or "should" advice not followed
  MANUAL: "MANUAL", // only the developer can confirm (legal/business/content)
  ASC: "ASC",       // only App Store Connect can settle it
  NA: "NA",         // does not apply to this app, or not checked
};

const G = (section, title) => ({
  ref: `App Review ${section}`,
  url: `https://developer.apple.com/app-store/review/guidelines/#${title}`,
});
// App Store Connect help topics aren't numbered guidelines; cite the area.
const ASC_REF = (area) => ({ ref: `App Store Connect — ${area}`, url: "https://developer.apple.com/help/app-store-connect/" });

// Permission-triggering feature signals → the Info.plist purpose-string key(s)
// Apple requires. `anyOf` keys satisfy the rule if at least one is declared.
// severity FAIL = a missing string crashes or is rejected deterministically;
// WARN = real but with enough edge cases that we don't hard-block.
const FEATURE_PURPOSE_KEYS = [
  { signal: "camera", keys: ["NSCameraUsageDescription"], severity: VERDICT.FAIL, label: "camera" },
  { signal: "photos", keys: ["NSPhotoLibraryUsageDescription", "NSPhotoLibraryAddUsageDescription"], severity: VERDICT.FAIL, label: "photo library" },
  { signal: "microphone", keys: ["NSMicrophoneUsageDescription"], severity: VERDICT.FAIL, label: "microphone" },
  { signal: "location", keys: ["NSLocationWhenInUseUsageDescription", "NSLocationAlwaysAndWhenInUseUsageDescription", "NSLocationUsageDescription"], severity: VERDICT.FAIL, label: "location" },
  { signal: "contacts", keys: ["NSContactsUsageDescription"], severity: VERDICT.FAIL, label: "contacts" },
  { signal: "calendar", keys: ["NSCalendarsUsageDescription", "NSCalendarsFullAccessUsageDescription"], severity: VERDICT.FAIL, label: "calendar" },
  { signal: "healthkit", keys: ["NSHealthShareUsageDescription", "NSHealthUpdateUsageDescription"], severity: VERDICT.FAIL, label: "HealthKit" },
  { signal: "speech", keys: ["NSSpeechRecognitionUsageDescription"], severity: VERDICT.FAIL, label: "speech recognition" },
  { signal: "nfc", keys: ["NFCReaderUsageDescription"], severity: VERDICT.FAIL, label: "NFC" },
  { signal: "app_tracking_transparency", keys: ["NSUserTrackingUsageDescription"], severity: VERDICT.FAIL, label: "App Tracking Transparency" },
  { signal: "bluetooth", keys: ["NSBluetoothAlwaysUsageDescription", "NSBluetoothPeripheralUsageDescription"], severity: VERDICT.WARN, label: "Bluetooth" },
  { signal: "face_id", keys: ["NSFaceIDUsageDescription"], severity: VERDICT.WARN, label: "Face ID" },
];

const has = (scan, signal) => Boolean(scan?.featureSignals?.[signal]);
const firstHit = (scan, signal) => {
  const h = scan?.featureSignals?.[signal]?.hits?.[0];
  return h ? { file: h.file, line: h.line, text: h.text } : undefined;
};

// ---- Source-derived findings ----
export function evaluateSourceFindings(scan) {
  const out = [];
  if (!scan || scan.error) return out;
  const declared = new Set(scan.purposeStrings?.declared || []);

  // 1. Purpose strings for permission-triggering APIs.
  for (const m of FEATURE_PURPOSE_KEYS) {
    if (!has(scan, m.signal)) continue;
    const present = m.keys.some((k) => declared.has(k));
    if (present) {
      out.push({
        id: `purpose-string-${m.signal}`,
        verdict: VERDICT.PASS,
        ...G("5.1.1", "section-5-1-1"),
        title: `Purpose string for ${m.label}`,
        detail: `Declares ${m.keys.filter((k) => declared.has(k)).join(", ")}.`,
      });
    } else {
      out.push({
        id: `purpose-string-${m.signal}`,
        verdict: m.severity,
        ...G("5.1.1", "section-5-1-1"),
        title: `Missing purpose string for ${m.label}`,
        detail: `Code uses ${m.label} but Info.plist declares none of: ${m.keys.join(", ")}. iOS requires a purpose string before granting access${m.severity === VERDICT.FAIL ? "; its absence crashes on request and is rejected" : ""}.`,
        evidence: firstHit(scan, m.signal),
        fix: `Add ${m.keys[0]} to Info.plist with a specific, user-facing reason.`,
      });
    }
  }

  // 2. Declared purpose strings that are too short to explain the use.
  const short = (scan.purposeStrings?.shortOrEmpty || []).filter((k) => declared.has(k));
  if (short.length) {
    out.push({
      id: "purpose-string-quality",
      verdict: VERDICT.WARN,
      ...G("5.1.1", "section-5-1-1"),
      title: "Purpose string too short / generic",
      detail: `These purpose strings are under 20 characters and likely don't explain the use: ${short.join(", ")}. Apple rejects vague strings (e.g. "Mic").`,
      fix: "Rewrite each to say what the app does with the data and why.",
    });
  }

  // 3. Required-reason APIs must be declared in a privacy manifest.
  const usedCats = (scan.requiredReasonApiUsage || []).map((c) => c.category);
  if (usedCats.length) {
    const manifests = (scan.privacyManifests || []).filter((p) => p.values);
    const declaredCats = new Set();
    for (const man of manifests) {
      for (const t of man.values?.NSPrivacyAccessedAPITypes || []) {
        const type = t?.NSPrivacyAccessedAPIType;
        const reasons = t?.NSPrivacyAccessedAPITypeReasons || [];
        if (type && reasons.length) declaredCats.add(type);
      }
    }
    if (!manifests.length) {
      out.push({
        id: "required-reason-no-manifest",
        verdict: VERDICT.FAIL,
        ...ASC_REF("Privacy manifests & required-reason APIs"),
        title: "Required-reason APIs used with no privacy manifest",
        detail: `The app calls required-reason APIs (${usedCats.join(", ")}) but no PrivacyInfo.xcprivacy was found. Apple rejects apps that use these APIs without declaring an approved reason.`,
        evidence: { file: scan.requiredReasonApiUsage[0]?.hits?.[0]?.file, line: scan.requiredReasonApiUsage[0]?.hits?.[0]?.line, text: scan.requiredReasonApiUsage[0]?.hits?.[0]?.text },
        fix: "Add a PrivacyInfo.xcprivacy with NSPrivacyAccessedAPITypes entries and an approved reason code for each category.",
      });
    } else {
      for (const cat of usedCats) {
        const ok = declaredCats.has(cat);
        out.push({
          id: `required-reason-${cat}`,
          verdict: ok ? VERDICT.PASS : VERDICT.FAIL,
          ...ASC_REF("Privacy manifests & required-reason APIs"),
          title: ok ? `Required-reason declared: ${cat}` : `Required-reason API not declared: ${cat}`,
          detail: ok
            ? `Privacy manifest declares an approved reason for ${cat}.`
            : `Code uses ${cat} but no privacy manifest declares an approved reason for it.`,
          fix: ok ? undefined : `Add ${cat} to NSPrivacyAccessedAPITypes with an approved NSPrivacyAccessedAPITypeReasons code.`,
        });
      }
    }
  }

  // 4. SDKs Apple lists as requiring a privacy manifest + signature.
  if ((scan.sdksRequiringManifest || []).length) {
    out.push({
      id: "sdk-privacy-manifest",
      verdict: VERDICT.WARN,
      ...ASC_REF("Privacy manifests & required-reason APIs"),
      title: "SDKs that require a privacy manifest are present",
      detail: `These dependencies are on Apple's list of SDKs that must ship a privacy manifest and signature: ${scan.sdksRequiringManifest.join(", ")}. Make sure you're on a version that includes them.`,
      fix: "Update each to an SDK version that bundles PrivacyInfo.xcprivacy and is signed.",
    });
  }

  // 5. Tracking without an ATT prompt.
  if ((has(scan, "advertising_id") || has(scan, "ads_sdk")) && !has(scan, "app_tracking_transparency")) {
    out.push({
      id: "att-missing",
      verdict: VERDICT.WARN,
      ...G("5.1.2", "section-5-1-2"),
      title: "Advertising/tracking code without an ATT request",
      detail: "The app references the advertising identifier or an ads SDK but doesn't call ATTrackingManager.requestTrackingAuthorization. Tracking users without the App Tracking Transparency prompt is a common rejection.",
      evidence: firstHit(scan, "advertising_id") || firstHit(scan, "ads_sdk"),
      fix: "Request tracking authorization with ATT before tracking, or confirm the app does no tracking.",
    });
  }

  // 6. Account creation without account deletion (5.1.1(v)).
  if (has(scan, "account_creation")) {
    const del = has(scan, "account_deletion");
    out.push({
      id: "account-deletion",
      verdict: del ? VERDICT.MANUAL : VERDICT.WARN,
      ...G("5.1.1(v)", "section-5-1-1"),
      title: del ? "Account deletion present (confirm it's in-app)" : "Account creation without an account-deletion path",
      detail: del
        ? "Found both account-creation and account-deletion signals. Confirm deletion is initiated from inside the app, not only via a website or email."
        : "The app appears to support account creation but no in-app account-deletion path was found. Apps that let people create an account must let them delete it from within the app.",
      evidence: firstHit(scan, "account_creation"),
      fix: del ? undefined : "Add an in-app 'Delete account' flow (not just a web link).",
    });
  }

  // 7. Sign in with Apple when third-party social login is offered (4.8).
  if (has(scan, "third_party_login") && !has(scan, "sign_in_with_apple")) {
    out.push({
      id: "sign-in-with-apple",
      verdict: VERDICT.MANUAL,
      ...G("4.8", "section-4-8"),
      title: "Third-party login without Sign in with Apple",
      detail: "The app offers a third-party/social login but no Sign in with Apple. Guideline 4.8 requires an equivalent privacy-focused login option (Sign in with Apple qualifies) unless your login already meets its criteria.",
      evidence: firstHit(scan, "third_party_login"),
      fix: "Offer Sign in with Apple, or confirm your login already meets the 4.8 criteria.",
    });
  }

  // 8. Deprecated UIWebView.
  if (has(scan, "uiwebview_deprecated")) {
    out.push({
      id: "uiwebview",
      verdict: VERDICT.FAIL,
      ...G("2.5.1", "section-2-5-1"),
      title: "Deprecated UIWebView in use",
      detail: "The app references UIWebView, which Apple no longer accepts. Builds using it are rejected.",
      evidence: firstHit(scan, "uiwebview_deprecated"),
      fix: "Replace UIWebView with WKWebView (including in any third-party SDKs).",
    });
  }

  // 9-11. Lower-confidence heuristics → WARN / MANUAL.
  if (has(scan, "private_api_hints")) {
    out.push({
      id: "private-api",
      verdict: VERDICT.WARN,
      ...G("2.5.1", "section-2-5-1"),
      title: "Possible private/undocumented API use",
      detail: "Patterns that often indicate private API access (KVC on underscore-prefixed keys, dynamic selectors, LSApplicationWorkspace) were found. Using non-public APIs is rejected.",
      evidence: firstHit(scan, "private_api_hints"),
    });
  }
  if (has(scan, "placeholder_text")) {
    out.push({
      id: "placeholder-text",
      verdict: VERDICT.WARN,
      ...G("2.1", "section-2-1"),
      title: "Placeholder / unfinished content markers",
      detail: "Found placeholder markers (lorem ipsum, TODO, 'coming soon', etc.). Apple rejects apps that look incomplete. These may be harmless code comments — verify none are user-visible.",
      evidence: firstHit(scan, "placeholder_text"),
    });
  }
  if (has(scan, "insecure_http")) {
    out.push({
      id: "insecure-http",
      verdict: VERDICT.WARN,
      ...ASC_REF("App Transport Security"),
      title: "Cleartext HTTP references",
      detail: "Non-HTTPS (http://) URLs were found. App Transport Security requires secure connections unless a justified exception is declared.",
      evidence: firstHit(scan, "insecure_http"),
    });
  }

  // 12. External payments alongside digital purchases (3.1.1).
  if (has(scan, "external_payments")) {
    out.push({
      id: "external-payments",
      verdict: VERDICT.MANUAL,
      ...G("3.1.1", "section-3-1-1"),
      title: "External payment SDK present",
      detail: "A third-party payment SDK (e.g. Stripe/PayPal) was found. Digital content and services consumed in the app must use In-App Purchase; external payment is only for physical goods/services. Confirm what is being sold.",
      evidence: firstHit(scan, "external_payments"),
    });
  }

  // 13. Restore purchases for StoreKit apps (3.1.1).
  if (has(scan, "storekit_iap") && !has(scan, "restore_purchases")) {
    out.push({
      id: "restore-purchases",
      verdict: VERDICT.WARN,
      ...G("3.1.1", "section-3-1-1"),
      title: "In-app purchases without a Restore control",
      detail: "StoreKit usage was found but no 'Restore Purchases' action. Apps with non-consumable or subscription purchases must offer a restore mechanism.",
      evidence: firstHit(scan, "storekit_iap"),
    });
  }

  // 14. Export compliance key in Info.plist.
  const anyPlistKey = (key) =>
    (scan.infoPlists || []).some((p) => key in (p.keys || {})) ||
    key in (scan.generatedInfoPlistKeys || {});
  if (!anyPlistKey("ITSAppUsesNonExemptEncryption")) {
    out.push({
      id: "export-compliance-plist",
      verdict: VERDICT.WARN,
      ...ASC_REF("Export compliance"),
      title: "ITSAppUsesNonExemptEncryption not set in Info.plist",
      detail: "No ITSAppUsesNonExemptEncryption key was found. Without it, every submission prompts for export-compliance and a build can stall as 'Missing Compliance'.",
      fix: "Add ITSAppUsesNonExemptEncryption (true/false) to Info.plist to answer it once.",
    });
  }

  return out;
}

// ---- App Store Connect-derived findings ----
// `asc` is assembled in index.js. Fields that weren't fetched are `undefined`
// and yield an NA ("not checked") finding rather than a false FAIL.
export function evaluateAscFindings(asc) {
  const out = [];
  if (!asc) return out;
  const push = (f) => out.push(f);

  // Privacy policy URL (required for all apps).
  if (asc.appInfoLocalizations !== undefined) {
    const withUrl = (asc.appInfoLocalizations || []).filter((l) => (l.privacyPolicyUrl || "").trim());
    const anyUrl = withUrl.length > 0;
    push({
      id: "asc-privacy-policy",
      verdict: anyUrl ? VERDICT.PASS : VERDICT.FAIL,
      ...G("5.1.1", "section-5-1-1"),
      title: anyUrl ? "Privacy policy URL set" : "Privacy policy URL missing",
      detail: anyUrl ? `Set in ${withUrl.length} locale(s).` : "No privacy policy URL on the app's App Information. A privacy policy URL is required for every app.",
      fix: anyUrl ? undefined : "Set a privacy policy URL (update_app_info_localization).",
    });
  }

  // Description + support URL per version localization.
  if (asc.versionLocalizations !== undefined) {
    const locs = asc.versionLocalizations || [];
    const noDesc = locs.filter((l) => !(l.description || "").trim()).map((l) => l.locale);
    push({
      id: "asc-description",
      verdict: noDesc.length ? VERDICT.FAIL : VERDICT.PASS,
      ...G("2.3.1", "section-2-3"),
      title: noDesc.length ? "Description missing in some locales" : "Description present",
      detail: noDesc.length ? `Missing in: ${noDesc.join(", ")}` : `${locs.length} locale(s) have a description.`,
    });
    const noSupport = locs.filter((l) => !(l.supportUrl || "").trim()).map((l) => l.locale);
    push({
      id: "asc-support-url",
      verdict: noSupport.length ? VERDICT.FAIL : VERDICT.PASS,
      ...ASC_REF("App information"),
      title: noSupport.length ? "Support URL missing" : "Support URL set",
      detail: noSupport.length ? `Missing in: ${noSupport.join(", ")}. A support URL is required to submit.` : "Support URL present.",
      fix: noSupport.length ? "Set a support URL (update_app_store_version_localization)." : undefined,
    });
    // What's New only matters for an update that has a prior released version.
    if (asc.isUpdate) {
      const noWhats = locs.filter((l) => !(l.whatsNew || "").trim()).map((l) => l.locale);
      if (noWhats.length) {
        push({
          id: "asc-whats-new",
          verdict: VERDICT.WARN,
          ...ASC_REF("Version information"),
          title: "What's New empty for an update",
          detail: `Missing in: ${noWhats.join(", ")}.`,
        });
      }
    }
  }

  // Screenshots per locale.
  if (asc.localesMissingScreenshots !== undefined) {
    const missing = asc.localesMissingScreenshots || [];
    push({
      id: "asc-screenshots",
      verdict: missing.length ? VERDICT.FAIL : VERDICT.PASS,
      ...G("2.3.3", "section-2-3"),
      title: missing.length ? "Screenshots missing in some locales" : "Screenshots present",
      detail: missing.length ? `No screenshots in: ${missing.join(", ")}` : "Every locale has at least one screenshot.",
    });
  }

  // Assets still processing block submission.
  if (asc.incompleteAssets !== undefined) {
    const n = (asc.incompleteAssets.screenshots?.length || 0) + (asc.incompleteAssets.previews?.length || 0);
    push({
      id: "asc-assets-processing",
      verdict: n ? VERDICT.FAIL : VERDICT.PASS,
      ...ASC_REF("Media"),
      title: n ? "Media still processing" : "Media processing complete",
      detail: n ? `${n} screenshot(s)/preview(s) are not COMPLETE; submission will fail until they finish.` : "All screenshots/previews are COMPLETE.",
    });
  }

  // Age rating declaration.
  if (asc.ageRatingDeclared !== undefined) {
    push({
      id: "asc-age-rating",
      verdict: asc.ageRatingDeclared ? VERDICT.PASS : VERDICT.FAIL,
      ...ASC_REF("Age rating"),
      title: asc.ageRatingDeclared ? "Age rating set" : "Age rating not set",
      detail: asc.ageRatingDeclared ? "An age-rating declaration exists." : "No age-rating declaration found. It's required to submit.",
    });
  }

  // Build attached & VALID.
  if (asc.build !== undefined) {
    if (!asc.build || !asc.build.attached) {
      push({
        id: "asc-build-attached",
        verdict: VERDICT.FAIL,
        ...ASC_REF("Builds"),
        title: "No build attached",
        detail: "This version has no build attached.",
        fix: "attach_build_to_version(versionId, buildId|buildNumber).",
      });
    } else {
      const valid = asc.build.processingState === "VALID";
      push({
        id: "asc-build-attached",
        verdict: valid ? VERDICT.PASS : VERDICT.FAIL,
        ...ASC_REF("Builds"),
        title: valid ? "Build attached and VALID" : `Build is ${asc.build.processingState}`,
        detail: valid ? "A processed build is attached." : `Attached build is ${asc.build.processingState}, not VALID.`,
      });
      // Export compliance per build.
      push({
        id: "asc-export-compliance",
        verdict: asc.build.usesNonExemptEncryption == null ? VERDICT.FAIL : VERDICT.PASS,
        ...ASC_REF("Export compliance"),
        title: asc.build.usesNonExemptEncryption == null ? "Export compliance unset on build" : "Export compliance set",
        detail: asc.build.usesNonExemptEncryption == null
          ? "The build's usesNonExemptEncryption is unset (per-build; does not carry over). A common cause of the opaque 409 at submit."
          : `usesNonExemptEncryption = ${asc.build.usesNonExemptEncryption}.`,
        fix: asc.build.usesNonExemptEncryption == null ? "update_build(buildId, usesNonExemptEncryption:false|true)." : undefined,
      });
    }
  }

  // IDFA declaration on the version.
  if (asc.version !== undefined && asc.version) {
    push({
      id: "asc-idfa",
      verdict: asc.version.usesIdfa == null ? VERDICT.FAIL : VERDICT.PASS,
      ...ASC_REF("Advertising identifier (IDFA)"),
      title: asc.version.usesIdfa == null ? "IDFA declaration unset" : "IDFA declaration set",
      detail: asc.version.usesIdfa == null ? "The version's usesIdfa is unset; submission fails with an opaque 409." : `usesIdfa = ${asc.version.usesIdfa}.`,
      fix: asc.version.usesIdfa == null ? "update_app_store_version(versionId, usesIdfa:false|true)." : undefined,
    });
  }

  // Demo account / review notes when the app has a login.
  if (asc.reviewDetail !== undefined && asc.hasLogin) {
    const rd = asc.reviewDetail || {};
    const hasDemo = Boolean((rd.demoAccountName || "").trim() && (rd.demoAccountPassword || "").trim());
    const hasNotes = Boolean((rd.notes || "").trim());
    const ok = hasDemo || hasNotes;
    push({
      id: "asc-demo-account",
      verdict: ok ? VERDICT.PASS : VERDICT.WARN,
      ...G("2.1", "section-2-1"),
      title: ok ? "Review access provided" : "No demo account or review notes, but the app has a login",
      detail: ok
        ? (hasDemo ? "A demo account is set in App Review Information." : "Review notes explain how to access the app.")
        : "The app appears to require sign-in but App Review Information has no demo account and no notes. Reviewers who can't get in reject under 2.1.",
      fix: ok ? undefined : "Add a working demo account (or notes explaining access) in App Review Information.",
    });
  }

  return out;
}

/** Combine source + ASC findings and roll up a status. */
export function evaluatePreflight({ scan, asc } = {}) {
  const findings = [...evaluateSourceFindings(scan), ...evaluateAscFindings(asc)];
  return { ...summarize(findings), findings, meta: {
    scannedProject: Boolean(scan && !scan.error),
    projectRoot: scan?.projectRoot,
    ascChecked: Boolean(asc),
    scanNote: scan?.error || (scan && !scan.projectTypes?.length ? scan.notes?.[0] : undefined),
  } };
}

export function summarize(findings) {
  const summary = { PASS: 0, FAIL: 0, WARN: 0, MANUAL: 0, ASC: 0, NA: 0 };
  for (const f of findings) summary[f.verdict] = (summary[f.verdict] || 0) + 1;
  const blocking = findings.filter((f) => f.verdict === VERDICT.FAIL);
  const ready = blocking.length === 0;
  const caution = summary.WARN + summary.MANUAL + summary.ASC;
  let status;
  if (!ready) status = `NOT READY — ${blocking.length} blocking issue(s)`;
  else if (caution) status = `READY WITH CAUTION — ${caution} item(s) to review`;
  else status = "READY";
  return { status, ready, summary, blocking };
}
