# Doctor Dashboard — Design Synthesis

**Status:** Approved design synthesis (2026-05-13). Implementation plan at `docs/superpowers/plans/2026-05-13-doctor-dashboard-mvp.md`.
**Strands:** `01-product-and-workflows.md`, `02-data-inventory.md`, `03-wireframes.md`, `04-auth-and-permissions.md`.

## Problem

HaemoCare's existing tables (`profiles`, `transfusions`, `symptom_logs`, `appointments`) and the recently-shipped overdue-visit feature give us a rich patient-side dataset. Thai thalassemia clinicians are flying blind across that data. They use HOSxP / hospital EMRs for chart-of-record, but have no view of what *patients are reporting* between visits. The dashboard fills that gap.

## Two personas

1. **Clinic-day hematologist (PRIMARY)** — half-day thalassemia clinics, 20–40 patients per block, 3–7 min per patient. Wants: "any signal I'd miss by reading only the EMR?"
2. **Pediatric thalassemia nurse / case manager (SECONDARY)** — runs morning huddle, scans whole panel in 5–10 min, flags the 3–5 patients to call. Heaviest user of the overdue list.

## Top workflows (priority order)

1. **Morning triage** (nurse, daily, 5–10 min): see panel sorted by triage signal, find the patients to call.
2. **Clinic-day deep-dive** (doctor, per patient, 2–3 min): tap a patient → one screen with passport + last transfusion + symptom history + overdue state.
3. **Weekly cadence check** (either persona): filter to "overdue >21 days" or "urgent log in last 14 days", optionally export.

## Layout — chosen wireframe: Split View

