# HaemoCare — APK Build + Update Workflow

Operational runbook for shipping HaemoCare to Android testers via sideload, then keeping them updated.

> Full strategy doc: `../docs/update-strategy.md`

## One-time setup (~10 min)

Done once per machine.

### 1. Install EAS CLI

```bash
npm install -g eas-cli
eas --version    # should print 16.x or newer
```

### 2. Sign in to your Expo account

```bash
eas login
# enter Expo account credentials (free account is fine for low MAU)
```

If you don't have an Expo account yet: `expo register` or sign up at https://expo.dev/signup.

### 3. Provision the Expo cloud project + inject project ID

From inside `HaemoCare/`:

```bash
cd HaemoCare
eas update:configure
```

This will:
- Create an Expo project (or link to an existing one named `haemocare`)
- Replace the `PLACEHOLDER_PROJECT_ID` literal in `app.json`'s `updates.url` with the real cloud project ID
- Add an `extra.eas.projectId` entry to `app.json`

Commit the resulting `app.json` change:

```bash
git add app.json
git commit -m "chore(eas): inject Expo project ID into app.json"
git push
```

## First APK build (v1.0.0)

The `version` in `app.json` is currently `1.0.0`. The preview profile in `eas.json` produces a signed APK distributable via direct download.

```bash
cd HaemoCare
eas build --platform android --profile preview
```

- Cloud build runs (~15–25 min for first build, ~8–12 min after).
- EAS will ask permission to generate an Android keystore the first time — say yes. EAS stores + backs it up; you'll need the same keystore for every future build.
- When done, the CLI prints a build URL. Visit it, download the `.apk` file.

## Cut a GitHub Release for v1.0.0

```bash
# In the repo root:
gh release create v1.0.0 \
  /path/to/haemocare-v1.0.0.apk \
  --title "HaemoCare v1.0.0" \
  --notes "First public pilot release. See README for install."
```

(Or do it via the web UI at https://github.com/ggmrcodes/TNDH_Project/releases/new — tag `v1.0.0`, attach the APK, write release notes.)

The APK URL will look like:
```
https://github.com/ggmrcodes/TNDH_Project/releases/download/v1.0.0/haemocare-v1.0.0.apk
```

## Update `update-manifest.json`

The starter manifest at `../update-manifest.json` (repo root) is already pointed at v1.0.0. If the actual APK filename or release tag differs, edit those fields:

```bash
# From repo root:
$EDITOR update-manifest.json
git add update-manifest.json
git commit -m "chore(release): publish manifest for v1.0.0"
git push origin main
```

The HaemoCare app fetches this file from `https://raw.githubusercontent.com/ggmrcodes/TNDH_Project/main/update-manifest.json`. GitHub's raw CDN cache typically refreshes within ~5 minutes.

## Distribute to testers

Share the GitHub Release URL or the direct APK URL with patients. Their flow:

1. Open the link on their Android phone
2. Tap to download the `.apk`
3. When prompted, allow "install unknown apps" for the browser (Settings → Apps → Browser → Install unknown apps)
4. Open the downloaded file, tap Install
5. Open HaemoCare

`HaemoCare/INSTALL.md` has a TH/EN install guide they can be sent alongside.

---

## Shipping subsequent updates

### JS-only update (the common case — 90% of changes)

Bug fixes, copy edits, layout changes, new screens that don't add native deps. **No new APK needed; existing installs update silently.**

```bash
cd HaemoCare
git pull
# make your changes, run tests + typecheck
npm test && npx tsc --noEmit

eas update --branch preview --message "Fix urgent symptom outcome alignment"
```

Within seconds the bundle is live. Next time any patient opens HaemoCare, it silently downloads + applies the new JS bundle on the next launch.

> **Important:** `runtimeVersion: { policy: "appVersion" }` ties update eligibility to `version` in `app.json`. If you bump `version` from `1.0.0` to `1.1.0`, prior installs (still running native version `1.0.0`) STOP receiving OTA updates from the `1.0.0` runtime bundles. This is intentional — when native ABI changes you need a new APK. Keep `version` stable while shipping JS-only updates.

### Native update (rare — new permission, new dep, SDK upgrade)

```bash
# 1. Bump the `version` field in app.json (versionCode is owned by EAS Cloud — do NOT touch it here)
$EDITOR app.json
# Update "version": "1.0.0" -> "1.1.0"
git add app.json
git commit -m "chore(release): bump to v1.1.0 (added X native dep)"

# 2. Build the APK
cd HaemoCare
eas build --platform android --profile preview

# 3. Cut a GitHub Release
gh release create v1.1.0 /path/to/haemocare-v1.1.0.apk \
  --title "HaemoCare v1.1.0" \
  --notes "Adds X. See full notes inline."

# 4. Update the manifest
cd ..
$EDITOR update-manifest.json
# - bump latest_version to "1.1.0"
# - update apk_url to the new release download URL
# - update release_notes_url
# - update released_at
git add update-manifest.json
git commit -m "chore(release): publish manifest for v1.1.0"
git push origin main
```

Existing patients see the in-app "Update available" banner on their next app launch (or via Privacy Settings → Check for updates). They tap the banner → browser opens to the APK URL → reinstall.

### Forced update (rare — breaking server-side change)

If a release contains a change that breaks older clients (e.g. a Supabase schema migration that removes a column), set `minimum_supported_version` in the manifest to the new release version. Older clients get the "Update required" banner that can't be dismissed.

```json
{
  "latest_version": "1.2.0",
  "minimum_supported_version": "1.2.0",
  ...
}
```

Use sparingly — it's a hard-stop UX.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `eas build` fails with "project not configured" | `updates.url` still has `PLACEHOLDER_PROJECT_ID` | Run `eas update:configure` from inside `HaemoCare/` |
| Tester gets "Install blocked" on Android | "Install unknown apps" not enabled for the browser | Settings → Apps → [browser] → Install unknown apps → Allow |
| Update banner never appears even after release | Manifest URL unreachable or stale CDN | Check `https://raw.githubusercontent.com/ggmrcodes/TNDH_Project/main/update-manifest.json` directly in a browser; force-refresh after ~5 min |
| Required-update banner showing for everyone unintentionally | `minimum_supported_version` accidentally set too high | Lower it in the manifest + push |
| JS update doesn't reach a tester | They installed a different runtime `version` than the published bundle | Either republish the JS update against their `version`, OR ship them a native update |
| Build keystore lost / new computer | EAS stores the keystore in the cloud; `eas credentials` to retrieve | Don't generate a new one — would break in-place upgrades |

---

## Long-term: migrating to the Play Store

Once you have 30+ pilot users and the app is stable enough for a public launch:

1. Get a Google Play Developer account ($25 one-time, verification takes hours-to-days)
2. Build with the production profile: `eas build --platform android --profile production` (produces an AAB)
3. Submit: `eas submit --platform android --profile production`
4. Push v1.0.0 (or whichever current version) to Internal Testing → Closed Testing → Production tracks
5. Tell existing sideload users: "uninstall the old app, install fresh from Play Store at <link>"
6. From this point on, Play Store handles all updates (JS via Play, native via Play). You can stop publishing new `update-manifest.json` entries.

The manifest + sideload distribution stays useful for: clinician betas, debug builds, regional pilots outside the Play Store's reach.
