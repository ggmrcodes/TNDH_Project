# Doctor's Dashboard — Auth & Permissions (Strand 04)

This strand answers how a clinician can read assigned patients' data in HaemoCare without seeing the rest of the patient population, while keeping every patient in clear, revocable control of their own consent. Schema style, RLS style, and mock-mode style match `HaemoCare/supabase/schema.sql` and `src/contexts/AuthContext.tsx`.

---

## 1. Role model

**Decision: a single new role, `clinician`.** No nurses, no admins, no org-level RBAC for v1.

Storage is a single new table `clinician_profiles` keyed on `auth.users.id`. A user is a clinician iff a row in `clinician_profiles` exists for their `user_id`; a user is a patient iff a row in `profiles` exists. The two are mutually exclusive in v1 (UI enforced; not a DB constraint, because we may want a clinician to also be a patient later — punt).

We avoid a `role` enum column on `profiles` because it (a) is easy to forge from the client during update if RLS ever drifts and (b) couples patient and clinician identity in one table. A dedicated `clinician_profiles` table keeps the blast radius small: every `SELECT … WHERE clinician_id = auth.uid()` check is anchored to a table the patient app never touches.

Nurses, hospital admins, and multi-clinician orgs are deferred. When that day comes, we add `clinician_orgs` and `clinician_org_members`; nothing in v1 prevents that growth.

---

## 2. Patient ↔ clinician assignment

**Decision: clinician-initiated invite by patient's `HC-XXXXXX` patient_id, confirmed by the patient in-app.** This mirrors how patients already identify themselves (the `patient_id` already exists in `profiles`) and avoids exposing a clinician-side opaque token that could be screenshot-shared.

Flow:

1. Clinician on the dashboard taps **"Invite patient"**, enters `HC-482910`.
2. Backend (via a `request_patient_access` Postgres function, `security definer`) inserts a row into `clinician_patient_links` with `status = 'pending'`, `requested_at = now()`, `clinician_id = auth.uid()`, `patient_user_id = (lookup by patient_id)`. The patient_id is NOT exposed back to the clinician beyond confirming it resolved — no patient name, no preview, until consent lands.
3. Patient receives a push + in-app notification: *"Dr. Somchai Wong (Siriraj Hospital) is requesting access to your HaemoCare records. Review request →"*. The clinician name/affiliation comes from `clinician_profiles`, which is verified at sign-up (§5).
4. Patient sees a consent screen (§3) and taps **Approve** or **Decline**. Approve flips `status` to `'active'`, stamps `consented_at`, and writes a snapshot of the consent text version into the link row. Decline flips to `'declined'`.
5. Pending requests auto-expire after 14 days (cron / scheduled function).

Why not the patient-enters-clinician-code variant: it forces patients to type opaque strings, which is bad UX for older Thai patients, and it lets clinicians casually print codes on business cards — turning the pairing into an out-of-band trust gesture rather than a deliberate consent moment. The HC-ID flow keeps consent inside the app.

Why not org-level: no org table yet.

---

## 3. Consent (PDPA second surface)

`profiles.pdpa_consented` covers consent to *use the app*. Clinician access is a separate, narrower consent surface and must be obtained **per clinician**, not per-org or globally. PDPA requires the data subject be told: who, what data, what purpose, how long, and how to revoke.

The consent screen names: clinician full name, medical license number (Thai สภาวิชาชีพ number, captured at clinician sign-up), affiliated hospital, and the exact data categories they'll see (profile basics, transfusion history, symptom logs, appointments). A toggle lets the patient choose **Share full name** vs **Share patient_id only** (mirrors the existing `share_full_name` boolean on `profiles`). Default off (patient_id only).

Consent is **revocable at any time** from a "Connected clinicians" screen in patient settings. Revoke flips `clinician_patient_links.status` to `'revoked'` and stamps `revoked_at`. RLS (§4) checks `status = 'active'` so revoke is immediate — no zombie reads.

