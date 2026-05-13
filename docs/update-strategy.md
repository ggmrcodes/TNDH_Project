# HaemoCare Update Strategy

## Why two channels?

HaemoCare uses two independent delivery mechanisms because not every code change is the same kind of change. Most day-to-day work — bug fixes, copy tweaks, UI layout adjustments, new screens that only depend on already-bundled libraries — touches only the JavaScript bundle and can be shipped without touching the native binary. These updates go through **EAS Update**, which silently downloads a new bundle on the next app launch with no user action required. A smaller class of changes requires rebuilding the native binary: adding a new native dependency, bumping the Expo SDK, adding a permission to `AndroidManifest.xml`, or changing any `app.json` field that is baked into the APK at build time. For this second class, EAS Update cannot help — you need a new APK. The **native update manifest** handles this: the app polls a small JSON file at launch, and if a newer APK is available it shows an in-app banner prompting the user to sideload the new build. Keeping these two channels separate lets you ship the common case (JS-only) silently and without any ceremony, while reserving the heavier APK process for when it is genuinely required.

---

## Shipping a JS-only update (the 90% case)

Edit your code, commit, then push the update to the `preview` branch on EAS:

```bash
eas update --branch preview --message "Fix bleeding log validation bug"
```

On the next app launch, `expo-updates` fetches the latest bundle for the branch and installs it in the background. The user sees the update on the launch after that (one extra launch for the swap to take effect).

**Runtime version gate.** `app.json` is configured with `runtimeVersion: { policy: "appVersion" }`. This means EAS ties each bundle to the `version` string in `app.json`. If you bump `version` (e.g., `0.1.0` → `0.2.0`) to ship a native update, every installed copy that still has the old version string will stop receiving new JS bundles from EAS Update — they will only see the banner asking them to install the new APK. This is intentional: once a native boundary has been crossed, you don't want old binaries pulling JS bundles that might assume newer native APIs. Do not bump `version` for JS-only changes.

**Free tier note.** Expo's free plan covers roughly 1 000 monthly active users for EAS Update. HaemoCare is a pilot, so this is sufficient. If the rollout expands, revisit the plan before hitting the cap — update delivery silently stops for users over the limit.

---

## Shipping a native update (when needed)

1. **Bump `version` and `versionCode` in `app.json`.** For example, `"version": "0.2.0"` and `"versionCode": 2`. The `versionCode` must always increase; Android rejects installs where it does not.

2. **Build the APK on EAS:**
   ```bash
   eas build --platform android --profile preview
   ```
   Cloud builds take 15–25 minutes. The result is a `.apk` file (not an AAB, because the `preview` profile targets sideloading). Download it from the EAS dashboard when complete.

3. **Create a GitHub Release.** Tag it `v0.2.0` on `ggmrcodes/TNDH_Project`. Attach the APK as a release asset and write release notes describing what changed and why users need to update.

4. **Update `update-manifest.json` in the repo root.** Set `latest_version`, `apk_url` (the GitHub Release asset download URL), `release_notes_url`, and `released_at`:
   ```json
   {
     "latest_version": "0.2.0",
     "minimum_supported_version": "0.1.0",
     "apk_url": "https://github.com/ggmrcodes/TNDH_Project/releases/download/v0.2.0/haemocare-v0.2.0.apk",
     "release_notes_url": "https://github.com/ggmrcodes/TNDH_Project/releases/tag/v0.2.0",
     "released_at": "2026-05-15T09:00:00+07:00"
   }
   ```

5. **Commit and push the manifest to `main`.** The raw.githubusercontent.com URL serves from `main`, so the updated manifest is live once the commit lands.

6. **User flow.** On the next app launch (or via Settings → Check for updates), the app fetches the manifest, compares `latest_version` against the installed version, and shows an "Update available" banner. The user taps it, lands in the browser, downloads the APK, and installs it. Android remembers the "install unknown apps" permission for the browser they used, so subsequent installs are one fewer tap.

---

## Manifest file format

```json
{
  "latest_version": "0.2.0",
  "minimum_supported_version": "0.1.0",
  "apk_url": "https://github.com/ggmrcodes/TNDH_Project/releases/download/v0.2.0/haemocare-v0.2.0.apk",
  "release_notes_url": "https://github.com/ggmrcodes/TNDH_Project/releases/tag/v0.2.0",
  "released_at": "2026-05-15T09:00:00+07:00"
}
```

