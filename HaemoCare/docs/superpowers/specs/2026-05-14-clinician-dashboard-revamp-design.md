# Clinician Dashboard Revamp — Design Spec

**Date:** 2026-05-14
**Branch:** `feat/emergency-contacts` (target: new branch off `main`)
**Scope:** Medium — enrich the existing read-only dashboard. No new write actions.

## Goals

Turn the current minimal queue/detail screen into a triage cockpit that gives a doctor enough at a glance to know:
- What needs attention right now (alerts)
- Who they're caring for at a cohort level (richer cohort overview)
- How to find a patient fast (search + sort)
- A fuller clinical picture of the selected patient (contact, risk score, event timeline)

Out of scope:
- Note-taking, messaging, appointment scheduling (any write action)
- Patient-side changes
- Schema migrations (everything derived from existing data)

## Architecture

Existing 2-pane shell preserved. All additions are additive components and pure derivations from data already loaded by `useAssignedPatients` + the per-patient hydration loop in `ClinicianDashboardScreen`.

```
SafeAreaView
└── Header (title · clinician chip · sign-out)
└── Body
    ├── Left rail (desktop ≥768px, full-width mobile)
    │   ├── CohortOverviewCard       (NEW — replaces CohortStats)
    │   ├── AlertsStrip              (NEW)
    │   ├── QueueSearchBar           (NEW)
    │   ├── QueueSortSelector        (NEW)
    │   ├── FilterChips              (existing, with explicit "All")
    │   └── FlatList of PatientQueueRow  (existing)
    └── Right pane (desktop)
        └── PatientDetailPane (enriched)
            ├── passportHeader  ← + contact strip + risk badge
            ├── existing sections (30d, Hb, symptoms, adherence)
            └── CareEventsTimeline    (NEW, clinician-only)
```

New components live under `src/components/clinician/`. No service-layer changes; one optional fetch added (emergency contacts) gated on existing consent.

## Section 1 — Layout & cohort overview

### Header

Adds a `ClinicianIdentityChip` on the right of the existing header (before sign-out): shows `clinicianProfile.full_name` and a small subtitle with `hospital_affiliation`. Falls back to a generic "Clinician" label if profile load fails. Requires a one-time fetch of `ClinicianProfile` via existing `getClinicianProfile` (and mock equivalent).

### CohortOverviewCard

Replaces `CohortStats`. Two rows:

- **Row 1** — the three existing counters (overdue / monitor / stable), slightly smaller type.
- **Row 2** — three new compact stats:
  - `cohortSize` — `slices.length`
  - `urgentLogs7d` — count of slices where any log in the last 7 days has `outcome === 'urgent'`
  - `transfusions7d` — count of slices whose `latestTx.date` is within 7 days

A **14-day overdue sparkline** below the rows: for each of the last 14 days (oldest → newest), compute the cohort's overdue count *as of that day* using the same `computeOverdueState` predicate but with `today = D`. Render as a 36px-high SVG polyline + dots. The point for today is filled; prior points are hollow.

All values memoized off `slices`. No new service calls.

### Breakpoint

A new `isWide` (`width >= 1100`) flag added to `useResponsive` (or computed inline). When `isWide`, left rail widens from 360 → 400, and the cohort sparkline gets `width=320` instead of `width=260`. Otherwise everything continues to use the existing `isDesktop` breakpoint unchanged.

## Section 2 — AlertsStrip

Compact list of up to **5** items needing attention. Sits between the cohort card and the search box.

### Alert kinds (derived from `slices[]`)

| Kind | Trigger | Severity |
|---|---|---|
| `urgent_log` | any `SymptomLog.outcome === 'urgent'` in last 7 days | red |
| `reaction_recorded` | `latestTx.reaction_noted === true` AND `latestTx.date` within last 30 days | red |
| `tier2_overdue` | `overdueState.bumpTiers === 2` | red |
| `tier1_overdue_new` | `bumpTiers === 1 && daysOverdue <= 3` | amber |