Every consent transition (request, approve, decline, revoke, auto-expire) writes a row to `consent_events` so the patient and any auditor can see a full timeline.

---

## 4. RLS policy sketch

New tables and policies, in the same style as `schema.sql`:

```sql
-- ============================================
-- CLINICIAN PROFILES
-- ============================================
create table public.clinician_profiles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  full_name text not null default '',
  license_number text not null,                -- Thai medical license, verified at signup
  hospital_affiliation text not null default '',
  verified boolean default false,              -- flipped true by admin after license check
  verified_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================
-- CLINICIAN ↔ PATIENT LINKS (consent)
-- ============================================
create table public.clinician_patient_links (
  id uuid default uuid_generate_v4() primary key,
  clinician_id uuid references auth.users(id) on delete cascade not null,
  patient_user_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'declined', 'revoked', 'expired')),
  requested_at timestamptz default now(),
  consented_at timestamptz,
  revoked_at timestamptz,
  consent_text_version text,                   -- e.g. 'pdpa-clin-2026-05'
  share_full_name boolean default false,       -- patient's per-link choice
  unique (clinician_id, patient_user_id)
);
create index idx_cpl_clinician_active
  on public.clinician_patient_links(clinician_id) where status = 'active';
create index idx_cpl_patient
  on public.clinician_patient_links(patient_user_id);

-- ============================================
-- HELPER: is auth.uid() an active clinician for this patient?
-- ============================================
create or replace function public.is_active_clinician_for(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clinician_patient_links
    where clinician_id = auth.uid()
      and patient_user_id = p_user_id
      and status = 'active'
  );
$$;

alter table public.clinician_profiles enable row level security;
alter table public.clinician_patient_links enable row level security;

-- Clinician profiles: clinician sees own row; patient sees rows of clinicians linked to them
create policy "Clinicians view own profile" on public.clinician_profiles
  for select using (auth.uid() = user_id);
create policy "Patients view linked clinicians" on public.clinician_profiles
  for select using (
    exists (select 1 from public.clinician_patient_links l
            where l.clinician_id = clinician_profiles.user_id
              and l.patient_user_id = auth.uid()
              and l.status in ('pending', 'active'))
  );

-- Links: both sides can see their own rows; patient is the only one who can flip to active/revoked
create policy "Both sides view own links" on public.clinician_patient_links
  for select using (auth.uid() = clinician_id or auth.uid() = patient_user_id);
create policy "Patient updates own link status" on public.clinician_patient_links
  for update using (auth.uid() = patient_user_id);
-- Insert is via security-definer RPC `request_patient_access`; no direct insert policy.

-- ============================================
-- CLINICIAN READ POLICIES on patient tables
-- ============================================
create policy "Clinicians read assigned profiles" on public.profiles
  for select using (public.is_active_clinician_for(user_id));
create policy "Clinicians read assigned transfusions" on public.transfusions
  for select using (public.is_active_clinician_for(user_id));
create policy "Clinicians read assigned symptom_logs" on public.symptom_logs
  for select using (public.is_active_clinician_for(user_id));
create policy "Clinicians read assigned appointments" on public.appointments
  for select using (public.is_active_clinician_for(user_id));
```

Notes: clinicians are **read-only on patient data in v1** — no `update`/`insert`/`delete` policies. Adding a doctor's note later means a separate `clinician_notes` table (out of scope here). The `is_active_clinician_for` function is `stable`, so Postgres can cache it within a query; `security definer` lets it read the link table even when the clinician hasn't been granted direct select on it (they have, but defensive).

---

## 5. Clinician sign-up

**Decision: self-service sign-up + manual admin verification before access is unlocked.**

