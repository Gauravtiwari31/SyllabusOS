// Digital Asset Links for the Android app (Trusted Web Activity). Android fetches
// /.well-known/assetlinks.json and opens the app full screen only when the installed APK's
// package name and signing certificate are listed here; otherwise the TWA falls back to a
// Chrome Custom Tab with a URL bar.
//
// The app's own package and signing keys are built in, so a fresh deployment verifies with no
// configuration. ANDROID_PACKAGE_NAME + ANDROID_SHA256_CERT_FINGERPRINTS add more (e.g. Google
// Play's app-signing key, or a fork's own package). Fingerprints are public: Android publishes
// them in every APK.

export type AssetStatement = {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
};

export const ANDROID_APP = {
  packageName: "com.syllabusos.app",
  fingerprints: [
    // android/release.jks: signs the APK and AAB attached to GitHub releases (docs/ANDROID.md).
    "17:E7:E7:4A:64:75:70:B5:2D:C9:76:8A:60:41:1E:45:BD:31:C4:7C:04:21:3F:D4:26:8A:86:5F:F2:48:48:45",
    // android/android.keystore: the original Bubblewrap key.
    "3F:83:43:0E:78:2A:47:CD:C2:03:D2:8B:E4:40:73:47:DC:49:95:7C:7D:FA:2E:0D:61:A5:00:2D:14:80:86:27",
  ],
} as const;

const PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/** Accepts "AB:CD:…" or bare hex (keytool and apksigner print different forms). */
export function normalizeFingerprint(raw: string): string | null {
  const hex = raw.trim().toUpperCase().replace(/:/g, "");
  if (!/^[0-9A-F]{64}$/.test(hex)) return null;
  const f = hex.match(/../g)!.join(":");
  return FINGERPRINT.test(f) ? f : null;
}

/** Statements for the built-in app plus any configured through the environment. */
export function buildAssetLinks(envPackage?: string, envFingerprints?: string): AssetStatement[] {
  const byPackage = new Map<string, Set<string>>([
    [ANDROID_APP.packageName, new Set(ANDROID_APP.fingerprints)],
  ]);

  const pkg = envPackage?.trim() ?? "";
  const prints = (envFingerprints ?? "")
    .split(",")
    .map(normalizeFingerprint)
    .filter((f): f is string => f !== null);
  if (PACKAGE.test(pkg) && prints.length > 0) {
    const set = byPackage.get(pkg) ?? new Set<string>();
    for (const f of prints) set.add(f);
    byPackage.set(pkg, set);
  }

  return [...byPackage].map(([package_name, set]) => ({
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name, sha256_cert_fingerprints: [...set] },
  }));
}
