# Overdue Visit → Symptom Escalation

**Status:** Approved design (2026-05-12). Implementation plan not yet written.
**Scope:** HaemoCare (Expo / React Native + Supabase).

## Problem

Thalassemia patients on a regular transfusion schedule depend on showing up roughly on cadence. When a patient slips past their planned visit, any symptoms they log should be read against a more cautious yardstick — a headache logged 4 days late means something different from one logged 25 days late. Today, HaemoCare's symptom logger treats every entry the same regardless of how overdue the patient is.

This feature detects when a patient is overdue, raises the suggested severity of symptoms they log while overdue, and surfaces the overdue state in two places that have a clear action path.

## Out of scope

- Clinician-facing overdue indicators (e.g. on `PreVisitSummaryScreen` or the QR passport). Defer until hospital/FHIR sync work lands.
- Push notifications at overdue thresholds. Defer; ship in-app banners first and observe behaviour.
- A "dismiss" affordance on the banner. The banner is a state indicator, not a one-shot notification — it clears when the patient books an appointment or logs a transfusion.
- Recording whether the patient overrode a bumped outcome. Add when clinician export is built.
- Analytics events (`src/analytics/` is left untouched for this pass).
- Changes to `aiExtraction.ts`. The bump is a deterministic layer applied on top of whatever outcome AI or the patient produces.

## Overdue model

A patient is `N` calendar days overdue, where `N = today − planned_visit_date` and `planned_visit_date` is the **earlier** of:

- **(A) Missed appointment path:** take the **latest** past appointment (by `scheduled_date`). If no transfusion exists with `date >= scheduled_date`, this path produces `scheduled_date` as the planned date. Otherwise the patient already came in for that appointment and this path produces nothing — earlier missed appointments are ignored once the latest one has been "made."
- **(B) Cadence path:** `last_transfusion_date + profile.recommended_visit_interval_days`.

If both produce a date, take the earlier (more conservative). On an exact tie, prefer the appointment path's sourcePath (it has the more specific copy). If neither exists (a brand-new patient with no transfusions and no appointments), the feature is a no-op.

**Grace period:** 7 days. `N ≤ 7` → not overdue.

**Bump tiers:**
- `8 ≤ N ≤ 21` → bump suggested outcome up **one** tier (`normal → monitor`, `monitor → urgent`)
- `N ≥ 22` → bump up **two** tiers (`normal → urgent`, `monitor → urgent`)
- `urgent` is the cap and never escalates further

Day-resolution math via `date-fns`'s `differenceInCalendarDays` (already a dependency) — no hour-level fences.

## Schema change

Single migration. `symptom_logs`, `transfusions`, and `appointments` are not touched.

```sql
alter table public.profiles
  add column recommended_visit_interval_days integer not null default 28
  check (recommended_visit_interval_days between 7 and 180);
```

- Default `28` is the standard thalassemia transfusion cadence (2–4 weeks).
- Range check `[7, 180]` prevents nonsense values while leaving room for less-frequent care patterns.
- Existing `profiles` UPDATE policy covers this column — no new RLS work.

We do **not** add an `overdue_at_log` flag to `symptom_logs`. Overdue state at log time is reconstructible from `logged_at` + transfusions + appointments + interval. Add the flag only when a future clinician-export feature needs the denormalised query path.

## Code structure

### New pure module — `src/utils/overdueVisit.ts`

```
OUTCOME_LADDER = ['normal', 'monitor', 'urgent']

GRACE_DAYS = 7
TIER_1_MAX = 21         // 8..21 → bumpTiers=1
                        // 22..  → bumpTiers=2

computeOverdueState({
  profile,                  // needed for recommended_visit_interval_days
  mostRecentTransfusion,    // { date } | null
  mostRecentPastAppointment,// the latest past appointment with no transfusion at/after it; null otherwise
  today,
}) → OverdueState

OverdueState =
  | { isOverdue: false }
  | { isOverdue: true,
      daysOverdue: number,        // N
      bumpTiers: 1 | 2,
      sourcePath: 'appointment' | 'cadence',
      plannedVisitDate: string,   // ISO; for copy
    }

applyBump(originalOutcome: Outcome, bumpTiers: 0 | 1 | 2) → Outcome
```

