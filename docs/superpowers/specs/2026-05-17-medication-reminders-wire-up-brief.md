# Medication Reminders — End-to-End Wire-Up — Agent Brief

- **Date:** 2026-05-17
- **Source:** Pilot tester feedback — *"medicine intake (เตือนกินยา)"*
- **Type:** Feature completion (existing scaffolding, missing wiring)
- **Owner:** @ggmrcodes
- **Status:** Ready to dispatch

## Problem

`MedicationRemindersScreen` and the `MedicationReminder` type already exist; the data shape even supports adherence (`taken_today`, `streak_days`). But:
1. **Reminders don't actually fire.** `expo-notifications` is installed but never imported.
2. **Data lives in mock services only.** `src/mock/services.ts` is the backing store — nothing persists to real Supabase for pilot users.
3. **Clinicians can't see adherence.** No widget in `ClinicianDashboardScreen` exposes this data.

The tester's "เตือนกินยา" almost certainly means "the app didn't ping me." Fix all three layers: notifications, persistence, clinician visibility.

## Decisions already made (do not re-ask)

- **Keep the existing UI as-is.** Do not change the frequency enum (`daily | twice_daily | three_times | weekly | as_needed`), the field layout, or add weekday-selection. The tester didn't ask for it.
- **Free-text med name + dose stays.** No curated med list in v1.
- **Local-fire scheduling.** Notifications scheduled on-device via `expo-notifications.scheduleNotificationAsync`. No server-side push.
- **Supabase is source of truth.** Schedules and adherence events persist server-side. On app launch (or when a reminder is created/edited), rehydrate the next ~14 days of local notifications from Supabase.
- **Adherence visible to clinician.** New widget on the clinician dashboard shows per-patient taken/missed counts for the last 7 days.
- **TZ assumption:** Asia/Bangkok. Reschedule everything if the device TZ changes.

## Files to touch

### New files
- `src/services/notifications.ts` — wraps `expo-notifications`: `requestPermission()`, `ensureAndroidChannel()`, `scheduleReminder(med, time, weekday?)`, `cancelReminder(id)`, `cancelAll()`, `rehydrateFromSchedule(schedules)`.
- `src/services/medicationsService.ts` — real Supabase impl of `getMedicationReminders`, `saveMedicationReminder`, `markMedicationTaken`, `unmarkMedicationTaken`, `getAdherenceEvents(userId, sinceDate)`.
- `supabase/migrations/2026-05-17-medication-reminders.sql` — tables: `medication_reminders` (mirrors `MedicationReminder` shape), `medication_adherence_events` (`id`, `user_id`, `reminder_id`, `scheduled_at`, `taken_at | null`, `skipped_at | null`, `source: 'tap' | 'notification' | 'manual'`).
- `src/components/clinician/MedicationAdherenceCard.tsx` — per-patient widget for the dashboard: last 7d taken/missed counts + sparkline.

### Modified files
- `src/screens/detail/MedicationRemindersScreen.tsx` — swap `mockServices.getMedicationReminders/...` for the new real service when `!isMockMode`. Trigger notification scheduling on save/edit/delete.
- `src/contexts/AuthContext.tsx` (or app root) — on login, call `notifications.requestPermission()` + `ensureAndroidChannel()` + `rehydrateFromSchedule(currentUserReminders)`.
- `App.tsx` — register a notification-tap handler that deep-links to `MedicationRemindersScreen` with the reminder pre-selected and a "Did you take it?" action sheet (taken / skipped / snooze 10min).
- `src/screens/clinician/ClinicianDashboardScreen.tsx` — slot in `MedicationAdherenceCard` per patient.
- `src/i18n/` — strings for notification body ("Time to take {{med}}"), permission rationale, dashboard adherence labels (EN + TH).

## Acceptance criteria

- [ ] On first login after install, the app requests notification permission with a short bilingual rationale (don't just fire the OS prompt cold).
- [ ] Creating/editing a medication schedules local notifications for the next 14 days at the configured times.
- [ ] Tapping a notification opens `MedicationRemindersScreen` with a "Did you take {{med}}?" sheet (Taken / Skipped / Snooze 10min).
- [ ] Taken/Skipped writes an `adherence_event` to Supabase.
- [ ] On Android, notifications use a dedicated channel with high importance.
- [ ] Reinstalling the app + logging in restores all scheduled reminders from Supabase.
- [ ] Clinician dashboard shows a "Medication adherence — last 7 days" card per patient (taken / total + sparkline). Empty state when patient has no reminders configured.
- [ ] Notification body is bilingual (use the user's selected language at schedule time; reschedule on language change).
- [ ] All existing mock-mode demo flow still works (mock service path unchanged).
- [ ] Unit tests for the rehydration logic (no duplicate schedules, correct cancellation on edit).

## Open questions / blocked on

- **Snooze behavior:** propose 10-min in-app snooze (re-schedules a one-shot notification 10min out). Confirm if testers want a different default.
- **Missed reminder logic:** if a notification fires and the patient never opens the app, do we record it as `skipped` automatically after some window? Recommend NO for v1 — only explicit user action creates an adherence event. Otherwise clinicians see false-negative "skipped" data.
- **Notification sound:** default sound vs. custom? Default for v1.
- **iOS:** notifications are local-only on Expo Go (see prior spec on Expo Go MVP). For TestFlight builds this works as designed; for Expo Go iPhone testers, notifications may not fire — document this caveat in EXPO_GO_TESTER_GUIDE.

## Out of scope

- Refill alerts ("3 days of pills left").
- Med-interaction warnings (e.g., flagging contraindicated drugs for transfusion-dependent patients).
- Clinician-prescribed schedules (clinician pushes a regimen to the patient).
- Per-medication custom notification sounds.
- Apple Watch / wearables.
