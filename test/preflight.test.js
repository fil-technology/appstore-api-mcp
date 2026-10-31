import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { scanProject, parseXmlPlist } from "../src/preflight-scan.js";
import {
  evaluateSourceFindings,
  evaluateAscFindings,
  evaluatePreflight,
  summarize,
  VERDICT,
} from "../src/preflight-rules.js";

const MINIAPP = fileURLToPath(new URL("./fixtures/MiniApp", import.meta.url));
const byId = (findings, id) => findings.find((f) => f.id === id);

// ---- XML plist parser ----

test("parseXmlPlist handles scalars, nesting and booleans", () => {
  const xml = `<?xml version="1.0"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>A</key><string>hello &amp; bye</string>
  <key>B</key><true/>
  <key>N</key><integer>42</integer>
  <key>Arr</key><array><string>x</string><dict><key>k</key><false/></dict></array>
</dict></plist>`;
  const o = parseXmlPlist(xml);
  assert.equal(o.A, "hello & bye");
  assert.equal(o.B, true);
  assert.equal(o.N, 42);
  assert.deepEqual(o.Arr[0], "x");
  assert.equal(o.Arr[1].k, false);
});

test("parseXmlPlist returns null for a non-plist", () => {
  assert.equal(parseXmlPlist("not a plist"), null);
});

// ---- Scanner against the MiniApp fixture ----

test("scanProject collects the expected facts from MiniApp", () => {
  const f = scanProject(MINIAPP);
  assert.ok(f.projectTypes.includes("xcode"));
  // StoreKit + restore signals come from Store.swift.
  assert.ok(f.featureSignals.storekit_iap, "storekit_iap signal");
  assert.ok(f.featureSignals.restore_purchases, "restore_purchases signal");
  // Purpose strings: camera (long) + microphone (short) from Info.plist,
  // photo-library from a generated INFOPLIST_KEY_ build setting.
  assert.ok(f.purposeStrings.declared.includes("NSCameraUsageDescription"));
  assert.ok(f.purposeStrings.declared.includes("NSMicrophoneUsageDescription"));
  assert.ok(f.purposeStrings.shortOrEmpty.includes("NSMicrophoneUsageDescription"));
  // Required-reason API: UserDefaults, declared in the privacy manifest.
  const cats = f.requiredReasonApiUsage.map((c) => c.category);
  assert.ok(cats.includes("NSPrivacyAccessedAPICategoryUserDefaults"));
  assert.equal(f.privacyManifests[0].parsed, true);
});

test("scanProject on a missing path returns an error, not a throw", () => {
  const f = scanProject("/no/such/path/xyz");
  assert.match(f.error, /not found/i);
});

// ---- Source rules ----

test("missing purpose string for a used permission API is a blocking FAIL", () => {
  const scan = {
    featureSignals: { camera: { count: 1, hits: [{ file: "A.swift", line: 3, text: "AVCaptureSession()" }] } },
    purposeStrings: { declared: [], shortOrEmpty: [] },
    privacyManifests: [],
    requiredReasonApiUsage: [],
    infoPlists: [],
    generatedInfoPlistKeys: {},
  };
  const f = byId(evaluateSourceFindings(scan), "purpose-string-camera");
  assert.equal(f.verdict, VERDICT.FAIL);
  assert.ok(f.evidence.file === "A.swift");
});

test("declared purpose string passes; a short one warns", () => {
  const scan = {
    featureSignals: { microphone: { count: 1, hits: [{ file: "A.swift", line: 1, text: "AVAudioRecorder()" }] } },
    purposeStrings: { declared: ["NSMicrophoneUsageDescription"], shortOrEmpty: ["NSMicrophoneUsageDescription"] },
    privacyManifests: [],
    requiredReasonApiUsage: [],
    infoPlists: [{ keys: { ITSAppUsesNonExemptEncryption: false } }],
    generatedInfoPlistKeys: {},
  };
  const findings = evaluateSourceFindings(scan);
  assert.equal(byId(findings, "purpose-string-microphone").verdict, VERDICT.PASS);
  assert.equal(byId(findings, "purpose-string-quality").verdict, VERDICT.WARN);
});

test("required-reason API with no privacy manifest is a FAIL", () => {
  const scan = {
    featureSignals: {},
    purposeStrings: { declared: [], shortOrEmpty: [] },
    requiredReasonApiUsage: [{ category: "NSPrivacyAccessedAPICategoryUserDefaults", count: 1, hits: [{ file: "S.swift", line: 2, text: "UserDefaults.standard" }] }],
    privacyManifests: [],
    infoPlists: [{ keys: { ITSAppUsesNonExemptEncryption: false } }],
    generatedInfoPlistKeys: {},
  };
  assert.equal(byId(evaluateSourceFindings(scan), "required-reason-no-manifest").verdict, VERDICT.FAIL);
});