All thresholds are exported constants so tuning lives in one file. No I/O, fully unit-testable.

### New hook — `src/hooks/useOverdueState.ts`

- Reads `profile`, `getMostRecentTransfusion(userId)` (new helper in `transfusionService.ts`), and `getMostRecentPastAppointment(userId)` (new helper in `appointmentService.ts`).
- Composes them into `computeOverdueState` and returns `{ overdueState, loading, error, refresh }`.
- On error (offline / RLS / etc.), returns `overdueState: null` and `error`. Screens treat null as "no overdue state" — banners hidden, bump not applied. Failure mode is silent degradation; never a false warning.
- Re-runs on focus via `useFocusEffect` in each consumer.

### New shared component — `src/components/OverdueBanner.tsx`

Props: `{ daysOverdue: number; variant: 'monitor' | 'appointments'; onPressCta: () => void }`. Variant changes the copy and CTA label. No internal navigation — caller wires the CTA.

### New transfusion helper — `src/services/transfusionService.ts`

```
getMostRecentTransfusion(userId): Promise<{ date: string } | null>
```

### New appointment helper — `src/services/appointmentService.ts`

```
getMostRecentPastAppointment(userId): Promise<Appointment | null>
// "most recent past appointment with no transfusion at/after it" — done client-side
// by joining the two queries the hook already runs, to avoid a custom SQL view.
```

The "no transfusion at/after it" filter is applied in `computeOverdueState` (it already has both inputs), not in the service. The service just returns the latest past appointment.

### Touched UI files

- `src/screens/detail/NewSymptomLogScreen.tsx` — read `useOverdueState`, apply `applyBump` to the AI/manual suggested outcome before save, render inline bump explanation above the outcome selector when `bumpTiers > 0`.
- `src/screens/tabs/SymptomMonitorScreen.tsx` — render `<OverdueBanner variant="monitor">` at top when overdue. CTA navigates to Appointments tab.
- `src/screens/tabs/AppointmentsScreen.tsx` — render `<OverdueBanner variant="appointments">` at top when overdue. CTA navigates to `AddAppointmentScreen`.
- `src/screens/detail/EditProfileScreen.tsx` — one numeric input for `recommended_visit_interval_days` with default placeholder `28`.
- `src/services/profileService.ts` — extend `updateProfile` to pass the new field.
- `src/i18n/...` — three new keys (see below).

## Data flow: new symptom log

1. Patient opens **NewSymptomLogScreen**.
2. `useOverdueState()` resolves. Example: last transfusion 45 days ago, interval 28, no missed appointment → `daysOverdue = 17`, `bumpTiers = 1`, `sourcePath = 'cadence'`.
3. Patient enters symptoms. AI extraction or manual selection produces `suggestedOutcome = 'monitor'`.
4. Pre-save: `applyBump('monitor', 1) → 'urgent'`. Screen shows the bumped value as the default outcome, with an inline note above the selector:

   > ⚠️ You're 17 days past your planned visit. We've raised this from **Monitor** to **Urgent**. You can change it back, but please contact your hospital.

5. Patient may tap the outcome selector and override. Whatever the patient confirms is what saves.
6. `createSymptomLog` runs unchanged. The `outcome` column receives the patient-confirmed value.

The bump explanation stays anchored to the AI/manual suggestion as the "from" value, not the live selector — otherwise the note's claim becomes inconsistent the moment the patient overrides. The selector is the source of truth for what saves; the note is the source of truth for what the system suggested.

Not-overdue path: `computeOverdueState → { isOverdue: false }`. Note doesn't render. AI/manual outcome flows through unchanged. The feature is a no-op.

## Data flow: banners

