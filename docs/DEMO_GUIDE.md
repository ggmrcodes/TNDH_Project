# HaemoCare Demo Walkthrough

> Tomorrow's pilot demo, two accounts. Mock-mode (no backend needed). ~8–10 minutes total.

**Demo credentials (mock-mode, baked into the APK — works offline):**

| Role | Email | Password |
|---|---|---|
| Patient | `demo@haemocare.app` | `HaemoDemo2024` |
| Clinician | `demo-doctor@haemocare.app` | `HaemoDoc2024` |

The data is fictional. Names, transfusion history, and symptom logs are synthetic.

---

## 1. Patient walkthrough (5 min)

Sign in as patient. Language is Thai by default; tap the EN toggle in the top-right of any tab if you want English narration.

### 1a. Passport (first thing they see)

- **SOS button** — red CTA below the passport hero. 3 contacts already saved:
  - วนิดา (caretaker, wife)
  - นายแพทย์สุวรรณ (doctor)
  - นิรันดร์ (other / brother)
- Tap SOS → sheet slides up → tap "Call" on any contact → OS dialer opens with the number. Cancel before actually calling.
- Profile shows blood type **B+**, antibodies **Anti-E, Anti-c**, a documented prior reaction (mild febrile, 2023-08-15), and current medications.
- **QR code** at the top of the card — clinical staff scan it to read the passport without unlocking the app.

### 1b. Log (Symptom Monitor) tab

- **OverdueBanner** at the top — "คุณเลยกำหนดนัดมา 21 วันแล้ว..." (21 days past planned visit). This is the cadence path firing because the demo patient has interval `14` and the last transfusion was 35 days ago.
- **Overall status** ring reads "Needs Attention" — because the most recent symptom log (May 12) was urgent.
- **Recent timeline** — 9 entries spanning Feb–May:
  - May 12: urgent (fever 7, chills 5, dark urine 4) — the headline log
  - May 9: monitor (fatigue 5, fever 4)
  - May 4: normal (fatigue 3)
  - Apr 9–10: 2 normal post-transfusion logs
  - Mar 12–13: monitor → urgent → normal arc around the prior transfusion
  - Feb 10: normal post-transfusion
- Tap **"+ Log Symptoms"** to demonstrate the overdue-bump UX:
  1. Select fever + chills, set severity to 6 + 4
  2. Tap Next
  3. The review step appears with the bump-explanation banner: **"Because you're 21 days past your planned visit, we've raised this from Monitor to Urgent. You can change it back, but please contact your hospital."**
  4. Tap any outcome to override (or leave on Urgent), then Confirm
  5. The result page renders + the **"Notify caretaker"** nudge appears (because confirmed outcome = urgent AND contacts exist)
  6. Tap Notify → same sheet from the SOS button, prefilled with an urgent-symptom message body

### 1c. Appointments tab

- **OverdueBanner** at top (same as Log tab — global state, both tabs render it)
- Upcoming appointments:
  - May 21 at Thammasat (iron chelation review, manual entry)
  - **June 5 at Songklanagarind** — imported from TH Core FHIR (shows the hospital-integration path; tap the entry to see `external_source_name`)
- One past missed: May 7 at Thammasat — no transfusion at/after that date, so it counts as missed.

### 1d. History (Transfusion log) tab

- 3 past transfusions with pre/post Hb values:
  - Apr 9: pre 7.0 → post 10.2 (uneventful)
  - **Mar 12: pre 6.8 → post 9.9, reaction noted** — mild chills, resolved by slowing rate. The reaction icon shows next to this row.
  - Feb 10: pre 7.2 → post 10.1

### 1e. Pre-Visit Summary (from Passport)

- Hb decay trend chart (uses the pre/post values above)
- Symptom patterns analysis
- Adherence rollup (Deferasirox 14-day streak, Folic acid 14-day streak — 1 dose taken today, 1 pending)
- Triage rollup for the most recent log

### 1f. Privacy Settings (from Passport gear icon)

- PDPA consent status
- Language toggle
- **App updates** section: shows current version + "Check for updates" button + last-check timestamp (locale-aware in Thai/EN)
- Emergency contacts: tap to manage the 3 contacts

---

## 2. Clinician walkthrough (3 min)

Sign out. Sign in with `demo-doctor@haemocare.app` / `HaemoDoc2024`.

Role-aware routing kicks in — instead of the patient tabs, the **Clinician Dashboard** loads in Split View.

### 2a. Left rail — Cohort + queue

- **Cohort stats:** Overdue 2 | Monitor 2 | Stable 1
- **Filter chips:** Overdue / Urgent in last 14d / Has reactions on file
- **Queue (5 patients, sorted by triage):**
  - **Niran Tonsuk** (HC-100002) — urgent symptom 2d ago, tier-1 overdue (14d). Top of queue.
  - **Somchai Panyawong** (HC-100001) — tier-2 overdue (28d), recent monitor log
  - **Kraisorn Vichaikun** (HC-100004) — reaction-on-file flag (red dot icon)
  - **Areeya Kraisri** (HC-100003) — stable, appointment in 7d
  - **Pim Jaroon** (HC-100005) — stable, on cadence

### 2b. Right pane — auto-selected top-priority patient

Niran's detail pane loads:
- **Passport header**: Niran T., HC-100002, B+, anti-c
- **Overdue badge** (tier-1, 14d) under the name
- **Hb trend**: pre 6.5 → post 9.1 (single point)
- **Recent symptom log**: May 12 — fever 8, chills 6, back_pain 5 → URGENT
- **Transfusion history**: Apr 2 (42d ago)
- **Appointments**: none

Tap **Somchai** in the left rail → right pane re-hydrates with his tier-2 overdue chart and 2-transfusion history.

Tap **Kraisorn** → see the prior reaction detail surfaced in the detail pane.

### 2c. Filter chips

- Tap "Urgent in last 14d" → queue narrows to Niran only
- Tap again to clear
- Tap "Has reactions on file" → queue narrows to Kraisorn

### 2d. Sign out

Returns to the auth screen.

---

## 3. Update flow (optional, 1 min — only if you've published a fake newer release)

Tomorrow's APK is v1.0.0. The `update-manifest.json` on `main` claims latest = v1.0.0, so no banner. To demo the update path:

1. **Before the demo**: edit `update-manifest.json` in the repo to claim `latest_version: "1.1.0"`, commit + push.
2. Patient (or clinician) reopens the app
3. **UpdateBanner** appears at the top of Passport — amber: "Version 1.1.0 is ready. Tap to download."
4. Tap "Download" → browser opens GitHub release page
5. **Restore the manifest** to v1.0.0 before the demo ends so other testers don't get the false prompt.

---

## What's deliberately NOT in the demo

- Photo-based transfusion bag scanning (Anthropic-key feature; disabled in production builds)
- Real clinician sign-up (requires manual Thai Medical Council license verification — not running yet)
- Patient-side consent UX for granting a clinician access (mock-mode skips it; real-mode is phase-2)
- Push notifications (manifest checker is in-app banner only)

If asked about any of these: "Phase-2 work. The schema and policy infrastructure for clinician consent + audit logging are already in place — what you're seeing is the patient-facing UI for v1."

---

## Reset between demos

The mock store is in-memory. If you log a symptom or add a contact during a demo and want to reset:

- Force-quit the app on Android (Recent Apps → swipe up)
- Reopen — mock data is back to the seeded state

For the clinician → patient role switch within the same session, the sign-out button on the clinician dashboard fully clears state.
