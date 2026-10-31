// Local-project scanner for the App Store preflight.
//
// A zero-dependency JavaScript port of app-store-preflight's scan_project.py
// (MIT, Ilan Uzan — https://github.com/ilan-uzan/app-store-preflight). It
// collects *facts only*, no verdicts: which features the code uses, what the
// Info.plist / entitlements / privacy manifests declare, which required-reason
// APIs and manifest-requiring SDKs appear. src/preflight-rules.js turns these
// facts into guideline-cited findings.
//
// Everything here is best-effort and read-only: a missing or unreadable file
// is skipped, never fatal, so the scan degrades gracefully in CI or when a
// project is partially present.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, basename, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const DATA_DIR = fileURLToPath(new URL("./preflight-data/", import.meta.url));

const SKIP_DIRS = new Set([
  ".git", "node_modules", "Pods", "Carthage", "DerivedData", ".build", "build",
  ".swiftpm", "SourcePackages", ".gradle", ".dart_tool", "vendor", ".expo",
  "xcuserdata", ".idea", ".vscode",
]);
const SOURCE_EXT = new Set([
  ".swift", ".m", ".mm", ".h", ".c", ".cpp", ".js", ".jsx", ".ts", ".tsx", ".dart", ".kt",
]);
const MAX_FILE_BYTES = 2_000_000;
const MAX_HITS_PER_PATTERN = 25;

