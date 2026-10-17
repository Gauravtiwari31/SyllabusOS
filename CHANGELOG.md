# Changelog

## 1.1.0 — 2026-10-17

### Android app
- **Opens full screen, like a native app.** The APK used to open in a Chrome tab with an address bar because `/.well-known/assetlinks.json` returned a 404: `.vercelignore` listed `android/`, which also matched `app/api/android/` and left the Digital Asset Links route out of every deployment. The pattern is now anchored (`/android/`), and the app's package and signing-key fingerprints are built in (`lib/android/assetlinks.ts`), so verification works with no Vercel configuration. `ANDROID_*` environment variables still add extra keys (e.g. Google Play's).
- New package id `com.syllabusos.app`, version 1.1.0 (code 2). Uninstall the old `com.crazycoders.syllabusos` build.
- Follows the device orientation (portrait and landscape) instead of being locked to portrait.
- Built with Gradle; release signing comes from `android/keystore.properties` (git-ignored). JCenter replaced by Maven Central; resource shrinking on.

### Phones, tablets and desktops
- **Phone landscape:** navigation moves into the header as icons and the bottom tab bar is hidden, so content gets the full height.
- **Safe areas:** headers clear the status bar and notch on edge-to-edge screens (installed iOS app, Android cutouts), and content stays clear of the notch in landscape.
- **Study sessions on phones:** focus mode hides the tab bar, the reply box stays pinned to the bottom of the screen, your reply appears instantly while the tutor thinks (and comes back to the box if sending fails), and the Hinglish switch is available on phones too.
- **Concept graph:** phones open on the list view (as intended), larger screens on the graph; your choice sticks.
- **Study Now tile:** the concept name no longer breaks mid-word (e.g. "Serializabilit-y" at 1024 px); the tile lays itself out by its own width.
- The diagnostic quiz also uses focus mode.

### Performance
- React Flow (concept graph) and Recharts (mastery trend) load on demand in their own chunks instead of with every dashboard visit.
- Only the fonts every page needs are preloaded (about 70 KB less high-priority download per page).
- The session check runs once per request instead of twice (layout + page), and the dashboard's session stats use one query instead of two.

### Quality
- New Playwright suite (`pnpm test:e2e`): every page at phone, phone-landscape, tablet, laptop and desktop sizes, navigation per screen, graph default view, the study session on a phone, and the published app links. CI runs it on the production build.
- Unit tests for the app-links builder (188 unit tests in total).
- `vitest.config.mts` (no more ESM/CJS config warning).
