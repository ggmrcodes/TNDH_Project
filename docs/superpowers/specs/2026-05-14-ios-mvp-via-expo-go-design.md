# iPhone MVP via Expo Go — Design Spec

- **Date:** 2026-05-14
- **Owner:** @ggmrcodes
- **Status:** Draft, pending implementation plan
- **Related release:** v0.1.0 (Android shipped via APK; see `HaemoCare/RELEASE_NOTES_0.1.0.md`)

## Problem

We have iPhone testers waiting to use HaemoCare alongside the Android v0.1.0 release shipping tomorrow. There is no active Apple Developer Program membership, which makes any native iOS distribution path — TestFlight, App Store, ad-hoc — impossible in the next 24 hours. We need a way to put HaemoCare on real iPhones tomorrow without going through Apple's signing chain.

## Goal

Enable **live, developer-supervised** iPhone testing of HaemoCare during a scheduled session tomorrow, using Expo Go as the runtime host. Testers exercise the real app code (auth, transfusion logging, symptom logging, profile, medical passport, demo account) on their own iPhones, with the developer's laptop acting as the bundler.

## Non-goals

- Apple Developer Program enrollment
- TestFlight / App Store / ad-hoc IPA distribution
- iOS production OTA channel (EAS Update for iOS)
- Native push-notification testing on iOS (removed from Expo Go on SDK 53+)
- Self-paced / unattended iPhone testing (tunnel link is only live while the dev laptop runs the bundler)
- iOS-specific `app.json` config (`bundleIdentifier`, `ios.buildNumber`, ATS exceptions, etc.) — punt to the "real iOS ship" milestone
- iOS EAS build profile — punt to "real iOS ship" milestone

## Constraints we are working inside

- **Expo SDK:** 54 (`expo ~54.0.33`). Expo Go on SDK 53+ no longer loads published EAS Updates and no longer supports remote push.
- **No Apple Developer account.** No iOS code signing capability.
- **Existing release:** Android v0.1.0 shipping tomorrow. Code must not regress for Android.
- **Tester locale:** Thailand. EN + TH instructions required (mirror existing `HaemoCare/INSTALL.md` bilingual structure).
- **PDPA:** Medical data is in scope. Tester onboarding must continue to surface the PDPA consent screen.

## Approach

A live, tunneled Expo Go session.

### Distribution model

1. Developer runs `npx expo start --tunnel` from `HaemoCare/` on their laptop.
2. Tunnel produces an `exp://` URL + QR code.
3. Testers install **Expo Go** from the App Store on their iPhone.
4. Tester opens the `exp://` URL (or scans QR from Expo Go).
5. App code is bundled from the developer's machine and runs inside Expo Go on the tester's device.
6. Session ends when the developer stops the bundler. The tunnel URL becomes inert.

### What works in Expo Go on SDK 54 for HaemoCare

The following are confirmed-compatible based on the current `package.json`:

- Auth, Supabase reads/writes (`@supabase/supabase-js`)
- `expo-secure-store` (Expo-Go-scoped keystore; functionally equivalent for testing)
- `expo-image-picker`, `expo-image-manipulator`
- `expo-print`, `expo-sharing`
- `react-native-qrcode-svg`, `react-native-svg`
- `nativewind` 4, `react-native-reanimated` 4, `react-native-worklets`
- `@expo-google-fonts/*`, `expo-font`
- **Local** notifications via `expo-notifications`
- Demo account flow (`demo@haemocare.app` / `HaemoDemo2024`)

### What does NOT work in Expo Go on SDK 54

These must be guarded or expectations-set:

- **Remote push notifications** — `Notifications.getExpoPushTokenAsync()` throws in Expo Go on SDK 53+. Any call site that fetches a push token, registers a token with Supabase, or assumes a token exists must be guarded.
- **`expo-updates`** — no-op inside Expo Go. Testers will not receive OTA updates between sessions; we re-share the tunnel link each session.
- **Custom URL scheme deep links** (`haemocare://`) — Expo Go intercepts links with `exp://`. Any in-app flow that builds or parses `haemocare://` URLs needs to detect Expo Go and adjust.