// Feature signals the rules use to decide which guidelines apply. Each key maps
// to a list of regex sources searched line-by-line across source files. A `(?i)`
// prefix (Python inline flag) is translated to a case-insensitive JS regex.
const FEATURE_SIGNALS = {
  storekit_iap: [String.raw`\bSKPaymentQueue\b`, String.raw`\bProduct\.products\(`, String.raw`\bTransaction\.(updates|currentEntitlements)\b`, String.raw`\bStoreView\b`, String.raw`\bSubscriptionStoreView\b`, String.raw`\bProductView\b`, String.raw`RevenueCat|Purchases\.shared|Adapty|Qonversion|Superwall`],
  restore_purchases: [String.raw`restoreCompletedTransactions`, String.raw`AppStore\.sync\(`, String.raw`(?i)restore\s*purchases?`, String.raw`restorePurchases`],
  external_payments: [String.raw`(?i)stripe`, String.raw`(?i)paypal`, String.raw`(?i)braintree`, String.raw`(?i)checkout\.com`, String.raw`ExternalPurchase`, String.raw`ExternalPurchaseLink`],
  sign_in_with_apple: [String.raw`ASAuthorizationAppleIDProvider`, String.raw`SignInWithAppleButton`, String.raw`ASAuthorizationAppleIDButton`],
  third_party_login: [String.raw`GIDSignIn|GoogleSignIn`, String.raw`FBSDKLoginKit|FacebookLogin|LoginManager\(\)`, String.raw`(?i)\bauth0\b`, String.raw`(?i)firebase.?auth|Auth\.auth\(\)`, String.raw`(?i)supabase.*auth|signInWithOAuth|signInWithIdToken`, String.raw`(?i)\bclerk\b`, String.raw`(?i)login\s*with\s*(google|facebook|twitter|x|github|linkedin|microsoft)`],
  account_creation: [String.raw`(?i)sign\s*up|create\s*(an\s*)?account|register\b|createUser`],
  account_deletion: [String.raw`(?i)delete\s*(my\s*)?account|deleteAccount|account\s*deletion|remove\s*account`],
  app_tracking_transparency: [String.raw`ATTrackingManager`, String.raw`requestTrackingAuthorization`],
  advertising_id: [String.raw`ASIdentifierManager`, String.raw`advertisingIdentifier`],
  ads_sdk: [String.raw`GoogleMobileAds|GADMobileAds|GADBannerView`, String.raw`(?i)applovin|ironsource|unityads|UnityAds|chartboost|vungle|inmobi|mintegral|pangle|AppLovinSDK`, String.raw`FBAudienceNetwork`],
  analytics_sdk: [String.raw`(?i)firebase.?analytics|FirebaseAnalytics`, String.raw`(?i)\bmixpanel\b`, String.raw`(?i)\bamplitude\b`, String.raw`(?i)\bsegment\b.*analytics`, String.raw`(?i)posthog`, String.raw`(?i)appsflyer`, String.raw`(?i)adjust\b`, String.raw`(?i)branch\.io|import Branch`, String.raw`(?i)sentry`, String.raw`(?i)crashlytics`, String.raw`(?i)datadog`, String.raw`(?i)telemetrydeck`],
  location: [String.raw`CLLocationManager`, String.raw`requestWhenInUseAuthorization|requestAlwaysAuthorization`, String.raw`CLLocationUpdate`],
  background_location: [String.raw`allowsBackgroundLocationUpdates`, String.raw`requestAlwaysAuthorization`],
  healthkit: [String.raw`\bHKHealthStore\b`, String.raw`import HealthKit`],
  health_or_medical_terms: [String.raw`(?i)\b(diagnos\w*|dosage|symptom|blood\s*pressure|glucose|heart\s*rate|medical|clinical)\b`],
  camera: [String.raw`AVCaptureSession|AVCaptureDevice`, String.raw`UIImagePickerController`, String.raw`\bCameraView\b`],
  photos: [String.raw`PHPhotoLibrary|PHPickerViewController|PhotosPicker`],
  microphone: [String.raw`AVAudioRecorder|AVAudioEngine|requestRecordPermission|AVAudioApplication`],
  speech: [String.raw`SFSpeechRecognizer`],
  contacts: [String.raw`CNContactStore`],
  calendar: [String.raw`EKEventStore`],
  bluetooth: [String.raw`CBCentralManager|CBPeripheralManager`],
  nfc: [String.raw`NFCNDEFReaderSession|NFCTagReaderSession`],
  face_id: [String.raw`LAContext`, String.raw`evaluatePolicy`],
  push_notifications: [String.raw`registerForRemoteNotifications`, String.raw`UNUserNotificationCenter`],
  notification_permission: [String.raw`requestAuthorization\(options`],
  web_view: [String.raw`\bWKWebView\b`, String.raw`\bWebView\b`, String.raw`react-native-webview`],
  uiwebview_deprecated: [String.raw`\bUIWebView\b`],
  safari_view: [String.raw`SFSafariViewController`, String.raw`ASWebAuthenticationSession`],
  user_generated_content: [String.raw`(?i)report\s*(post|user|content|abuse)`, String.raw`(?i)block\s*user`, String.raw`(?i)\b(comment|post|feed|chat|message)s?\b.*(upload|send|publish)`, String.raw`(?i)moderat`],
  chat_or_social: [String.raw`(?i)\bchat\b`, String.raw`(?i)direct\s*message`, String.raw`(?i)friend\s*request`, String.raw`(?i)\bfollowers?\b`],
  generative_ai: [String.raw`(?i)api\.openai\.com|OpenAI\(`, String.raw`(?i)api\.anthropic\.com|Anthropic\(`, String.raw`(?i)generativelanguage\.googleapis|GenerativeModel`, String.raw`FoundationModels|LanguageModelSession`, String.raw`(?i)replicate\.com|stability\.ai|elevenlabs`],
  crypto: [String.raw`(?i)\bwallet\b.*(seed|mnemonic|private\s*key)`, String.raw`(?i)web3|ethers|walletconnect`, String.raw`(?i)\bmining\b|\bminer\b`],
  vpn: [String.raw`NEVPNManager|NETunnelProviderManager|NEPacketTunnelProvider`],
  mdm: [String.raw`(?i)mobile\s*device\s*management|\bMDM\b`],
  callkit: [String.raw`CXProvider|CXCallController`],
  pushkit_voip: [String.raw`PKPushRegistry`],
  gambling_or_contests: [String.raw`(?i)\b(sweepstakes|lottery|casino|betting|wager|raffle)\b`],
  kids_terms: [String.raw`(?i)\b(kids?|children|toddler|preschool)\b`],
  screen_time_family_controls: [String.raw`FamilyControls|ManagedSettings|DeviceActivity`],
  matter: [String.raw`MatterSupport|import Matter`],
  widgets_extensions: [String.raw`WidgetKit|\bWidget\b.*:\s*Widget`, String.raw`NSExtensionPointIdentifier`],
  keyboard_extension: [String.raw`UIInputViewController`],
  siri_shortcuts: [String.raw`AppIntents|INIntent|AppShortcutsProvider`],
  apple_pay: [String.raw`PKPaymentRequest|PKPaymentAuthorization|PayWithApplePayButton`],
  game_center: [String.raw`GKLocalPlayer|GameKit`],
  arkit: [String.raw`ARKit|ARSession|RealityKit`],
  remote_desktop_or_streaming: [String.raw`(?i)remote\s*desktop|cloud\s*gaming|game\s*streaming`],
  dynamic_code_loading: [String.raw`\bdlopen\b`, String.raw`NSClassFromString\(`, String.raw`JSContext|JavaScriptCore`, String.raw`(?i)codepush|expo-updates|hot\s*update`, String.raw`(?i)\beval\(`],
  private_api_hints: [String.raw`performSelector\(.*"_`, String.raw`valueForKey:@?"_`, String.raw`value\(forKey:\s*"_`, String.raw`(?i)LSApplicationWorkspace`, String.raw`objc_msgSend`],
  placeholder_text: [String.raw`(?i)lorem\s+ipsum`, String.raw`(?i)\bplaceholder\b`, String.raw`(?i)coming\s+soon`, String.raw`(?i)\bTODO\b`, String.raw`(?i)\bFIXME\b`, String.raw`(?i)under\s+construction`, String.raw`(?i)test\s*user|dummy\s*data`],
  beta_or_test_wording: [String.raw`(?i)\b(beta|alpha|trial version|demo version|preview build)\b`],
  other_platform_mentions: [String.raw`(?i)\bandroid\b`, String.raw`(?i)google\s*play`, String.raw`(?i)\bwindows\s*phone\b`],
  insecure_http: [String.raw`http://(?!localhost|127\.0\.0\.1|www\.apple\.com/DTDs|schemas\.|www\.w3\.org)`],
  privacy_policy_link: [String.raw`(?i)privacy\s*policy`, String.raw`(?i)/privacy`],
  terms_link: [String.raw`(?i)terms\s*(of\s*(use|service))?`, String.raw`(?i)\bEULA\b`, String.raw`(?i)/terms`],
  support_contact: [String.raw`(?i)mailto:`, String.raw`(?i)contact\s*(us|support)`, String.raw`(?i)/support`],
  rate_review_prompt: [String.raw`SKStoreReviewController|requestReview`, String.raw`(?i)rate\s*(us|this\s*app)`],
  custom_review_prompt: [String.raw`(?i)itms-apps://.*action=write-review`, String.raw`(?i)leave\s*a\s*review`],
  alternate_icons: [String.raw`setAlternateIconName`],
  hidden_features_flags: [String.raw`(?i)remote\s*config|feature\s*flag|RemoteConfig|LaunchDarkly|Statsig|ConfigCat`],
};

