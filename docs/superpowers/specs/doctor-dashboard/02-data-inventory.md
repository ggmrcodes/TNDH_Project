# Doctor Dashboard — Data Inventory (Strand 02)

Scope: account for the data layer behind a clinician-facing dashboard. Other strands cover personas, wireframes, and auth (clinician role assumed to exist).

## 1. Panel-by-panel data accounting

Each row maps a plausible dashboard panel to the underlying tables/columns, the aggregation it needs, and the gaps. "Overdue" math is **not** redefined — it is the pure function at `HaemoCare/src/utils/overdueVisit.ts` (`computeOverdueState`).

| Panel | Source tables / columns | Aggregation | Gaps / notes |
|---|---|---|---|
| **Overdue patients list** | `profiles.recommended_visit_interval_days`, latest `transfusions.date` per patient, latest past `appointments.scheduled_date` per patient | Per patient: feed the three inputs into `computeOverdueState(today)`. Sort by `daysOverdue` desc. | None for math. Needs cross-patient read (see §2). Currently no `last_transfusion_at` denorm — recomputed on each query. |
| **Recent urgent / monitor symptoms (last 7d)** | `symptom_logs.outcome`, `logged_at`, `user_id`, `symptoms`, `severity_scores`, `transfusion_id` | Filter `outcome in ('urgent','monitor')` and `logged_at >= now() - 7d`. Group by `user_id`, keep latest per patient + count. | Cheap with existing `idx_symptom_logs_user (user_id, logged_at desc)`, but the predicate is on `outcome` — a partial index on `(logged_at desc) where outcome <> 'normal'` would help at scale (phase-2). |
| **Recent transfusion reactions** | `transfusions.reaction_noted`, `reaction_detail`, `date`, `hospital`, `user_id` | Filter `reaction_noted = true` and `date >= now() - 30d`. | None. Partial index `where reaction_noted` is cheap (phase-2). |
| **Hb pre/post trend (per patient)** | `transfusions.pre_hb_g_dl`, `post_hb_g_dl`, `date` | Per-patient time series; feed into `projectHbDecay()` for projected-threshold date. | `pre_hb_g_dl` / `post_hb_g_dl` are nullable in TS but absent from SQL DDL (see §5 gap). Need to confirm the column was added to the live DB — if not, this panel is blocked. |
| **Hb-decay watchlist (cross-patient)** | Same as above, plus `daysUntilThreshold` from `projectHbDecay` | Per patient, compute projection; surface those with `daysUntilThreshold <= 7` and `confidence in ('moderate','high')`. | Pure-fn so cheap client-side per patient, but iterating N patients in the browser is O(N) round-trips unless we batch. Good candidate for a **materialized view** (phase-2). |
| **Transfusion cadence trend (per patient)** | `transfusions.date` | Diff consecutive dates per patient → recent intervals; compare to `profiles.recommended_visit_interval_days`. | None. Pure derivation. |
| **Symptom temporal patterns (per patient)** | `symptom_logs` + `transfusions` | `computeSymptomTimepoints()` + `summarizePatterns()`. | Already implemented client-side. Cheap when scoped to one patient. |
| **Triage rollup (per patient)** | `symptom_logs.outcome`, `severity_scores`, recent `transfusions` | `triageSymptoms()` over latest log. | Already implemented. |
| **Adherence** | (TS-only) `MedicationReminder` interface in `src/types/database.ts` | `computeAdherenceSummary()` | **`medication_reminders` table does not exist in `schema.sql`.** Adherence is currently client/local-state only. Out of scope for v1 dashboard — flag as phase-2. |
| **Patient roster + identity** | `profiles.patient_id`, `full_name`, `share_full_name`, `blood_type`, `rh_factor`, `antibodies`, `known_reactions`, `language_preference` | Filtered to the clinician's assigned patients (see §3). | Display name must honor `share_full_name` — fall back to `patient_id` when false. |
| **Upcoming appointments (next 14d, all patients)** | `appointments.scheduled_date`, `hospital`, `source`, `user_id`, `linked_transfusion_id` | `scheduled_date between now() and now()+14d`. | Cheap with `idx_appointments_user_date`, but query-by-date-across-users wants `(scheduled_date) where scheduled_date >= now()` (phase-2). |
| **"Has unreviewed activity"** | New `clinician_reviews` table (see §3) joined to recent `symptom_logs` / `transfusions` | `max(logged_at)` per patient vs. `clinician_reviews.last_reviewed_at`. | Requires new table. |

## 2. Cross-patient query patterns

All existing RLS policies are `auth.uid() = user_id` — patient-scoped. Clinician access needs new policies that key off **patient assignment**, not ownership.

Sketches (the **clinician_patients** join table appears in §3):

```sql
-- All patients assigned to me, overdue inputs in one shot
select p.user_id, p.patient_id, p.full_name, p.share_full_name,
       p.recommended_visit_interval_days,
       (select max(t.date)
          from transfusions t where t.user_id = p.user_id)            as last_tx_date,
       (select max(a.scheduled_date)
          from appointments a
          where a.user_id = p.user_id and a.scheduled_date < now())   as last_past_appt
  from profiles p
  join clinician_patients cp on cp.patient_user_id = p.user_id
 where cp.clinician_user_id = auth.uid();
```

Cost: `clinician_patients(clinician_user_id)` btree → cheap. Both correlated subqueries hit `idx_transfusions_user_date` and `idx_appointments_user_date` → seek per patient, fine up to a few hundred patients per clinician. Beyond that, denormalize to `profiles.last_transfusion_at` / `profiles.last_past_appt_at` via trigger (phase-2).