`hb_projection` alerts are deferred — they require a per-patient `projectHbDecay` call on the dashboard, which is too expensive at cohort load time for v1.

### Ordering & dedupe

1. Red severity before amber.
2. Within a severity bucket, newest `signalAt` timestamp first.
   - `signalAt` for `urgent_log` = `log.logged_at`
   - for `reaction_recorded` = `latestTx.date`
   - for overdue kinds = `today - daysOverdue` (i.e. the day they crossed)
3. **Dedupe**: at most one alert per `(patientId, kind)` — newest wins.
4. Sliced to top 5. If `total > 5`, render a `+{n} more` non-interactive footer line.

### Row interaction

Tapping a row calls `setSelectedId(patientId)`. On desktop, the right pane updates immediately. On mobile (the screen currently renders only the left rail when `!isDesktop`), tapping selects the patient and scrolls the screen to the existing `PatientDetailPane` block which renders below the queue. Identical behavior to tapping a queue row.

### Empty state

"No alerts — your cohort is steady." in `textLight`, one-line height.

### Component

`src/components/clinician/AlertsStrip.tsx` — props `{ alerts: Alert[]; selectedPatientId: string | null; onSelectPatient: (id: string) => void; }`. Pure rendering. Alert derivation lives in a new `src/utils/cohortAlerts.ts` to keep the screen file focused and to be unit-testable.

## Section 3 — Search & sort

### Search

`QueueSearchBar` — single `TextInput`, debounced 150 ms. Matches case-insensitively against:
- `profile.patient_id` (always)
- `profile.full_name` (only when `share_full_name === true`)

Clear-button when query is non-empty. Empty query is no-op.

### Sort

`QueueSortSelector` — a chip that opens a small menu of four options:
- **Triage** (default) — existing `sortTriageDescending`, unchanged
- **Name** — A→Z by displayed name (falls back to patient_id when name not shared)
- **Most recent activity** — by `max(latestTx?.date, mostRecentLog?.logged_at, pastAppt?.scheduled_date)`, descending
- **Days overdue** — descending; non-overdue last; tiebreak by name

Sort selection is session-scoped state (`useState`). No persistence in v1.

### Pipeline

The `visibleSlices` memo becomes:
1. Apply search filter
2. Apply filter chip (existing)
3. Apply chosen sort

The existing top-overdue auto-select effect runs against the final `visibleSlices`, unchanged.

### No-results

When `visibleSlices.length === 0` and a non-default filter or non-empty search is active: render "No patients match [query] / [filter]" + a "Clear" button that resets both back to defaults.

### Filter chips

`FilterChips` gains an explicit "All" chip representing `null`. Active state visually identical to today.

## Section 4 — Detail-pane enrichment

All additions are **clinician-view-only** (`isClinicianView === true`) so the patient-facing Pre-Visit Summary screen is unaffected.

### Contact & context strip

A new row inside `passportHeader`, below `patientMeta`:
- **Primary hospital** — derived: most-frequent `hospital` across that patient's transfusions; "—" if none.
- **Language** — `language_preference` → "TH" / "EN" pill.
- **Last activity ago** — relative time of `max(latestTx?.date, latestLog?.logged_at, pastAppt?.scheduled_date)`; "No activity" if none.
- **Emergency contacts** — collapsed by default to `"📞 {n} contacts"`. Expanding renders each `EmergencyContact` row (name · role_label · phone). Gated on `clinician_patient_links.share_full_name === true` for that link (re-uses the existing consent flag rather than introducing a new one). If `share_full_name === false`, the row is rendered as `"📞 Contacts hidden by patient"` with no expansion.