const INFO_PLIST_KEYS_OF_INTEREST = new Set([
  "CFBundleDisplayName", "CFBundleName", "CFBundleIdentifier", "CFBundleShortVersionString",
  "CFBundleVersion", "UIBackgroundModes", "NSAppTransportSecurity", "ITSAppUsesNonExemptEncryption",
  "ITSEncryptionExportComplianceCode", "LSApplicationQueriesSchemes", "UIRequiredDeviceCapabilities",
  "CFBundleURLTypes", "UISupportedInterfaceOrientations", "UISupportedInterfaceOrientations~ipad",
  "UIRequiresFullScreen", "UILaunchStoryboardName", "UILaunchScreen", "UIApplicationSceneManifest",
  "NSUserActivityTypes", "LSSupportsOpeningDocumentsInPlace", "UIFileSharingEnabled",
  "GADApplicationIdentifier", "SKAdNetworkItems", "NSUserTrackingUsageDescription",
  "UIApplicationExitsOnSuspend", "MinimumOSVersion", "LSMinimumSystemVersion", "NSPrincipalClass",
  "NSExtension", "WKApplication", "WKCompanionAppBundleIdentifier", "WKRunsIndependentlyOfCompanionApp",
]);

const PBXPROJ_KEYS = new Set([
  "PRODUCT_BUNDLE_IDENTIFIER", "MARKETING_VERSION", "CURRENT_PROJECT_VERSION",
  "IPHONEOS_DEPLOYMENT_TARGET", "MACOSX_DEPLOYMENT_TARGET", "WATCHOS_DEPLOYMENT_TARGET",
  "TVOS_DEPLOYMENT_TARGET", "XROS_DEPLOYMENT_TARGET", "TARGETED_DEVICE_FAMILY", "SDKROOT",
  "SUPPORTED_PLATFORMS", "CODE_SIGN_ENTITLEMENTS", "INFOPLIST_FILE", "GENERATE_INFOPLIST_FILE",
  "SWIFT_VERSION", "ASSETCATALOG_COMPILER_APPICON_NAME", "ENABLE_APP_SANDBOX", "ENABLE_HARDENED_RUNTIME",
  "SUPPORTS_MACCATALYST", "SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD", "PRODUCT_NAME",
]);

