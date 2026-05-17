# Transfusion Interval Unit (Day → Week) — Agent Brief

- **Date:** 2026-05-17
- **Source:** Pilot tester feedback — *"ระยะห่างระหว่างให้เลือด change from day to week"*
- **Type:** UI fix (low ambiguity, no DB migration)
- **Owner:** @ggmrcodes
- **Status:** Ready to dispatch

## Problem

The patient profile asks for the **recommended visit/transfusion interval** as a raw number of days. Testers think in weeks (every 2 weeks, every 4 weeks), not days, and find "28" unintuitive. Make the input speak the user's language while keeping the existing data model intact.

## Decisions already made (do not re-ask)

- **UI change only.** Storage column `profiles.recommended_visit_interval_days` stays in days. No DB migration.
- **Conversion:** `days = weeks * 7` on save; `weeks = days / 7` (rounded) on load.
- **Default:** 4 weeks (matches current default of 28 days).
- **Bounds:** 1 to 26 weeks (matches the existing 7-to-180-day clamp; 26 ≈ 182).
- **Control style:** stepper (− / value / +) preferred over raw number input — testers struggle with the keypad.

## Files to touch

- `src/components/passport/ProfileEditForm.tsx` lines 140-152 — replace the TextInput with a week stepper.
- `src/screens/auth/ProfileCompletionScreen.tsx` — same control used here too, verify and update.
- `src/screens/clinician/ClinicianDashboardScreen.tsx` line 212 — display side: render `recommendedIntervalDays / 7` as weeks where shown.
- `src/i18n/` — update `profileSetup.visitInterval` + `profileSetup.visitIntervalHint` for EN and TH ("weeks between transfusions", "สัปดาห์ระหว่างการให้เลือด").
- No changes to `src/utils/cohortHistory.ts`, `src/utils/overdueVisit.ts`, or DB schema.

## Acceptance criteria

- [ ] Profile edit + profile completion show a week stepper, not a raw number input.
- [ ] Saving "4 weeks" persists `recommended_visit_interval_days = 28`.
- [ ] Loading an existing patient with `recommended_visit_interval_days = 21` displays "3 weeks".
- [ ] Non-multiples-of-7 stored values round to nearest week on display; on save the stepper-emitted weeks always produce a clean multiple of 7.
- [ ] Clinician dashboard renders cadence in weeks too (consistent with patient side).
- [ ] Existing tests in `src/utils/__tests__/` still pass; add a small unit test for the conversion helper.
- [ ] TH translation reviewed.

## Open questions

- None blocking. If clinician needs to see exact days somewhere for clinical reasons, add a small "(28 days)" suffix — leave that to the implementer's judgment.

## Out of scope

- Allowing per-patient unit choice (day vs week).
- Migrating `_days` → `_weeks` column.
- Changing the cadence calculation logic in `overdueVisit.ts`.