An existing `listEmergencyContacts(userId)` lives in `src/services/emergencyContactsService.ts` but is patient-scoped (the RLS policy almost certainly restricts to `auth.uid()`). We add a clinician-scoped read: `getEmergencyContactsForPatient(userId)` in `src/services/clinicianService.ts` that goes through the `clinician_patient_links` join, plus mock parity. RLS is assumed to enforce link-based access at the Supabase layer; the in-app `share_full_name` flag is a UI courtesy, not the security boundary. If the Supabase policy for `emergency_contacts` doesn't yet allow clinician reads via active links, that policy change is a prerequisite — flagged here, addressed in the plan.

### Risk-score badge

A `RiskBadge` pill rendered in `passportTop` next to the existing `OverdueBadge` when present (and on its own when not).

Composite score, range 0–10:

```
score = 0
score += bumpTiers === 2 ? 3 : bumpTiers === 1 ? 2 : 0
score += worstRecentOutcome === 'urgent' ? 3 : worstRecentOutcome === 'monitor' ? 1 : 0
score += hasReactionOnFile ? 2 : 0
score += hbResult.daysUntilThreshold == null ? 0
       : hbResult.daysUntilThreshold <= 0 ? 3
       : hbResult.daysUntilThreshold <= 14 ? 2 : 0
score = min(score, 10)
```

Label and color:
- 0–2 → `"Risk {n} · Low"`, green (`statusNormal`)
- 3–5 → `"Risk {n} · Med"`, amber (`statusMonitor`)
- 6–10 → `"Risk {n} · High"`, red (`statusUrgent`)

Lives in `src/utils/riskScore.ts` for unit testing. Inputs are the same per-patient slice + the already-computed `HbDecayResult` for that patient.

### Care-events timeline

New section, last in the scroll, clinician-view-only. Last **60 days**, newest first, max **25 rows** rendered (`+N earlier` footer if truncated).

Each row: icon + one-line summary + relative date.

| Source | Icon | Line | Tint |
|---|---|---|---|
| Transfusion | `droplet` | `"{units}u · {hospital} · pre {pre} / post {post}"` (omit Hb pair if missing) | red dot prefix if `reaction_noted` |
| Symptom log | `activity` | `"Logged: {top 3 symptoms} ({outcome})"` | colored by `outcome` (`statusNormal/Monitor/Urgent`) |
| Appointment (past only) | `calendar` | `"Visited {hospital}"` | neutral |

Merged from arrays already loaded by `loadPatientData` (`transfusions`, `logs`) + a new clinician-view appointment fetch (existing `getMostRecentPastAppointmentForPatient` returns only one; we extend to `getPastAppointmentsForPatient(userId, sinceISO)` in both real and mock services).

Component: `src/components/clinician/CareEventsTimeline.tsx`. Merge/sort logic in `src/utils/careEventsTimeline.ts`.

## Data flow summary

`ClinicianDashboardScreen` already builds `slices[]`. We add:
1. Optional `getClinicianProfile` call on mount (header chip).
2. Pure derivations: `cohortAlerts`, `overdueSparkline`, search/sort transforms — all from `slices`.
3. In `PatientDetailPane`, a parallel fetch for `emergencyContacts` and `pastAppointments` joins the existing `Promise.all`.

No new global state, no new persistence. All session-local.

## File map

**New**
- `src/components/clinician/CohortOverviewCard.tsx`
- `src/components/clinician/AlertsStrip.tsx`
- `src/components/clinician/QueueSearchBar.tsx`
- `src/components/clinician/QueueSortSelector.tsx`
- `src/components/clinician/ClinicianIdentityChip.tsx`
- `src/components/clinician/RiskBadge.tsx`
- `src/components/clinician/CareEventsTimeline.tsx`
- `src/components/clinician/OverdueSparkline.tsx`
- `src/utils/cohortAlerts.ts`
- `src/utils/cohortHistory.ts` (14-day overdue counts)
- `src/utils/riskScore.ts`
- `src/utils/careEventsTimeline.ts`
- `src/utils/__tests__/cohortAlerts.test.ts`
- `src/utils/__tests__/riskScore.test.ts`
- `src/utils/__tests__/careEventsTimeline.test.ts`
- `src/utils/__tests__/cohortHistory.test.ts`