function loadData(name, dflt) {
  const path = join(DATA_DIR, name);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return dflt;
  }
}

/** Compile a Python-style pattern (optional `(?i)` prefix) to a JS RegExp. */
function compilePattern(src) {
  let flags = "";
  let body = src;
  if (body.includes("(?i)")) {
    flags = "i";
    body = body.replace(/\(\?i\)/g, "");
  }
  try {
    return new RegExp(body, flags);
  } catch {
    return null;
  }
}

const COMPILED_SIGNALS = Object.fromEntries(
  Object.entries(FEATURE_SIGNALS).map(([k, pats]) => [
    k,
    pats.map((p) => ({ src: p, re: compilePattern(p) })).filter((x) => x.re),
  ]),
);

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}

/**
 * Minimal XML-plist parser — enough for Info.plist, .entitlements and
 * PrivacyInfo.xcprivacy. Returns a plain object/array/scalar, or null if the
 * file is not an XML plist we can parse (e.g. a binary plist).
 */
export function parseXmlPlist(xml) {
  const tokens = [];
  const re = /<(\/)?([A-Za-z0-9_]+)([^>]*?)(\/)?>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[2]) {
      const selfClose = m[4] === "/" || /\/\s*$/.test(m[3] || "");
      if (m[1]) tokens.push({ type: "close", name: m[2] });
      else if (selfClose) tokens.push({ type: "selfclose", name: m[2] });
      else tokens.push({ type: "open", name: m[2] });
    } else if (m[5] != null) {
      tokens.push({ type: "text", text: decodeEntities(m[5]) });
    }
  }
  // Start right after the <plist> open tag.
  let pos = tokens.findIndex((t) => t.type === "open" && t.name === "plist");
  if (pos < 0) return null;
  pos += 1;

  const skipWs = () => {
    while (tokens[pos] && tokens[pos].type === "text" && !tokens[pos].text.trim()) pos++;
  };
  const readText = () => {
    let s = "";
    for (;;) {
      const n = tokens[pos];
      if (!n) break;
      if (n.type === "close") { pos++; break; }
      if (n.type === "text") s += n.text;
      pos++;
    }
    return s;
  };
  const parseValue = () => {
    skipWs();
    const t = tokens[pos++];
    if (!t) return undefined;
    if (t.type === "selfclose") {
      switch (t.name) {
        case "true": return true;
        case "false": return false;
        case "array": return [];
        case "dict": return {};
        case "string": return "";
        default: return null;
      }
    }
    if (t.type !== "open") return undefined;
    switch (t.name) {
      case "dict": {
        const o = {};
        for (;;) {
          skipWs();
          const n = tokens[pos];
          if (!n || (n.type === "close" && n.name === "dict")) { if (n) pos++; break; }
          if (n.type === "open" && n.name === "key") {
            pos++;
            const key = readText();
            o[key] = parseValue();
          } else {
            pos++; // tolerate stray tokens
          }
        }
        return o;
      }
      case "array": {
        const a = [];
        for (;;) {
          skipWs();
          const n = tokens[pos];
          if (!n || (n.type === "close" && n.name === "array")) { if (n) pos++; break; }
          a.push(parseValue());
        }
        return a;
      }
      case "integer": return parseInt(readText().trim(), 10);
      case "real": return parseFloat(readText().trim());
      case "string": return readText();
      case "date": return readText().trim();
      case "data": return readText().trim();
      default: return readText();
    }
  };
  try {
    return parseValue();
  } catch {
    return null;
  }
}

