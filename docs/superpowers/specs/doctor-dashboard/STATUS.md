# Doctor Dashboard MVP — Status on Your Return

**Date:** 2026-05-13.
**Branch:** `feat/doctor-dashboard` (local only; no push, no PR).
**Base:** `main`. Also includes the merged-in `feat/overdue-visit-symptom-escalation` (the dashboard transitively depends on it; merge details below).
**Test + typecheck:** 55/55 tests pass, `tsc --noEmit` clean.
**Total diff vs main:** 46 files, +4839 / −358.

## TL;DR

A working clinician dashboard demo, end-to-end in mock mode. Sign in as `demo-doctor@haemocare.app` / `HaemoDoc2024` in the same login screen; you land on a Split View dashboard with a triage-sorted queue of 5 mock patients and a per-patient detail pane. The full review pass found 2 critical + 5 important issues — the criticals and 2 important auth-hygiene bugs are fixed; the remaining important + minor items are documented below for your call.

## What you can demo right now

1. `cd /Users/macbook/Desktop/TNDH/HaemoCare && npm run web` (already running at http://localhost:8081 from earlier)
2. Sign in with `demo-doctor@haemocare.app` / `HaemoDoc2024`
3. You should see:
   - Header "Clinician Dashboard" + Sign out
   - Left rail: CohortStats (Overdue / Monitor / Stable counts), 3 filter chips, queue of 5 patients sorted by triage priority
   - Right pane: the top-priority patient's chart (passport header with name + overdue badge + blood type + antibodies + known reactions, then the same Hb / symptoms / adherence cards from the patient pre-visit summary)
4. Click any patient row → right pane re-hydrates for that patient
5. Tap a filter chip → queue filters; tap again to clear
6. Toggle to Thai (no toggle visible on this screen yet — see open issue #M3 below; the language toggle is on the patient screens, not the clinician shell)
7. Sign out → back to login

## Mock patient roster (5 patients)

After the C1 fix, the demo produces the intended risk spread:

| # | Name | Patient ID | Last tx | Status |
|---|---|---|---|---|
| 1 | Somchai Panyawong | HC-100001 | 56d ago | **Tier-2 overdue (28d past planned)**, monitor symptom 3d ago |
| 2 | Niran Tonsuk | HC-100002 | 42d ago | **Tier-1 overdue (14d past planned)**, urgent symptom 2d ago |
| 3 | Areeya Kraisri | HC-100003 | 10d ago | Stable, appointment in 7d |
| 4 | Kraisorn Vichaikun | HC-100004 | 20d ago | Stable but **reaction on file** from last transfusion |
| 5 | Pim Jaroon | HC-100005 | 7d ago | Stable, fully on cadence |

Queue sort order: urgent (Niran) → tier-2 (Somchai) → tier-1 (none) → monitor (Pim has one normal log, doesn't qualify) → stable.

## What shipped (16 commits on the branch)

Schema + data
- `8238c04` — clinician tables (`clinician_profiles`, `clinician_patient_links`), `is_active_clinician_for(uuid)` helper fn, RLS policies extending read access on patient tables for active-linked clinicians, plus the `pre_hb_g_dl` / `post_hb_g_dl` migration fix the data strand caught
- `5cee2db` — merge of `feat/overdue-visit-symptom-escalation` (dashboard transitively depends on `computeOverdueState`, `recommended_visit_interval_days`, etc.). Conflict resolved by keeping the overdue branch's non-optional Profile field.

Services + auth
- `be942a2` — `clinicianService.ts` with real-Supabase queries (`getAssignedPatients`, `getProfileForPatient`, `getLatestTransfusionForPatient`, etc.)
- `8331167` — mock clinician roster + service mocks
- `3cc6907` — `AuthContext` role detection (`role: 'patient' | 'clinician' | null`) + clinician mock-mode trigger

Logic + hook
- `7404c5a` — `triageQueue.ts` scoring/sort util + 6 unit tests
- `cb3b30b` — `useAssignedPatients` hook

UI atoms
- `03466ac` — OverdueBadge
- `aacd763` — CohortStats
- `457d3a0` — FilterChips
- `c2f6693` — PatientQueueRow
- `ee784a6` — i18n strings (EN + Thai) for clinician UI

Composition
- `8542c74` — refactored `PreVisitSummaryScreen` to delegate to a new `PatientDetailPane` parameterised by `userId`
- `aeda9ba` — `ClinicianDashboardScreen` (Split View)
- `50c3f51` — `ClinicianStackNavigator` + role-based root routing in `AppNavigator`

Post-review fixes
- `5b2d41c` — passport header + OverdueBadge on `PatientDetailPane`; Patient 1 tier-2 mock dates; `AuthContext` sign-out + state-clearing hygiene; `onAuthStateChange` bails in mock mode

## Architecture notes

**Branch dependency.** The dashboard branch has the overdue-visit branch merged in because of transitive deps. When you eventually merge to `main`, **merge `feat/overdue-visit-symptom-escalation` first**, then `feat/doctor-dashboard` — git will dedupe the overdue commits and leave a clean dashboard-only diff.

**Mock vs real split.** Mock mode is fully wired end-to-end. Real-Supabase mode is wired for the LIST of assigned patients (`useAssignedPatients` calls `realClinicianService.getAssignedPatients(clinicianId)`) and for the patient detail pane (`PatientDetailPane.loadPatientData` has the real-clinician branch). **But** the dashboard's per-patient hydration (the loop that computes overdue + worst-recent-outcome for each patient in the queue) only runs in mock mode — see Open Issue #1 below.

**RLS shape.** Clinicians stay read-only on patient tables in v1. The helper function is `security definer` so it can read `clinician_patient_links` regardless of clinician's direct grants. Pending/declined/revoked/expired links grant zero access — only `status = 'active'` does.

## Open issues for your review

### Open issue #1 (Important — code reviewer's I2): Real-Supabase queue silently empty

`ClinicianDashboardScreen.tsx:40` — the slice-hydration effect gates on `if (!isMockMode || patients.length === 0)`. A real-Supabase clinician with assigned patients will see `patients` populate from `useAssignedPatients` but the dashboard will short-circuit hydration, leaving `slices=[]`, `cohortStats=0/0/0`, queue empty, right pane empty. No error surfaces — silent footgun.

**Reason it shipped this way:** the design.md "Cut scope" section explicitly defers real-mode wiring. But the failure mode is invisible, which the reviewer (correctly) called out. Two paths forward:

A. **Wire real-mode hydration.** Replace the mock-mode-only branch with the same shape but using `realClinicianService.getLatestTransfusionForPatient`, `getMostRecentPastAppointmentForPatient`, `getSymptomLogsForPatient`. These already exist on the service. ~10 lines of code, gives you real-mode parity. Probably the right move.

B. **Make the failure visible.** Show a "Real-Supabase clinician hydration not yet implemented" banner above the queue when `!isMockMode && role === 'clinician'`. Honest, but ugly.

I left it as-is so you can decide.

### Open issue #2 (Important — reviewer's I3): Stale-selection flicker on refresh

If `patients` re-fetches (via `refresh()`), `slices` rebuilds asynchronously but `selectedId` doesn't reset if the previously-selected patient disappears from the new `visibleSlices`. Right pane points at an absent user. Not exercised in mock mode (data static), but a latent issue for real-mode refresh. Easy fix: in the auto-select effect, if `selectedId` is set but not in `visibleSlices`, reset to the top item.

### Open issue #3 (Important — reviewer's I4): Hardcoded English strings in detail pane

`PatientDetailPane` has English-only labels for "Transfusions", "Symptom logs", "Flagged", "Estimated decay", etc. These were inherited from the original `PreVisitSummaryScreen` and predate the dashboard — they affect the patient pre-visit screen too. Fix scope: extract these to i18n keys in en.ts + th.ts; replace literal strings with `t()` calls. Probably a one-hour task; can ship in a follow-up since the symptom keys at least are already translated via the existing `symptom.*` keys.

### Open issue #4 (Minor — reviewer's M1): Unused i18n key

`clinician.detail.reactionOnFile` is defined in both locales but no component reads it. Either wire it in (intended as a banner when `latestTx.reaction_noted = true` on the detail pane), or drop it.

### Open issue #5 (Strategic — auth strand's open question): Manual license verification

Per `04-auth-and-permissions.md`, real clinician sign-up requires a human-in-loop step to verify the Thai Medical Council license before flipping `clinician_profiles.verified = true`. **Until you assign an owner + SLA for this step, real clinician sign-up is closed.** Mock-mode demo is unaffected. The clinician role table and RLS are ready; the missing piece is the verification operations process.

### Open issue #6 (Strategic): Consent UX deferred

`clinician_patient_links` schema has `status`, `requested_at`, `consented_at`, `revoked_at` fields ready, but there is no patient-side UX yet to:
- Receive a pairing request from a clinician
- See the consent screen
- Approve / decline
- See connected clinicians + revoke

For MVP mock-mode demo, links are conceptually "active" without a UI. Real-mode requires this UX to ship before any patient can grant a real clinician access. Auth strand has a full design at `04-auth-and-permissions.md` sections 2–3.

### Open issue #7 (Strategic): No clinician audit log

`consent_events` + `clinician_access_log` tables proposed in the auth strand are NOT in this migration. PDPA compliance will eventually require them. Phase-2.

### Open issue #8 (Cosmetic — reviewer's M5): `daysAgo(-N)` for future dates reads oddly

`mock/clinicianData.ts:86` uses `daysAgo(-7)` to mean "7 days in the future." Works, reads weird. Helper `daysFromNow(n)` would be clearer.

## What I deliberately did NOT do while you were away

- **No push to remote.** Branch is local only.
- **No PR created.**
- **No merge to main** (per your CLAUDE.md).
- **No real clinician sign-up flow** — needs the human-in-loop verification policy.
- **No real patient consent UX** — needs design + Thai legal review of consent copy.
- **No audit-log tables** — Phase-2 PDPA work.
- **No clinician notes / reviews tables** — explicitly deferred in the design synthesis.

## Recommended next session

1. **Decide on Open Issue #1** — wire real-mode hydration (10 lines) or accept the gap with a visible banner.
2. **Land Open Issue #2** (one-line stale-selection fix) — trivial.
3. **Decide on Open Issue #5** — own the license-verification process or pick a partner-hospital SSO route, before opening up real-mode beyond mock-mode demos.
4. **Run `gh pr create`** (with your explicit OK) to open a PR for the overdue-visit branch first (`feat/overdue-visit-symptom-escalation`), then for the dashboard (`feat/doctor-dashboard`). Git will dedupe the overdue commits on the second PR.

## Files of interest

Design + plan:
- `docs/superpowers/specs/doctor-dashboard/design.md`
- `docs/superpowers/plans/2026-05-13-doctor-dashboard-mvp.md`
- 4 strand docs in `docs/superpowers/specs/doctor-dashboard/01-04-*.md`

Implementation hot spots:
- `HaemoCare/src/screens/clinician/ClinicianDashboardScreen.tsx`
- `HaemoCare/src/components/clinician/PatientDetailPane.tsx`
- `HaemoCare/src/contexts/AuthContext.tsx`
- `HaemoCare/src/utils/triageQueue.ts`
- `HaemoCare/supabase/migrations/2026-05-13_clinician_dashboard.sql`
- `HaemoCare/src/mock/clinicianData.ts`

Final review:
- The reviewer's full assessment is in the conversation history — search for "Final Code Review" or the C1/C2/I1–I5/M1–M6 issue labels.