Both `SymptomMonitorScreen` and `AppointmentsScreen` call `useOverdueState()` on focus. When `isOverdue`, render the banner. Appointments variant CTA → `AddAppointmentScreen`. Monitor variant CTA → navigate to the Appointments tab (cheaper than re-rendering AddAppointment inside the monitor stack).

## Edge cases

| Case | Behaviour |
|---|---|
| New patient, 0 transfusions, 0 appointments | `isOverdue: false`. Silent. |
| Future appointment exists, past one missed | Use the missed past appointment. Booking a future appointment does not clear an existing overdue state — only a transfusion within `[planned_date, today]` does. |
| Transfusion logged after the missed appointment | That appointment is considered "made." Overdue collapses on next render. |
| Cadence path says day 12, missed-appt path says day 5 | Use the earlier (day 12 from cadence). Banner copy uses the source path that fired ("12 days past your usual transfusion window") so the math matches the explanation. |
| Interval set to `7` (minimum) | Allowed. Grace still applies → tier-1 bump at day 14 from last transfusion. |
| Suggested outcome is already `urgent` | `applyBump('urgent', _) → 'urgent'`. No double-warning, no bump explanation rendered. |
| Hook query fails | `overdueState: null`. Banners hidden, bump not applied. Error logged but not surfaced. Failure mode = no warning, never a false warning. |
| Future FHIR sync drops in a retroactive past appointment | Already covered. Hook re-reads on focus; the synced appointment shifts the calc next time the screen mounts. |
| Old symptom log viewed later | Not re-bumped. `symptom_logs.outcome` captured at save time is the historical record. We never mutate old logs based on today's overdue state. |

## i18n

Three new keys in `src/i18n/`, parametrised on `{days}`, `{from}`, `{to}`:

- `overdue.banner.monitor` — "You're {days} days past your planned visit. Logged symptoms are being treated as more severe."
- `overdue.banner.appointments` — "{days} days overdue — book an appointment now."
- `overdue.bumpExplanation` — "Because you're {days} days past your planned visit, we've raised this from **{from}** to **{to}**. You can change it back, but please contact your hospital."

Plus the existing English source strings. Thai translations follow the existing translation flow.

## Testing

`jest` + `jest-expo` are already configured.

- `overdueVisit.test.ts` — table-driven for `computeOverdueState`: no data; only transfusions; only appointments; cadence vs. appointment whichever-earlier; in-grace; tier-1 boundaries (days 7/8 and 21/22); tier-2 boundaries (day 22+); transfusion-after-appointment clears state; `urgent` stays `urgent`.
- `applyBump.test.ts` — every `(originalOutcome, bumpTiers)` pair.
- One smoke test for `useOverdueState` with mocked services to assert it composes inputs correctly and degrades silently on error.

No UI snapshot or integration tests in this pass — the screens are simple compositions of a tested banner and a tested bump function.

## Assumptions

1. Source-of-truth for "last visit" is `transfusions.date`. Appointments today have no `completed` flag. For transfusion-dependent thalassemia patients, the transfusion *is* the visit, so this is correct. If a `completed` flag is added later, the cadence path could swap input — single-file change in `useOverdueState`.
2. Default interval `28` days. Editable per patient via EditProfileScreen.
3. Grace `7` days. Tuning constant in `overdueVisit.ts`.
4. Bumps are computed at log time and captured in `symptom_logs.outcome`. Re-renders of historical logs never re-bump.
5. No analytics events in this pass.
6. No clinician-facing surface in this pass. The pre-visit summary is untouched.

## Related future work

- Hospital / FHIR appointment sync ([[project_hospital_integration]]) will retroactively land past appointments; the hook already handles this with no special path.
- Wearable / passive-vitals integration ([[project_wearable_integration]]) could eventually feed an objective layer alongside this subjective-signal layer — out of scope here.
- Clinician export & passport overdue indicator — natural follow-up once the in-app version has been observed in real use.
