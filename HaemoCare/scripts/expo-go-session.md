# Expo Go Session Runbook

Pre-flight checklist for running a live iPhone tester session via Expo Go tunnel mode.

## ~24 hours before the session

- [ ] Confirm each tester has an iPhone running iOS 15 or later (Expo Go requirement).
- [ ] Send each tester `HaemoCare/EXPO_GO_TESTER_GUIDE.md` (EN + TH) and ask them to install **Expo Go** from the App Store ahead of time.

## ~1 hour before the session

From `HaemoCare/`:

- [ ] **Pull latest:**
  ```bash
  git pull
  ```
- [ ] **Dependency sanity check:**
  ```bash
  npx expo install --check
  ```
  Expected: "Dependencies are up to date" or a list of mismatched packages. If anything is mismatched, run `npx expo install --fix` and verify nothing else breaks (Jest, type-check).
- [ ] **Type-check** (read-only, no fixes):
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.
- [ ] **Unit tests:**
  ```bash
  npm test -- --watchAll=false
  ```
  Expected: all pass.

## 10 minutes before the session

- [ ] **Disable laptop sleep.** macOS: `caffeinate -dimsu &` or System Settings → Lock Screen → "Turn display off after: Never" while plugged in. The bundler dies when the laptop sleeps.
- [ ] **Confirm wifi is stable.** Tunnel mode uses ngrok-style relay; flaky wifi = flaky session.
- [ ] **Start the tunnel:**
  ```bash
  npx expo start --tunnel
  ```
  Expected output includes a QR code and a line like `Metro waiting on exp://...`. The `exp://` URL is what testers open.
- [ ] **Smoke-test on your own iPhone first** (if available):
  1. Open Expo Go on your iPhone.
  2. Tap **Scan QR Code** and scan the QR in your terminal.
  3. Wait for HaemoCare to load.
  4. Sign in with `demo@haemocare.app` / `HaemoDemo2024`.
  5. Navigate to **Passport**. Confirm the screen renders without crashing. Ignore any "update available" prompt — known Expo Go quirk.
  6. Navigate to **Settings → Privacy & Data**. Confirm the screen renders.
  7. Log a test transfusion and a test symptom (real account only; demo is read-only).

- [ ] **Copy the `exp://` URL** from terminal. Paste it (and only this URL, not anything else) into the `<tunnel URL — filled in at session time>` placeholder in the version of the tester guide you send to testers via LINE / email.

## During the session

- [ ] Keep the terminal running `npx expo start --tunnel` in the foreground.
- [ ] Do not edit source files unless you intend to push a live reload to testers. (Saving a file triggers Metro to push a new bundle to all connected devices.)
- [ ] If a tester reports "could not connect", check that the terminal still shows the connection. If lost, restart with `r` in the Metro CLI or re-run `npx expo start --tunnel` (which generates a new URL — share it).

## After the session

- [ ] Press `Ctrl+C` in the Metro terminal to stop the tunnel. The shared URL goes dead, which is intended.
- [ ] Write down tester feedback. Feed into the "real iOS ship" follow-up spec.
