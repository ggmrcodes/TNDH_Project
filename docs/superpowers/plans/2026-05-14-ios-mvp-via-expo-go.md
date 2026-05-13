# iPhone MVP via Expo Go — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable iPhone testers to use HaemoCare during a live, developer-supervised session tomorrow, by hosting the app inside Expo Go via tunnel mode — no Apple Developer Program account required.

**Architecture:** No app code changes. The deliverable is two markdown artifacts (a bilingual EN/TH tester guide and a pre-session runbook for the developer) plus a verified-compatible dependency state confirmed via `npx expo install --check` and a smoke-test on the developer's own iPhone. Push-notification guard work from the spec is dropped after codebase audit — there are no `expo-notifications` call sites in `src/`.

**Tech Stack:** Expo SDK 54, Expo Go (iOS App Store), `npx expo start --tunnel`.

**Spec:** `docs/superpowers/specs/2026-05-14-ios-mvp-via-expo-go-design.md`

---

## File Structure

Files this plan creates or modifies:

- **Create:** `HaemoCare/EXPO_GO_TESTER_GUIDE.md` — bilingual EN/TH instructions for iPhone testers. Modeled after the existing `HaemoCare/INSTALL.md` structure (Android install guide) so testers see a familiar bilingual format.
- **Create:** `HaemoCare/scripts/expo-go-session.md` — short runbook the developer walks through before testers join a session. Lives next to `HaemoCare/scripts/` because it is operational, not application code.
- **No code changes.** No edits to `src/`, `app.json`, `eas.json`, or `package.json` (unless `expo install --check` flags a misaligned dependency, in which case it auto-fixes).

## Codebase audit findings (informs decisions below)

- `grep -rn "expo-notifications\|getExpoPushTokenAsync\|Notifications\\." src/ App.tsx` → **zero matches**. The `expo-notifications` package is listed in `app.json` `plugins` and in `package.json` dependencies, but no runtime code calls it. The spec's "push-notification guard" task is therefore empty work — dropped.
- `grep -rn "expo-updates\|Updates\\." src/ App.tsx` → **zero matches**. The app uses a custom poller (`src/services/updateManifestService.ts` + `src/hooks/useNativeUpdateCheck.ts`) that reads `expo-application`'s `nativeApplicationVersion` and compares against a hosted JSON manifest. In Expo Go, `nativeApplicationVersion` returns the Expo Go host's version (e.g. `2.31.x`), not HaemoCare's `0.1.0`. **Effect:** the update-check UI on `PassportScreen` and `PrivacySettingsScreen` may show "update available" or a version mismatch. Will not crash. Mitigation: flag this in the tester guide ("ignore any update prompts during this session") rather than adding code.

---

## Task 1: Create the bilingual EN/TH tester guide

**Files:**
- Create: `HaemoCare/EXPO_GO_TESTER_GUIDE.md`

- [ ] **Step 1: Create the tester guide file**

Create `HaemoCare/EXPO_GO_TESTER_GUIDE.md` with this exact content:

````markdown
# HaemoCare — iPhone Tester Guide (Expo Go preview) | คู่มือทดสอบบน iPhone

> **This is a pre-release preview running inside Expo Go.** It only works while the developer's machine is running the bundler. Push notifications and over-the-air updates are disabled in this build. Treat any "update available" prompt as a known quirk and ignore it.
>
> **นี่คือเวอร์ชันพรีวิวที่รันใน Expo Go** ใช้งานได้เฉพาะช่วงที่นักพัฒนาเปิด bundler อยู่ การแจ้งเตือนแบบ push และการอัปเดตอัตโนมัติถูกปิดในเวอร์ชันนี้ หากมีแจ้งเตือน "มีการอัปเดต" ระหว่างเซสชัน ขอให้ละไว้

---

## English

### Step-by-step