test("UIWebView is a FAIL; account creation without deletion warns", () => {
  const scan = {
    featureSignals: {
      uiwebview_deprecated: { count: 1, hits: [{ file: "V.swift", line: 9, text: "UIWebView()" }] },
      account_creation: { count: 1, hits: [{ file: "Auth.swift", line: 4, text: "createUser()" }] },
    },
    purposeStrings: { declared: [], shortOrEmpty: [] },
    privacyManifests: [],
    requiredReasonApiUsage: [],
    infoPlists: [{ keys: { ITSAppUsesNonExemptEncryption: true } }],
    generatedInfoPlistKeys: {},
  };
  const findings = evaluateSourceFindings(scan);
  assert.equal(byId(findings, "uiwebview").verdict, VERDICT.FAIL);
  assert.equal(byId(findings, "account-deletion").verdict, VERDICT.WARN);
});

// ---- ASC rules ----

test("ASC checks FAIL on missing privacy policy / age rating / IDFA", () => {
  const asc = {
    appInfoLocalizations: [{ locale: "en-US", privacyPolicyUrl: "" }],
    versionLocalizations: [{ locale: "en-US", description: "A proper description.", supportUrl: "https://x.co/s" }],
    localesMissingScreenshots: [],
    incompleteAssets: { screenshots: [], previews: [] },
    ageRatingDeclared: false,
    build: { attached: true, processingState: "VALID", usesNonExemptEncryption: false },
    version: { usesIdfa: null },
    reviewDetail: null,
    hasLogin: false,
  };
  const findings = evaluateAscFindings(asc);
  assert.equal(byId(findings, "asc-privacy-policy").verdict, VERDICT.FAIL);
  assert.equal(byId(findings, "asc-age-rating").verdict, VERDICT.FAIL);
  assert.equal(byId(findings, "asc-idfa").verdict, VERDICT.FAIL);
  assert.equal(byId(findings, "asc-description").verdict, VERDICT.PASS);
  assert.equal(byId(findings, "asc-support-url").verdict, VERDICT.PASS);
});

test("demo-account check only fires when the app has a login", () => {
  const base = {
    appInfoLocalizations: [{ locale: "en-US", privacyPolicyUrl: "https://x.co/p" }],
    reviewDetail: {},
  };
  assert.equal(byId(evaluateAscFindings({ ...base, hasLogin: false }), "asc-demo-account"), undefined);
  assert.equal(byId(evaluateAscFindings({ ...base, hasLogin: true }), "asc-demo-account").verdict, VERDICT.WARN);
  const withDemo = { ...base, hasLogin: true, reviewDetail: { demoAccountName: "a", demoAccountPassword: "b" } };
  assert.equal(byId(evaluateAscFindings(withDemo), "asc-demo-account").verdict, VERDICT.PASS);
});

test("undefined ASC fields are skipped (no false FAIL)", () => {
  // Nothing fetched → no findings at all, so a transient read error never blocks.
  assert.deepEqual(evaluateAscFindings({}), []);
});

// ---- Rollup ----

test("evaluatePreflight: any FAIL means not ready; status reflects it", () => {
  const r = evaluatePreflight({
    scan: null,
    asc: { ageRatingDeclared: false },
  });
  assert.equal(r.ready, false);
  assert.match(r.status, /NOT READY/);
  assert.ok(r.blocking.length >= 1);
});

test("summarize: warnings don't block", () => {
  const s = summarize([
    { verdict: VERDICT.PASS },
    { verdict: VERDICT.WARN },
    { verdict: VERDICT.MANUAL },
  ]);
  assert.equal(s.ready, true);
  assert.match(s.status, /READY WITH CAUTION/);
  assert.equal(s.summary.WARN, 1);
});

test("end-to-end: MiniApp scan + synthetic ASC rolls up a blocked submission", () => {
  const scan = scanProject(MINIAPP);
  const r = evaluatePreflight({
    scan,
    asc: {
      appInfoLocalizations: [{ locale: "en-US", privacyPolicyUrl: "" }],
      versionLocalizations: [{ locale: "en-US", description: "desc", supportUrl: "" }],
      localesMissingScreenshots: ["en-US"],
      incompleteAssets: { screenshots: [], previews: [] },
      ageRatingDeclared: false,
      build: { attached: true, processingState: "VALID", usesNonExemptEncryption: false },
      version: { usesIdfa: null },
      reviewDetail: null,
      hasLogin: false,
    },
  });
  assert.equal(r.ready, false);
  assert.ok(r.meta.scannedProject, "scan ran");
  // The short "Mic" purpose string should warn.
  assert.equal(byId(r.findings, "purpose-string-quality").verdict, VERDICT.WARN);
});