**Modified**
- `src/screens/clinician/ClinicianDashboardScreen.tsx` — wires in the new pieces; pipeline order; identity chip; widescreen flag
- `src/components/clinician/PatientDetailPane.tsx` — contact strip; risk badge; care events timeline; emergency contacts fetch
- `src/components/clinician/FilterChips.tsx` — add explicit "All" chip
- `src/services/clinicianService.ts` — add `getPastAppointmentsForPatient(userId, sinceISO)` and `getEmergencyContactsForPatient(userId)`
- `src/mock/services.ts` (or wherever mock dispatch lives) — mock parity for the two new reads
- `src/mock/clinicianData.ts` — seed emergency contacts on one or two mock patients to exercise both shared/hidden states
- `src/i18n/en.ts` + `src/i18n/th.ts` — new translation keys
- `src/utils/responsive.ts` — add `isWide` boolean (`width >= 1100`) to the existing `useResponsive` hook, alongside `isDesktop`

**Removed**
- `src/components/clinician/CohortStats.tsx` — absorbed by `CohortOverviewCard` (keep its test coverage, port what applies)

## i18n keys

```
clinician.cohort.size
clinician.cohort.urgentLogs7d
clinician.cohort.transfusions7d
clinician.cohort.sparkline.label

clinician.alerts.title
clinician.alerts.empty
clinician.alerts.more
clinician.alerts.urgentLog
clinician.alerts.reactionRecorded
clinician.alerts.tier2Overdue
clinician.alerts.tier1OverdueNew

clinician.search.placeholder
clinician.search.clear
clinician.sort.label
clinician.sort.triage
clinician.sort.name
clinician.sort.recentActivity
clinician.sort.daysOverdue
clinician.filter.all

clinician.detail.hospital
clinician.detail.language
clinician.detail.lastActivity
clinician.detail.lastActivity.none
clinician.detail.contactsCount
clinician.detail.contactsHidden
clinician.detail.risk.low
clinician.detail.risk.med
clinician.detail.risk.high
clinician.detail.timeline.title
clinician.detail.timeline.empty
clinician.detail.timeline.more
clinician.detail.timeline.tx
clinician.detail.timeline.log
clinician.detail.timeline.appt
clinician.queue.noMatch
clinician.queue.clearFilters
```

## Testing

Unit tests, all new utilities:
- `cohortAlerts`: severity ordering, dedupe per `(patient, kind)`, top-5 truncation, +N counter, empty cohort.
- `cohortHistory`: 14-day series shape; non-overdue patient never contributes; overdue patient contributes for the right days.
- `riskScore`: each predicate, cap at 10, label/color thresholds.
- `careEventsTimeline`: 60-day cutoff, chronological order, type mixing, 25-row truncation.

No new integration tests in v1 — the existing screen-level test (if any) should be updated to assert the new sections render without throwing on empty data.

## Performance

Cohort hydration loop already does `O(N)` service calls with `Promise.all`. New additions are pure JS over those results, so total complexity is unchanged. The 14-day overdue sparkline is `O(14 × N)` integer comparisons — trivial. No additional network requests at the cohort level.

The detail pane gains two parallel fetches (`emergencyContacts`, `pastAppointments`) inside the existing `Promise.all` — same shape, one more round trip. Acceptable.

## Open questions resolved during design

- **Emergency contacts gating**: re-use `clinician_patient_links.share_full_name` rather than add a new `share_emergency_contacts` field. Cheaper; the existing consent flag already gates personally identifying info.
- **Primary hospital**: derived from transfusions (most-frequent) rather than added as a Profile field. Avoids a migration.
- **Sort persistence**: session-only for v1. Persistence can come later.
- **Hb projection alert**: deferred — would require running `projectHbDecay` per cohort patient on the dashboard. Cost not justified for v1.