1. Clinician signs up via Supabase email/password at `clinician.haemocare.app` (or a `?role=clinician` flag on the existing sign-in screen) and fills full name, license number, hospital.
2. A row lands in `clinician_profiles` with `verified = false`. RLS prevents them from inviting patients until `verified = true` (enforced inside the `request_patient_access` RPC: it checks `clinician_profiles.verified` for `auth.uid()` and raises if false).
3. A HaemoCare ops person checks the license number against the Thai Medical Council registry (https://www.tmc.or.th/) and flips `verified = true` via the Supabase dashboard. This is a manual step — fine for MVP scale (tens of clinicians).
4. Email notifies the clinician they're approved.

Tradeoff: manual verification doesn't scale past a few hundred clinicians. The Thai Medical Council does not currently offer a public API; a future strand can wire in a scraping/lookup helper or partner with a hospital IT department for SSO. Self-service-only (no verification) is unacceptable — it lets anyone claim to be a doctor and spam patients with access requests.

---

## 6. Audit trail

Two log tables. Both are append-only (no update/delete policy).

```sql
-- Consent lifecycle events: who did what to a link, when, why
create table public.consent_events (
  id uuid default uuid_generate_v4() primary key,
  link_id uuid references public.clinician_patient_links(id) on delete cascade not null,
  patient_user_id uuid not null,
  clinician_id uuid not null,
  event_type text not null
    check (event_type in ('requested', 'approved', 'declined', 'revoked', 'expired')),
  actor_user_id uuid not null,                 -- who triggered it
  consent_text_version text,
  occurred_at timestamptz default now()
);

-- Access log: clinician-patient-day granularity
create table public.clinician_access_log (
  id uuid default uuid_generate_v4() primary key,
  clinician_id uuid references auth.users(id) on delete cascade not null,
  patient_user_id uuid references auth.users(id) on delete cascade not null,
  access_date date not null default current_date,
  first_access_at timestamptz default now(),
  last_access_at timestamptz default now(),
  access_count integer not null default 1,
  unique (clinician_id, patient_user_id, access_date)
);
```

The patient app surfaces `clinician_access_log` and `consent_events` to the patient in a "Who has seen my data?" screen — one row per clinician-day with a count. Writes happen via an upsert RPC called by the dashboard on each patient-detail open: cheap, doesn't bloat the table to one-row-per-query, and still gives auditors enough to spot anomalies ("Dr. X opened 40 patients today, that's odd"). Both tables get RLS: clinician sees own rows; patient sees rows where they're the subject; no one updates.

---

## 7. Demo / mock mode

Mirror the existing pattern from `AuthContext.tsx`. Add a clinician-side constant pair:

```ts
const MOCK_CLINICIAN_EMAIL = 'demo-doctor@haemocare.app';
const MOCK_CLINICIAN_PASSWORD = 'HaemoDoc2024';
```

When `signIn` sees these credentials, `AuthContext` flips into mock-mode with `role = 'clinician'`, hydrates a `MOCK_CLINICIAN_PROFILE` (verified, Siriraj-affiliated, license `12345-Demo`), and exposes a `MOCK_LINKED_PATIENTS` array — 3-5 patients with varied risk profiles (one overdue, one with recent transfusion reaction, one healthy, etc.), each with their own transfusion/symptom/appointment data shaped exactly like the patient mock data already in `src/mock/data.ts`.

The mock-mode services layer (`src/mock/services.ts` analogue, e.g. `src/mock/clinicianServices.ts`) returns these patients from a `getAssignedPatients()` call without ever hitting Supabase. This lets us demo the doctor's dashboard to stakeholders offline and lets engineers iterate on UX without seeding a real database. Mock-mode is read-only and never writes to the audit log — guarded by the same `isMockMode` flag the patient context already uses.

For QA against a real DB, we also seed a dev-only Supabase row: a real verified clinician account with the same email but a different password, linked via real `clinician_patient_links` rows to a small set of seeded patient accounts.

---

## Summary of new tables

`clinician_profiles`, `clinician_patient_links`, `consent_events`, `clinician_access_log`. Plus one helper function `is_active_clinician_for(uuid)` and one security-definer RPC `request_patient_access(patient_id text)`.