/** Load a plist file (XML directly; binary via `plutil` when available). */
export function loadPlist(path) {
  let raw;
  try {
    if (statSync(path).size > MAX_FILE_BYTES) return null;
    raw = readFileSync(path);
  } catch {
    return null;
  }
  if (raw.slice(0, 6).toString("latin1") === "bplist") {
    // Binary plist: best-effort convert with plutil (macOS/Xcode only).
    try {
      const xml = execFileSync("plutil", ["-convert", "xml1", "-o", "-", path], {
        encoding: "utf8",
        maxBuffer: MAX_FILE_BYTES,
      });
      return parseXmlPlist(xml);
    } catch {
      return null;
    }
  }
  return parseXmlPlist(raw.toString("utf8"));
}

function readText(path) {
  try {
    if (statSync(path).size > MAX_FILE_BYTES) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function grep(text, re) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      hits.push([i + 1, lines[i].trim().slice(0, 200)]);
      re.lastIndex = 0;
    }
  }
  return hits;
}

/** width/height/alpha of a PNG without third-party libs. */
function pngInfo(path) {
  try {
    const fd = readFileSync(path);
    if (fd.length < 26) return null;
    if (fd.slice(0, 8).toString("latin1") !== "\x89PNG\r\n\x1a\n") return null;
    const width = fd.readUInt32BE(16);
    const height = fd.readUInt32BE(20);
    const colorType = fd.readUInt8(25);
    return { width, height, has_alpha_channel: colorType === 4 || colorType === 6 };
  } catch {
    return null;
  }
}

function pbxprojSettings(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*"?([A-Za-z0-9_]+(?:\[[^\]]*\])?)"?\s*=\s*(.+?);\s*$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim().replace(/^"|"$/g, "");
    const base = key.split("[")[0];
    if (PBXPROJ_KEYS.has(base) || base.startsWith("INFOPLIST_KEY_")) {
      (out[key] ||= new Set()).add(value);
    }
  }
  const res = {};
  for (const [k, v] of Object.entries(out)) res[k] = [...v].sort();
  return res;
}