(Wireframes strand recommended this; product strand corroborated via workflow #2.)

```
+--------------------------------------------------------------+
| HaemoCare Clinician   Dr. Ploy   Hospital   TH/EN   [avatar] | 56px header
+------------------+-------------------------------------------+
|   Left rail      |  Right pane (master-detail)               |
|   ~320px         |  ~1000px                                  |
|                  |                                           |
| [search]         |  PATIENT HERO                             |
| Cohort stats     |  Name · age · diagnosis · overdue badge   |
|   Overdue 9      |  +-------------------------+--------------+|
|   Monitor 14     |  | Hb trend (90d)         | Symptom log  ||
|   Stable 88      |  | (pre/post per tx)      | last 5       ||
|                  |  +-------------------------+--------------+|
| [Filter chips]   |  | Transfusions (last 6)  | Appointments ||
|                  |  +-------------------------+--------------+|
| Queue rows:      |                                            |
| ! 28d Somchai >  |  (default: top-overdue patient selected)   |
| ! 19d Niran      |                                            |
| ~ 5d  Phichit    |                                            |
| · stable  88 >   |                                            |
+------------------+-------------------------------------------+
```

Selection: clicking a queue row hydrates the right pane. The default selection on dashboard load is the top-overdue patient.

## Panels (MVP only)

| Panel | What it shows | Data |
|---|---|---|
| **P1. Triage queue (left rail)** | One row per assigned patient. Sort: urgent-symptom-last-14d → overdue-tier-2 → overdue-tier-1 → monitor-symptom → stable. | Reuse `computeOverdueState` per patient (client). Worst `symptom_logs.outcome` in last 14d. Days since last `transfusions.date`. |
| **P2. Patient detail (right pane)** | Re-use of `PreVisitSummaryScreen` factored as a `userId`-parameterised component. Adds a passport header (`profiles.{blood_type, rh_factor, antibodies, known_reactions}`) and an `OverdueBadge`. | `analytics/hbDecay.ts`, `analytics/symptomTemporal.ts`, `analytics/triage.ts`, transfusions/symptom/appointment service calls. |
| **P3. Filter chips** | "Overdue" / "Urgent in last 14d" / "Has reactions on file". Single-select, tap-to-clear. | Applied client-side to the queue. |
| **P4. Reaction flag** | Tiny icon on queue rows where latest transfusion has `reaction_noted = true`. Full `reaction_detail` shown in P2. | `transfusions.reaction_noted`, `reaction_detail`. |

**Deliberately deferred (phase-2):** Population overdue rate over time. Symptom-pattern heatmap. CSV export. Clinician notes UI. Multi-clinician panels with org RBAC. Adherence rollup (depends on persisting `medication_reminders`).

## Schema additions

Two new tables in MVP. (Auth strand proposed four; the audit infra and consent-events table are deferred — see "Cut scope" below.)

```sql
-- Clinician role storage.
create table public.clinician_profiles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  full_name text not null default '',
  license_number text not null default '',
  hospital_affiliation text not null default '',
  verified boolean default false,
  verified_at timestamptz,
  created_at timestamptz default now()
);

-- Clinician ↔ patient consented link.
create table public.clinician_patient_links (
  id uuid default uuid_generate_v4() primary key,
  clinician_id uuid references auth.users(id) on delete cascade not null,
  patient_user_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'declined', 'revoked', 'expired')),
  requested_at timestamptz default now(),
  consented_at timestamptz,
  revoked_at timestamptz,
  share_full_name boolean default false,
  unique (clinician_id, patient_user_id)
);
create index idx_cpl_clinician_active
  on public.clinician_patient_links(clinician_id) where status = 'active';
create index idx_cpl_patient
  on public.clinician_patient_links(patient_user_id);

-- Helper used by RLS policies.
create or replace function public.is_active_clinician_for(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.clinician_patient_links
    where clinician_id = auth.uid()
      and patient_user_id = p_user_id
      and status = 'active'
  );
$$;
```

**Plus a schema fix** that the data strand caught: `transfusions.pre_hb_g_dl` and `post_hb_g_dl` are present in the TypeScript `Transfusion` type but absent from `schema.sql`. Add them to schema + migration. The Hb trend in P2 depends on them.

## RLS

Read-through on patient tables for active-linked clinicians. Clinicians stay **read-only on patient data in v1** — no insert/update/delete policies.

```sql
create policy "Clinicians read assigned profiles" on public.profiles
  for select using (public.is_active_clinician_for(user_id));
create policy "Clinicians read assigned transfusions" on public.transfusions
  for select using (public.is_active_clinician_for(user_id));
create policy "Clinicians read assigned symptom_logs" on public.symptom_logs
  for select using (public.is_active_clinician_for(user_id));
create policy "Clinicians read assigned appointments" on public.appointments
  for select using (public.is_active_clinician_for(user_id));
```

Existing patient `auth.uid() = user_id` policies stay intact alongside.

## Role + sign-in

`AuthContext` extends to expose `role: 'patient' | 'clinician' | null`:
- `patient` if a `profiles` row exists for `auth.uid()`
- `clinician` if a `clinician_profiles` row exists
- `null` while loading

Root navigator picks `ClinicianStack` (new) or existing `MainTabNavigator` based on `role`.

**Mock-mode for clinician** mirrors the existing patient pattern. New constants in `AuthContext`:
```ts
const MOCK_CLINICIAN_EMAIL = 'demo-doctor@haemocare.app';
const MOCK_CLINICIAN_PASSWORD = 'HaemoDoc2024';
```
On those credentials, AuthContext flips `isMockMode = true`, sets `role = 'clinician'`, hydrates `MOCK_CLINICIAN_PROFILE`, and exposes a `MOCK_LINKED_PATIENTS` roster (5 patients with varied risk: one tier-2 overdue, one tier-1 overdue with recent urgent log, one with reaction on file, one stable, one with upcoming appointment).

## Cut scope (NOT in MVP)

The auth strand proposed a full consent + audit-trail infra. Cutting the following for MVP autonomous implementation; revisit on user return:

- **Real clinician sign-up + license verification flow.** Needs human-in-loop on every onboard. Mock-mode only for now; the sign-up screen says "Coming soon — contact admin to provision."
- **Real patient consent flow with push notifications.** Mock-mode auto-creates active links between the demo clinician and the demo patient roster; real-DB consent UX defers.
- **`consent_events` + `clinician_access_log` tables.** PDPA audit infra. Phase-2.
- **"Connected clinicians" patient settings screen + revoke flow.** Phase-2 with consent.
- **Clinician notes + reviews tables.** Product strand listed as "nice-to-have." Defer.

Each of these is well-specified in the strand docs and can ship next.

## Open questions for user return

1. **Manual license verification SLA + owner.** Whoever runs HaemoCare ops needs to verify Thai Medical Council licenses before unlocking clinicians. Until decided, real clinician sign-up is closed.
2. **Consent text wording.** PDPA-compliant clinician-access consent needs Thai legal review. Currently no copy exists; phase-2 work blocks on this.
3. **Distribution / URL.** Same app entry as patients (with role-routing) or a separate `clinician.haemocare.app`? MVP uses same app entry; revisit before public launch.

## Reuse from the existing app

- `useOverdueState` — used per-patient client-side.
- `PreVisitSummaryScreen` — refactored to take a `userId` prop; used as the right-pane detail.
- `OverdueBanner` — reused in patient detail when overdue.
- `analytics/{hbDecay,symptomTemporal,triage}.ts` — load-bearing for the detail view.
- `i18n/{en,th}.ts` — extend with clinician-side strings.
- Theme tokens — same `statusNormal/Monitor/Urgent` colors.

## Testing

- Unit: `computeOverdueState` already covered. Add unit tests for any new sorting/scoring helper for the queue.
- Smoke: `ClinicianDashboardScreen` renders in mock mode without errors.
- Manual verification via `demo-doctor@haemocare.app` mock-mode after final commit.
