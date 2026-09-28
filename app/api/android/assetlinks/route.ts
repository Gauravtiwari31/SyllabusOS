// Digital Asset Links for the Android app (Trusted Web Activity). Served at
// /.well-known/assetlinks.json via a rewrite in next.config.ts. Proves the app and this site
// belong together, so the app opens full screen without a browser URL bar.
//
// Configure in the hosting environment (no code change per key):
//   ANDROID_PACKAGE_NAME               e.g. com.crazycoders.syllabusos
//   ANDROID_SHA256_CERT_FINGERPRINTS   comma-separated, e.g. your upload key and Play's app-signing key
import { NextResponse } from "next/server";

const PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export const dynamic = "force-dynamic";

export function GET() {
  const pkg = process.env.ANDROID_PACKAGE_NAME?.trim() ?? "";
  const prints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter((f) => FINGERPRINT.test(f));

  const body =
    PACKAGE.test(pkg) && prints.length > 0
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: prints },
          },
        ]
      : [];

  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