```sql
-- All my patients with urgent/monitor log in last 7d
select sl.user_id, max(sl.logged_at) as latest, count(*) as n
  from symptom_logs sl
  join clinician_patients cp
    on cp.patient_user_id = sl.user_id and cp.clinician_user_id = auth.uid()
 where sl.logged_at >= now() - interval '7 days'
   and sl.outcome <> 'normal'
 group by sl.user_id;
```

Cost: existing `idx_symptom_logs_user(user_id, logged_at desc)` is fine — predicate on `outcome` is filtered after. For large clinics, add a partial index (phase-2).

## 3. Minimum schema additions (MVP)

The product/UX strand has not yet prioritized tagging, free-form patient lists, etc. Cover only the must-haves: assignment, review marker, clinician notes.

```sql
-- Clinician ↔ patient assignment. Many-to-many.
create table public.clinician_patients (
  id uuid default uuid_generate_v4() primary key,
  clinician_user_id uuid references auth.users(id) on delete cascade not null,
  patient_user_id   uuid references auth.users(id) on delete cascade not null,
  assigned_at       timestamptz default now(),
  unassigned_at     timestamptz,
  unique (clinician_user_id, patient_user_id)
);
create index idx_clinician_patients_clinician on public.clinician_patients(clinician_user_id) where unassigned_at is null;
create index idx_clinician_patients_patient   on public.clinician_patients(patient_user_id)   where unassigned_at is null;

-- "I reviewed this patient" marker. One row per (clinician, patient), upserted.
create table public.clinician_reviews (
  id uuid default uuid_generate_v4() primary key,
  clinician_user_id uuid references auth.users(id) on delete cascade not null,
  patient_user_id   uuid references auth.users(id) on delete cascade not null,
  last_reviewed_at  timestamptz not null default now(),
  unique (clinician_user_id, patient_user_id)
);

-- Private clinician note. Append-only history (no edit/delete in MVP).
create table public.clinician_notes (
  id uuid default uuid_generate_v4() primary key,
  clinician_user_id uuid references auth.users(id) on delete cascade not null,
  patient_user_id   uuid references auth.users(id) on delete cascade not null,
  body text not null,
  created_at timestamptz default now()
);
create index idx_clinician_notes_patient on public.clinician_notes(patient_user_id, created_at desc);
```

RLS sketch (auth strand owns the role check; this is the data shape):

```sql
-- Read-through on patient data is gated by an assignment row.
create policy "Clinicians read assigned patients' profiles"
  on public.profiles for select using (
    exists (select 1 from clinician_patients cp
             where cp.patient_user_id = profiles.user_id
               and cp.clinician_user_id = auth.uid()
               and cp.unassigned_at is null)
  );
-- Same pattern for transfusions / symptom_logs / appointments.
```

## 4. Where each derived metric lives

| Metric | Compute site | Why |
|---|---|---|
| `computeOverdueState` per patient | **Client** (already pure) | Tiny inputs, sub-ms; reuse the shipped function. |
| `projectHbDecay` per patient | **Client** when viewing one patient | Pure, needs only that patient's transfusions. |
| Hb-decay **watchlist** across all assigned patients | **DB view** (phase-1) → **materialized view + cron** (phase-2) | View is fine for <100 patients/clinician; matview when projections must be sortable across thousands. |
| "Has unreviewed activity since `last_reviewed_at`" | **DB view** | Join `clinician_reviews` to `max(logged_at)` per patient — one query for the whole list. |
| Cohort counts (overdue, urgent-7d, reaction-30d) for dashboard header | **DB view** | Single round-trip; cheap with existing per-patient indexes. |
| Symptom temporal patterns | **Client**, per-patient detail view | Already implemented; not a cross-patient metric. |
| Adherence rollup | **Phase-2** | Requires persisting `medication_reminders` to DB first. |

Rule of thumb: anything scoped to one patient stays client-side (reuse the analytics utilities verbatim). Anything that ranks/filters *across* the clinician's assigned cohort goes into a Postgres view. Promote to a materialized view only when measured query time crosses ~300ms.

## 5. PDPA touchpoints (data only — flow is auth strand's)

- `profiles.pdpa_consented` / `pdpa_consented_at` cover **patient-app** consent. They do **not** authorize clinician read. A separate consent surface is needed before a clinician can read a patient's `symptom_logs` / `transfusions` / `notes`. Suggested data point: `clinician_patients.consent_granted_at timestamptz` (nullable; null = assignment exists but not yet consented; reads gated on `not null`).
- `profiles.share_full_name` already exists — clinician views must honor it for any shared/derived export. Default to `patient_id` when false.
- `clinician_notes.body` is private clinician text *about* the patient. Per PDPA principle, the patient should eventually be able to see/export it; for MVP keep clinician-only reads and flag patient-facing access as phase-2.
- Audit trail: not in this strand, but expect an `access_log` requirement during PDPA review. Flagging here so it isn't a surprise.

## 6. Gaps worth flagging to the eng strand

1. **`pre_hb_g_dl` / `post_hb_g_dl` are in TS but not in `schema.sql`.** Either there's an un-tracked migration or these fields are write-only-from-the-app and never persist. Confirm before the Hb panels are built — could block the most clinically valuable trend view.
2. **`medication_reminders` table doesn't exist.** Adherence analytics are client-only; surfacing them on a clinician dashboard means persisting reminders first. Defer.
3. No denormalized `profiles.last_transfusion_at` / `last_past_appointment_at` — fine at MVP scale, but the overdue query does N+1 correlated subqueries per clinician load. Phase-2 trigger or materialized view.
4. Outcome-filtered queries currently scan-then-filter. A partial index on `symptom_logs(logged_at desc) where outcome <> 'normal'` is the cheapest scale-out lever.