**Required fields:** `latest_version`, `minimum_supported_version`, `apk_url`.

**Optional fields:** `release_notes_url`, `released_at`.

`minimum_supported_version` is the key field for forcing updates. Clients whose installed version is below this value see a "required update" banner that cannot be dismissed — the app blocks further use until they install the new APK. Use this only when an older client will break against the current backend (e.g., a server-side breaking change to the API, a removed endpoint, a changed data schema). For ordinary feature releases where the old version still functions, leave `minimum_supported_version` at the last release that was safe and make the banner dismissable. Forcing updates too aggressively erodes trust; reserve it for genuine incompatibilities.

---

## Where the manifest lives

Default URL: `https://raw.githubusercontent.com/ggmrcodes/TNDH_Project/main/update-manifest.json`

To update, commit a new `update-manifest.json` to the root of `main`. No deploy step required.

To override the URL (e.g., to host the manifest on Supabase Storage or S3 for faster propagation or access control), set the `EXPO_PUBLIC_UPDATE_MANIFEST_URL` environment variable before the build. The app reads this at startup and uses it in place of the default.

**CDN caching caveat.** `raw.githubusercontent.com` is served via Cloudflare. Cache TTLs vary; in practice, updated content propagates in roughly 5 minutes, but during Cloudflare congestion it can take longer. If you need deterministic propagation timing — for example, coordinating a manifest update with a server-side change — host the manifest yourself and control the cache headers.

---

## Migration to Play Store (eventually)

When HaemoCare graduates from the pilot to a public release, move distribution to the Play Store. The one-time migration cost is that existing sideload users must uninstall the sideloaded APK and reinstall from the Play Store link; Android won't upgrade a sideloaded app to a Play Store-signed one in place, because the signing certificates differ. After that reinstall, Play Store owns all future updates — both JS bundle updates (EAS Update continues to work transparently) and native updates (Play Store triggers an in-app update prompt automatically).

You can leave the native update manifest checker running; it does no harm. The practical step is to stop publishing new manifest entries and let Play Store become the source of truth. If you want to clean things up, `EXPO_PUBLIC_UPDATE_MANIFEST_URL` can point to a manifest that permanently returns the current version, suppressing the banner entirely.

---

## What can go wrong

- **Manifest URL unreachable / GitHub down.** The fetch fails silently; the app continues working normally. No banner is shown. Users are not alerted. Silent degradation is intentional — a transient outage of the manifest host should not break the app.

- **Wrong `apk_url` in the manifest.** The user taps the banner, lands in the browser, and gets a 404. They will contact you (likely via LINE). Fix the manifest JSON and push to `main`; the corrected URL propagates within minutes.

- **User on Android below API 24 (Android 7).** Expo SDK 54 requires API 24 as the minimum. The app will not install at all on older devices — this is a hard floor, not a runtime degradation. Confirm device OS versions with the pilot cohort before distribution.

- **User declines "install unknown apps" prompt.** The system install dialog is cancelled. The APK is not installed. The banner will reappear on the next launch because the version hasn't changed. The user can try again from Settings.

- **Cellular connection drops mid-download.** Android's browser download manager pauses the download and resumes automatically when connectivity is restored. No action required unless the user has cleared the download or the session has expired.

---

## Future improvements (not in v1)

- **In-app APK download.** Instead of handing off to the browser, use `expo-file-system` to download the APK directly into the app's cache directory, then launch the system installer via `expo-intent-launcher`. This removes the browser round-trip but adds permission complexity (`WRITE_EXTERNAL_STORAGE` or scoped storage handling depending on API level) and more failure surface to own.

- **Background download via Android `DownloadManager`.** Enqueue the APK download in the background so it is ready when the user next opens the app. Requires deeper native configuration and a notification channel to surface download progress.

- **APK signature verification.** Before launching the installer, verify that the downloaded APK's signing certificate matches a pinned public key. Protects against a compromised GitHub Release asset or a MITM substituting a different APK via a spoofed manifest URL.
