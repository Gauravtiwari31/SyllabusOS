// Digital Asset Links for the Android app (Trusted Web Activity). Served at
// /.well-known/assetlinks.json via a rewrite in next.config.ts. Proves the app and this site
// belong together, so the app opens full screen without a browser URL bar.
//
// The app's package and signing keys are built in (lib/android/assetlinks.ts). Optional extras
// in the hosting environment:
//   ANDROID_PACKAGE_NAME               e.g. com.syllabusos.app
//   ANDROID_SHA256_CERT_FINGERPRINTS   comma-separated, e.g. Google Play's app-signing key
import { NextResponse } from "next/server";
import { buildAssetLinks } from "@/lib/android/assetlinks";

export const dynamic = "force-dynamic";

export function GET() {
  const body = buildAssetLinks(
    process.env.ANDROID_PACKAGE_NAME,
    process.env.ANDROID_SHA256_CERT_FINGERPRINTS,
  );
  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