## Architecture / code changes

This is a small project. The changes are localized:

### 1. Push-notification guard

Add a single helper (e.g., `src/lib/runtime/isExpoGo.ts`) that reads `expo-constants`' `Constants.executionEnvironment === 'storeClient'` (the SDK 54 way to detect Expo Go; `appOwnership` is deprecated). Wrap every push-token call site with this guard so they no-op (with a log line) when running inside Expo Go.

Acceptance: opening the app in Expo Go does not surface any unhandled exception from the notifications module.

### 2. Tester one-pager (bilingual EN/TH)

A new doc at `HaemoCare/EXPO_GO_TESTER_GUIDE.md` modeled after `HaemoCare/INSTALL.md`:

- "Install Expo Go from the App Store" (with App Store link)
- "Open this link on your iPhone: `<tunnel URL>`" — placeholder updated per session
- "Sign in with the demo account, or create your own"
- Heads-up note: "This is a pre-release preview running on the developer's machine. Push notifications and OTA updates are disabled in this build."
- Both English and Thai sections.

The actual tunnel URL is filled in at session time, not committed.

### 3. Pre-session smoke-test checklist

A short markdown checklist in `HaemoCare/scripts/` (or inline at top of the tester guide) that the developer walks through before testers join:

- `npx expo install --check` passes
- `npx expo start --tunnel` connects and prints a QR / URL
- Dev's own iPhone loads the app via Expo Go
- Demo-account login completes
- Each push-token call site has been verified to no-op (manual sanity check)
- Bilingual tester guide ready to send via LINE / email

### 4. No `app.json` / `eas.json` changes

iOS config additions (`ios.bundleIdentifier`, iOS build profile, updates URL) are explicitly **out of scope** for this spec. They belong to a follow-up "real iOS ship" project.

## Data flow

Unchanged. Same Supabase backend, same auth, same RLS rules, same PDPA consent flow. The only delta is the runtime host (Expo Go instead of the standalone APK).

## Error handling

The only new failure modes introduced by this design are:

- **Tunnel disconnect:** developer's laptop sleeps or loses internet. Tester sees a "could not load" screen in Expo Go. Mitigation: keep laptop awake, on stable wifi, during session.
- **Push-token call throws:** mitigated by the Expo-Go guard described above.
- **Tester on Expo Go version mismatch:** Expo Go ties to SDK 54. Mitigation: instruct testers to install latest Expo Go from the App Store immediately before the session.

No new persistent-state failure modes (no new tables, no new write paths).

## Testing

- Manual smoke test on developer's iPhone via Expo Go before the session.
- Unit-test surface unchanged. Existing Jest suite (`npm test` in `HaemoCare/`) continues to apply.
- No automated iOS device testing — Apple-account constraint blocks `eas build`.

## Rollback

No code that ships to end users. If the session goes badly, no rollback is needed — testers simply close Expo Go. The Android v0.1.0 release is independent and unaffected.

## What this unblocks

After tomorrow's session, we have first-hand iPhone tester feedback in hand. The follow-up spec — **"Real iOS ship"** — covers:

- Apple Developer Program enrollment (individual, fast path)
- `ios.bundleIdentifier` in `app.json`
- iOS build profile in `eas.json`
- EAS Update URL (replace `PLACEHOLDER_PROJECT_ID`) for iOS channel
- TestFlight internal-tester track
- App Privacy questionnaire + medical-app App Review prep (Guidelines 1.4.1, 5.1.1)
- Native push-notification setup for iOS (APNs)

That is a separate spec → separate plan → separate implementation cycle.

## Open questions

None at design time. Tunnel URL is generated at session time and is not a design-level decision.