function* walk(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(root, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.endsWith(".xcarchive")) continue;
      yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

/**
 * Scan an app project and return a facts object. `root` is an absolute path.
 * Never throws for ordinary filesystem problems; returns `{ error }` only when
 * the root itself is unreadable.
 */
export function scanProject(root) {
  if (!existsSync(root)) return { error: `Path not found: ${root}`, projectRoot: root };

  const requiredReason = loadData("required_reason_apis.json", { categories: [] });
  const sdkList = loadData("sdks_requiring_manifest.json", { sdks: [] });
  const purposeKeys = loadData("purpose_string_keys.json", { keys: [] });

  const facts = {
    projectRoot: root,
    projectTypes: [],
    xcodeProjects: [],
    infoPlists: [],
    generatedInfoPlistKeys: {},
    buildSettings: {},
    entitlements: [],
    privacyManifests: [],
    requiredReasonApiUsage: [],
    dependencies: { spm: [], cocoapods: [], carthage: [], npm: [], pub: [] },
    sdksRequiringManifest: [],
    featureSignals: {},
    appIcons: [],
    localizations: [],
    storeKitConfigs: [],
    fastlaneMetadata: [],
    counts: { sourceFiles: 0 },
    notes: [],
  };

  const rel = (p) => relative(root, p);
  const sources = [];

  for (const path of walk(root)) {
    const name = basename(path);
    const ext = extname(name);
    const r = rel(path);

    if (name === "project.pbxproj") {
      const text = readText(path) || "";
      facts.xcodeProjects.push(r);
      const settings = pbxprojSettings(text);
      for (const [k, v] of Object.entries(settings)) {
        if (k.startsWith("INFOPLIST_KEY_")) {
          const kk = k.slice("INFOPLIST_KEY_".length);
          (facts.generatedInfoPlistKeys[kk] ||= []).push(...v);
        } else {
          (facts.buildSettings[k] ||= []).push(...v);
        }
      }
    } else if (name === "Info.plist" || (ext === ".plist" && name.endsWith("-Info.plist"))) {
      const pl = loadPlist(path);
      if (pl && typeof pl === "object" && !Array.isArray(pl)) {
        const usage = {};
        const keys = {};
        for (const [k, v] of Object.entries(pl)) {
          if (k.endsWith("UsageDescription")) usage[k] = v;
          if (INFO_PLIST_KEYS_OF_INTEREST.has(k)) keys[k] = v;
        }
        facts.infoPlists.push({ path: r, usageDescriptions: usage, keys });
      }
    } else if (ext === ".entitlements") {
      const pl = loadPlist(path);
      if (pl && typeof pl === "object" && !Array.isArray(pl)) {
        facts.entitlements.push({ path: r, values: pl });
      }
    } else if (name === "PrivacyInfo.xcprivacy") {
      const pl = loadPlist(path);
      facts.privacyManifests.push({
        path: r,
        parsed: pl != null,
        values: pl && typeof pl === "object" ? pl : null,
      });
    } else if (name === "Package.resolved") {
      try {
        const data = JSON.parse(readText(path) || "{}");
        const pins = data.pins || data.object?.pins || [];
        for (const p of pins) {
          facts.dependencies.spm.push({
            identity: p.identity || p.package,
            location: p.location || p.repositoryURL,
            version: (p.state || {}).version,
          });
        }
      } catch {
        facts.notes.push(`Could not parse ${r}`);
      }
    } else if (name === "Podfile.lock") {
      const text = readText(path) || "";
      for (const m of text.matchAll(/^  - ([A-Za-z0-9_\-+/.]+) \(([^)]+)\)/gm)) {
        facts.dependencies.cocoapods.push({ name: m[1], version: m[2] });
      }
    } else if (name === "Cartfile.resolved") {
      for (const line of (readText(path) || "").split(/\r?\n/)) {
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          facts.dependencies.carthage.push({
            name: parts[1].replace(/"/g, ""),
            version: parts[2].replace(/"/g, ""),
          });
        }
      }
    } else if (name === "package.json" && !r.includes("node_modules")) {
      try {
        const data = JSON.parse(readText(path) || "{}");
        const deps = { ...data.dependencies, ...data.devDependencies };
        for (const [k, v] of Object.entries(deps)) facts.dependencies.npm.push({ name: k, version: v });
        if ("react-native" in deps) facts.projectTypes.push("react-native");
        if ("expo" in deps) facts.projectTypes.push("expo");
        if ("@capacitor/core" in deps || "cordova" in deps) facts.projectTypes.push("hybrid-webview");
      } catch {
        /* ignore */
      }
    } else if (name === "pubspec.lock") {
      facts.projectTypes.push("flutter");
      for (const m of (readText(path) || "").matchAll(
        /^ {2}([a-z0-9_]+):\n(?: {4}.*\n)*? {4}version: "([^"]+)"/gm,
      )) {
        facts.dependencies.pub.push({ name: m[1], version: m[2] });
      }
    } else if (ext === ".storekit") {
      facts.storeKitConfigs.push(r);
    } else if (name === "Contents.json" && r.includes(".appiconset")) {
      const folder = dirname(path);
      let data = {};
      try {
        data = JSON.parse(readText(path) || "{}");
      } catch {
        /* ignore */
      }
      const images = [];
      for (const img of data.images || []) {
        const fn = img.filename;
        const info = fn ? pngInfo(join(folder, fn)) : null;
        images.push({
          filename: fn, size: img.size, idiom: img.idiom,
          platform: img.platform, appearances: img.appearances, png: info,
        });
      }
      facts.appIcons.push({ path: rel(folder), images });
    } else if (name.endsWith(".xcstrings")) {
      facts.localizations.push(r);
    }

    if (r.includes("/fastlane/metadata/") || r.startsWith("fastlane/metadata/")) {
      facts.fastlaneMetadata.push(r);
    }
    if (SOURCE_EXT.has(ext)) sources.push(path);
  }

  // .lproj directories (localizations).
  for (const path of walkDirs(root)) {
    if (path.endsWith(".lproj")) facts.localizations.push(rel(path));
  }
  facts.localizations = [...new Set(facts.localizations)].sort();

  if (facts.xcodeProjects.length) facts.projectTypes.push("xcode");
  if (existsSync(join(root, "Package.swift"))) facts.projectTypes.push("swiftpm");
  facts.projectTypes = [...new Set(facts.projectTypes)].sort();
  facts.counts.sourceFiles = sources.length;

  // Read all source files once.
  const texts = {};
  for (const path of sources) {
    const t = readText(path);
    if (t != null) texts[rel(path)] = t;
  }

  // Feature signals.
  for (const [key, pats] of Object.entries(COMPILED_SIGNALS)) {
    const hits = [];
    for (const [r, t] of Object.entries(texts)) {
      for (const { src, re } of pats) {
        for (const [lineNo, line] of grep(t, re)) {
          hits.push({ file: r, line: lineNo, text: line, pattern: src });
        }
      }
    }
    if (hits.length) facts.featureSignals[key] = { count: hits.length, hits: hits.slice(0, MAX_HITS_PER_PATTERN) };
  }

  // Required-reason API usage.
  for (const cat of requiredReason.categories || []) {
    const hits = [];
    for (const [r, t] of Object.entries(texts)) {
      for (const sym of cat.symbols || []) {
        const re = new RegExp(`\\b${sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
        for (const [lineNo, line] of grep(t, re)) {
          hits.push({ file: r, line: lineNo, symbol: sym, text: line });
        }
      }
    }
    if (hits.length) {
      facts.requiredReasonApiUsage.push({ category: cat.category, count: hits.length, hits: hits.slice(0, MAX_HITS_PER_PATTERN) });
    }
  }

  // SDKs that require a privacy manifest.
  const depNames = new Set();
  for (const group of Object.values(facts.dependencies)) {
    for (const d of group) {
      for (const field of ["identity", "name", "location"]) {
        const v = d[field];
        if (v) {
          depNames.add(v.toLowerCase().replace(/\/$/, "").split("/").pop().replace(/\.git$/, ""));
          depNames.add(v.toLowerCase());
        }
      }
    }
  }
  for (const sdk of sdkList.sdks || []) {
    const aliases = (sdk.aliases || [sdk.name || ""]).map((a) => a.toLowerCase());
    if (aliases.some((a) => depNames.has(a) || [...depNames].some((n) => a === n.split("/")[0]))) {
      facts.sdksRequiringManifest.push(sdk.name);
    }
  }

  // Purpose strings: declared keys, values, and heuristics for the rules.
  const declared = new Set();
  for (const p of facts.infoPlists) for (const k of Object.keys(p.usageDescriptions)) declared.add(k);
  for (const k of Object.keys(facts.generatedInfoPlistKeys)) if (k.endsWith("UsageDescription")) declared.add(k);
  const values = {};
  for (const p of facts.infoPlists) {
    for (const [k, v] of Object.entries(p.usageDescriptions)) (values[k] ||= []).push({ source: p.path, value: v });
  }
  for (const [k, vs] of Object.entries(facts.generatedInfoPlistKeys)) {
    if (k.endsWith("UsageDescription")) {
      (values[k] ||= []).push(...vs.map((v) => ({ source: "build setting INFOPLIST_KEY_" + k, value: v })));
    }
  }
  const known = new Set((purposeKeys.keys || []).map((k) => k.key));
  facts.purposeStrings = {
    declared: [...declared].sort(),
    values,
    shortOrEmpty: Object.keys(values)
      .filter((k) => values[k].some((v) => String(v.value).trim().length < 20))
      .sort(),
    unknownKeys: [...declared].filter((k) => known.size && !known.has(k)).sort(),
  };

  if (!facts.xcodeProjects.length && !facts.projectTypes.length) {
    facts.notes.push("No Xcode project, Swift package, React Native, Expo or Flutter project was found under the root.");
  }
  return facts;
}

function* walkDirs(root) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(root, e.name);
    yield full;
    yield* walkDirs(full);
  }
}