1. **Install Expo Go** from the App Store: [apps.apple.com/app/expo-go/id982107779](https://apps.apple.com/app/expo-go/id982107779)
2. **Open this link on your iPhone** (sent to you separately by the developer): `<tunnel URL — filled in at session time>`
   - Or open Expo Go, tap **Scan QR Code**, and scan the QR the developer shares.
3. Wait for HaemoCare to load (a few seconds on first launch).

### Sign in

You have two options:

**A. Demo account (read-only, resets automatically):**
- Email: `demo@haemocare.app`
- Password: `HaemoDemo2024`

**B. Real account:**
- Tap **Create Account**, enter your email, and complete the profile (blood type, antibodies, known reactions, current medications, transfusion interval).
- Read and accept the **PDPA consent** screen.

### What to test

- Logging a transfusion
- Logging a symptom
- Opening your **Medical Passport** screen
- Sharing or printing your passport
- Editing your profile in **Settings**

### Known quirks during this preview

| What you see | What it means |
|---|---|
| "Expo Go" branding at the top of the screen | Normal — you're inside Expo Go. |
| "Update available" prompt in Passport or Settings | Ignore — version detection is confused inside Expo Go. |
| Tester link stops working partway through | The developer's bundler has stopped. Message them to restart. |
| No push notifications | Expected. Push is disabled in this preview. |

### Troubleshooting

| Problem | Solution |
|---|---|
| Expo Go shows "Something went wrong" | Pull down to reload, or close and re-open the tunnel link. |
| Link won't open | Make sure Expo Go is installed first, then tap the link again. |
| App is very slow on first load | Normal — first launch downloads the bundle. Subsequent loads are fast. |

### Privacy

HaemoCare stores your data in **Supabase** (cloud-hosted, Thailand data region). Only you can access your records. Delete your account anytime from **Settings → Privacy & Data → Delete Account**. Complies with Thailand's **PDPA**.

---

## ภาษาไทย

### ขั้นตอน

1. **ติดตั้ง Expo Go** จาก App Store: [apps.apple.com/app/expo-go/id982107779](https://apps.apple.com/app/expo-go/id982107779)
2. **เปิดลิงก์ที่นักพัฒนาส่งให้บน iPhone ของคุณ:** `<tunnel URL — ใส่ตอนเริ่มเซสชัน>`
   - หรือเปิด Expo Go แตะ **Scan QR Code** แล้วสแกน QR ที่นักพัฒนาส่งให้
3. รอให้ HaemoCare โหลด (ใช้เวลาสักครู่ในครั้งแรก)

### เข้าสู่ระบบ

มีสองทางเลือก:

**A. บัญชีสาธิต (อ่านอย่างเดียว รีเซ็ตอัตโนมัติ):**
- อีเมล: `demo@haemocare.app`
- รหัสผ่าน: `HaemoDemo2024`

**B. บัญชีจริง:**
- แตะ **สร้างบัญชี** กรอกอีเมล และกรอกโปรไฟล์ (หมู่เลือด แอนติบอดี ปฏิกิริยาที่เคยเกิด ยาที่ใช้ ระยะห่างการรับเลือด)
- อ่านและ **ยินยอม PDPA** เพื่อดำเนินการต่อ

### สิ่งที่ต้องการให้ทดสอบ

- บันทึกการรับเลือด
- บันทึกอาการ
- เปิดหน้า **Medical Passport**
- แชร์หรือพิมพ์ Passport
- แก้ไขโปรไฟล์ใน **การตั้งค่า**

### ข้อสังเกตในเวอร์ชันพรีวิวนี้

| สิ่งที่เห็น | ความหมาย |
|---|---|
| มีคำว่า "Expo Go" ที่ด้านบนของหน้าจอ | ปกติ — คุณกำลังใช้งานภายใน Expo Go |
| มีแจ้ง "มีการอัปเดต" ในหน้า Passport หรือ Settings | ละไว้ — การตรวจเวอร์ชันผิดพลาดเมื่ออยู่ใน Expo Go |
| ลิงก์หยุดทำงานกลางคัน | bundler ของนักพัฒนาหยุดทำงาน ขอให้แจ้งให้นักพัฒนาเริ่มใหม่ |
| ไม่มี push notification | คาดไว้แล้ว ปิดในเวอร์ชันพรีวิว |

### การแก้ไขปัญหาเบื้องต้น

| ปัญหา | วิธีแก้ไข |
|---|---|
| Expo Go แสดง "Something went wrong" | ลากลงเพื่อรีโหลด หรือปิดและเปิดลิงก์ใหม่ |
| ลิงก์ไม่เปิด | ตรวจสอบว่าติดตั้ง Expo Go แล้ว จากนั้นแตะลิงก์อีกครั้ง |
| โหลดช้ามากในครั้งแรก | ปกติ — ครั้งแรกต้องดาวน์โหลด bundle ครั้งถัดไปจะเร็วขึ้น |

### ความเป็นส่วนตัว

HaemoCare เก็บข้อมูลใน **Supabase** (คลาวด์ในประเทศไทย) เฉพาะคุณเท่านั้นที่เข้าถึงได้ ลบบัญชีได้ทุกเมื่อที่ **การตั้งค่า → ความเป็นส่วนตัวและข้อมูล → ลบบัญชี** เป็นไปตาม **พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล (PDPA)**
````

- [ ] **Step 2: Read the file back and verify both EN and TH sections render correctly**

Open `HaemoCare/EXPO_GO_TESTER_GUIDE.md` in the editor and visually confirm:
- Both `## English` and `## ภาษาไทย` sections are present and complete
- The `<tunnel URL — filled in at session time>` placeholder appears in both sections (developer fills these in at session time, does NOT commit the actual URL)
- No accidental markdown rendering issues (tables, fences)

- [ ] **Step 3: Stage and prepare a commit** (do not commit without user OK per global rules)

Run:
```bash
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/EXPO_GO_TESTER_GUIDE.md
git status
```

Expected: `HaemoCare/EXPO_GO_TESTER_GUIDE.md` shows under "Changes to be committed".

Proposed commit message (DO NOT run `git commit` until the user approves):
```
docs(testing): add bilingual EN/TH tester guide for Expo Go preview
```

---

## Task 2: Create the developer pre-session runbook

**Files:**
- Create: `HaemoCare/scripts/expo-go-session.md`

- [ ] **Step 1: Verify `HaemoCare/scripts/` exists**

Run:
```bash
ls /Users/macbook/Desktop/TNDH/HaemoCare/scripts
```

If the directory does not exist, create it:
```bash
mkdir -p /Users/macbook/Desktop/TNDH/HaemoCare/scripts
```

Expected: directory exists (empty is fine).

- [ ] **Step 2: Create the runbook file**

Create `HaemoCare/scripts/expo-go-session.md` with this exact content:

````markdown
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
````

- [ ] **Step 3: Stage and prepare a commit** (do not commit without user OK per global rules)

Run:
```bash
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/scripts/expo-go-session.md
git status
```

Expected: `HaemoCare/scripts/expo-go-session.md` shows under "Changes to be committed".

Proposed commit message:
```
docs(testing): add Expo Go session runbook for iPhone preview
```

---

## Task 3: Verify SDK 54 dependency alignment

**Files:** None modified by this task unless `expo install --check` finds drift.

- [ ] **Step 1: Run the dependency check**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare
npx expo install --check
```

Expected outcomes:
- **A.** "Dependencies are up to date" → proceed to Step 3.
- **B.** A list of packages with a recommended version → continue to Step 2.

- [ ] **Step 2: If anything is mismatched, fix it**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare
npx expo install --fix
```

Then re-run the check:
```bash
npx expo install --check
```
Expected: "Dependencies are up to date".

Then re-run the full safety net:
```bash
npx tsc --noEmit
npm test -- --watchAll=false
```
Expected: no type errors, all tests pass.

- [ ] **Step 3: If `package.json` / `package-lock.json` changed, stage and prepare a commit**

Run:
```bash
cd /Users/macbook/Desktop/TNDH
git status
git diff --stat HaemoCare/package.json HaemoCare/package-lock.json
```

If those files changed:
```bash
git add HaemoCare/package.json HaemoCare/package-lock.json
```

Proposed commit message (only if files changed):
```
chore(deps): align deps with Expo SDK 54 via expo install --fix
```

If `expo install --check` reported no drift, skip this commit and note "no dep changes needed."

---

## Task 4: End-to-end smoke test on the developer's iPhone

**Files:** None modified. This is a verification task.

- [ ] **Step 1: Start the tunnel**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare
npx expo start --tunnel
```
Expected: QR code prints, plus a line containing `exp://...` and `Metro waiting on ...`.

- [ ] **Step 2: Install Expo Go on the developer's iPhone if not already installed**

App Store link: `https://apps.apple.com/app/expo-go/id982107779`

- [ ] **Step 3: Connect from the iPhone**

In Expo Go on the iPhone, tap **Scan QR Code** and scan the QR in the terminal. Wait for HaemoCare to bundle and launch.

Expected: HaemoCare's welcome screen appears within ~20–60 seconds.

- [ ] **Step 4: Walk the demo flow**

1. Sign in: `demo@haemocare.app` / `HaemoDemo2024`. Expected: lands on the main tab navigator.
2. Open **Passport** tab. Expected: passport renders without a crash. The "update status" line may show a quirky value — that's OK, do not fix.
3. Open **Settings → Privacy & Data**. Expected: screen renders. The "Check for updates" button may show odd output — OK.
4. Navigate to a screen that uses `expo-image-picker` or `expo-print` (e.g. attempt to print or share the passport). Expected: native picker / share sheet appears (this confirms native modules are wired correctly in Expo Go).

- [ ] **Step 5: Stop the tunnel**

Press `Ctrl+C` in the Metro terminal.

- [ ] **Step 6: Record the result**

If any step crashed or threw, **stop**. Do not mark the plan complete. Open a follow-up task to investigate.

If all steps passed, the plan is complete. No commit needed for this task.

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Plan task |
|---|---|
| Distribution model: `npx expo start --tunnel` | Task 2 (runbook), Task 4 (smoke test) |
| Tester one-pager (bilingual EN/TH) | Task 1 |
| Pre-session smoke-test checklist | Task 2 + Task 4 |
| Push-notification guard | **Dropped after audit** — no call sites exist; YAGNI. Documented in the audit-findings section above. |
| No `app.json` / `eas.json` changes | Enforced — no task touches them. |
| `expo install --check` passes | Task 3 |
| Smoke-test on developer's iPhone | Task 4 |
| Demo account login works | Task 4 Step 4 |
| Confirm push-token sites no-op in Expo Go | **N/A after audit** — no sites exist. |
| Bilingual tester guide ready to send | Task 1 (file is sendable as-is after URL substitution) |

**Placeholder scan:** No "TBD", "TODO", "fill in later" in task steps. The one literal placeholder string `<tunnel URL — filled in at session time>` is intentional — it lives inside the tester-guide markdown and is documented as runtime-filled, not engineer-filled.

**Type / name consistency:** No new types or functions introduced. Plan is doc-only.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-14-ios-mvp-via-expo-go.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks. Fast iteration. Good fit because tasks are independent (docs first, deps check, then smoke test).

**2. Inline Execution** — I execute the tasks in this session using executing-plans, with checkpoints between Task 2 and Task 3 (so you can see the docs before any `npm` / `expo` commands run).

**Which approach?**
