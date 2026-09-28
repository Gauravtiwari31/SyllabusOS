# Android app (APK) for SyllabusOS

The app is a **Trusted Web Activity (TWA)**: a real Android app that opens your deployed site full screen in Chrome's engine. Everything is free. Google sign-in keeps working (Google blocks sign-in inside plain WebView wrappers, but a TWA runs in Chrome), and every website deploy updates the app instantly without a new APK.

Already prepared in the code:

| What | Where |
|---|---|
| Web app manifest (name, colours, start page, shortcuts) | `app/manifest.ts` → `/manifest.webmanifest` |
| Icons (192/512, maskable 192/512, Apple 180) | `public/icons/` |
| Offline screen and service worker | `public/offline.html`, `public/sw.js` |
| Digital Asset Links, built from env vars | `/.well-known/assetlinks.json` → `app/api/android/assetlinks/route.ts` |
| Keystore and build output ignored by git | `.gitignore` (`android/*.keystore`, `*.apk`, `*.aab`) |

## Before you start

- The site is deployed on Vercel over HTTPS (see [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md)).
- `https://<your-domain>/manifest.webmanifest` opens in a browser.
- Node.js is installed. Bubblewrap downloads the JDK and Android SDK itself on first run (about 1.5 GB).

Below, `<your-domain>` is your production domain, e.g. `syllabusos.vercel.app`.

## 1. Generate the Android project

From the repo root:

```bash
mkdir android
```

```bash
cd android
```

```bash
npx @bubblewrap/cli init --manifest https://<your-domain>/manifest.webmanifest
```

Answer the prompts:

| Prompt | Answer |
|---|---|
| Domain | `<your-domain>` |
| URL path | `/dashboard` |
| Application name / Short name | `SyllabusOS` |
| Application ID | `com.crazycoders.syllabusos` (**can never change after you publish**) |
| Display mode | `standalone` |
| Orientation | `portrait` |
| Status bar / navigation / splash colours | `#000000` |
| Icon URL | `https://<your-domain>/icons/icon-512.png` |
| Maskable icon URL | `https://<your-domain>/icons/maskable-512.png` |
| Monochrome icon | leave empty |
| Play Billing / Geolocation | No |
| Key store location | `./android.keystore` |
| Key name | `android` |
| Passwords | choose strong ones and save them in a password manager |

**Back up `android.keystore` and both passwords** somewhere safe (not in git). If you lose them you can never publish an update to this app.

## 2. Build

```bash
npx @bubblewrap/cli build
```

You get `app-release-signed.apk` (install and share) and `app-release-bundle.aab` (Play Store) in the `android/` folder.

## 3. Link the app to the website (removes the URL bar)

Print your signing key's fingerprint:

```bash
npx @bubblewrap/cli fingerprint list
```

Copy the `SHA256` value (32 pairs like `14:6D:E9:…`). In Vercel → Settings → Environment Variables (Production), add:

| Name | Value |
|---|---|
| `ANDROID_PACKAGE_NAME` | `com.crazycoders.syllabusos` |
| `ANDROID_SHA256_CERT_FINGERPRINTS` | the SHA256 value (more than one? separate with commas) |

Redeploy, then open `https://<your-domain>/.well-known/assetlinks.json`: it should show your package name and fingerprint (it shows `[]` until both variables are set).

## 4. Install on your phone

Copy the APK to the phone and open it (allow **Install unknown apps** for your file manager when asked), or with the phone connected over USB with USB debugging on:

```bash
npx @bubblewrap/cli install
```

The app should open full screen with no address bar. If a URL bar shows, the fingerprint or package name in Vercel doesn't match the APK: fix it, redeploy, then clear Chrome's storage for your domain (or reinstall the app).

## 5. Share with testers: Firebase App Distribution (free, Spark plan)

1. [Firebase console](https://console.firebase.google.com) → **Add project** (Analytics optional).
2. **Add app → Android** → package name `com.crazycoders.syllabusos` → register. Skip the SDK and `google-services.json` steps; the app doesn't need them.
3. **Release & Monitor → App Distribution → Get started**.
4. Drag in `app-release-signed.apk`, add testers' emails (or a tester group), add release notes, **Distribute**.

Testers get an email, install the Firebase App Tester app once, and install SyllabusOS from there. Each new APK you upload notifies them.

## 6. Updating the app

- **Website changes** (features, fixes, design): just deploy to Vercel. The app shows them immediately.
- **App changes** (name, icon, colours, start page): edit `android/twa-manifest.json`, increase `appVersionCode` and `appVersionName`, then:

```bash
npx @bubblewrap/cli update
```

```bash
npx @bubblewrap/cli build
```

Upload the new APK to App Distribution.

## 7. Google Play (optional, one-time $25 developer fee)

1. Play Console → create the app → upload `app-release-bundle.aab` to an internal testing track first.
2. Play re-signs the app. Copy the **App signing key certificate SHA-256** from Play Console → Test and release → Setup → **App signing**.
3. Add it to `ANDROID_SHA256_CERT_FINGERPRINTS` next to your own, comma-separated, and redeploy. Without it, the Play Store version shows a URL bar.

## Troubleshooting

| Symptom | Fix |
|---|---|
| URL bar at the top | `assetlinks.json` doesn't match: check package name and fingerprint (step 3), redeploy, reinstall. |
| "App not installed" | An older build signed with a different key is installed. Uninstall it first. |
| Blank or "You're offline" screen | No connection; the app needs the internet for the tutor and plan. |
| Google sign-in fails | Add the production origin and redirect URI in Google Cloud and set the consent screen to "In production" ([DEPLOY_VERCEL.md](DEPLOY_VERCEL.md), step 7). |
