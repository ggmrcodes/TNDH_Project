-- Pre-transfusion blood + iron labs.
-- See docs/superpowers/specs/2026-05-17-pre-transfusion-labs-brief.md
--
-- Design choices documented in the brief implementer notes:
--
--  * `pre_labs` is stored as a JSONB column on the existing `transfusions`
--    table rather than a separate 1:1 child table. The brief leaves this to
--    the implementer; the existing schema favours JSONB for optional
--    sub-objects (see `symptom_logs.symptoms`, `symptom_logs.severity_scores`),
--    and a 1:1 child table would only add a join + duplicate RLS without
--    enabling any query pattern we need.
--
--  * `transfusion_lab_audit_log` is a separate, append-only table that
--    captures every patient/clinician edit. RLS mirrors the parent
--    transfusion's visibility: a patient sees their own audit rows; an
--    active clinician sees rows for their assigned patients.
--
--  * `transfusion-lab-slips` is a private Storage bucket. Path layout is
--    `<patient_user_id>/<transfusion_id>/<filename>` so a single per-bucket
--    RLS policy can authorise by parsing the first path segment.

-- ============================================
-- pre_labs JSONB on transfusions
-- ============================================

alter table public.transfusions
  add column if not exists pre_labs jsonb;

-- Soft sanity check: when `pre_labs` is present it must be a JSON object
-- (not array / primitive). Field-level validation (Hb 0.1–25, Hct 1–75,
-- Ferritin 0–10000, photo URL shape) is enforced client-side before save
-- and re-checked by the application layer; we keep the DB constraint loose
-- so future fields (e.g. `source: 'health_link'`) don't require a migration.
alter table public.transfusions
  add constraint transfusions_pre_labs_is_object
    check (pre_labs is null or jsonb_typeof(pre_labs) = 'object')
    not valid;

-- Validate the check for new + existing rows. (No existing rows have a
-- non-null `pre_labs` at this migration's commit time, so this is a no-op
-- in practice but makes intent explicit.)
alter table public.transfusions validate constraint transfusions_pre_labs_is_object;

-- ============================================
-- transfusion_lab_audit_log
-- ============================================
--
-- Append-only history of every change to `transfusions.pre_labs`. Required
-- by the brief so a clinician edit overwriting a patient-entered value
-- never loses the original.

create table if not exists public.transfusion_lab_audit_log (
  id uuid default uuid_generate_v4() primary key,
  transfusion_id uuid not null references public.transfusions(id) on delete cascade,
  previous_value jsonb,        -- nullable: first write has no prior value
  new_value jsonb,             -- nullable: explicit "cleared by clinician" writes a null
  changed_by_user_id uuid not null references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_transfusion_lab_audit_transfusion
  on public.transfusion_lab_audit_log(transfusion_id, changed_at desc);
create index if not exists idx_transfusion_lab_audit_changed_by
  on public.transfusion_lab_audit_log(changed_by_user_id);

alter table public.transfusion_lab_audit_log enable row level security;

-- A row is visible if the actor can see the parent transfusion.
-- Mirrors existing per-table policies: patient on own; clinician on assigned.
create policy "Patients view own lab audit" on public.transfusion_lab_audit_log
  for select using (
    exists (
      select 1 from public.transfusions t
      where t.id = transfusion_lab_audit_log.transfusion_id
        and t.user_id = auth.uid()
    )
  );

create policy "Clinicians view assigned lab audit" on public.transfusion_lab_audit_log
  for select using (
    exists (
      select 1 from public.transfusions t
      where t.id = transfusion_lab_audit_log.transfusion_id
        and public.is_active_clinician_for(t.user_id)
    )
  );

-- Both patients and assigned clinicians may insert audit rows for a given
-- transfusion. The application writes one audit row per edit (with the
-- prior value snapshot) immediately before / after updating
-- `transfusions.pre_labs`. We enforce `changed_by_user_id = auth.uid()`
-- to prevent attribution forgery.
create policy "Authorized users insert lab audit" on public.transfusion_lab_audit_log
  for insert with check (
    changed_by_user_id = auth.uid()
    and exists (
      select 1 from public.transfusions t
      where t.id = transfusion_lab_audit_log.transfusion_id
        and (t.user_id = auth.uid() or public.is_active_clinician_for(t.user_id))
    )
  );

-- No update / delete policies: audit log is append-only.

-- ============================================
-- Storage bucket: transfusion-lab-slips
-- ============================================
--
-- Private bucket. Path layout: `<patient_user_id>/<transfusion_id>/<file>`.
-- Storage RLS reads the first path segment to determine the owning patient,
-- then applies the same access rule as the parent transfusion.

insert into storage.buckets (id, name, public)
  values ('transfusion-lab-slips', 'transfusion-lab-slips', false)
  on conflict (id) do nothing;

-- Patients can read / write objects under their own user_id prefix.
create policy "Patients manage own lab slips"
  on storage.objects for all
  using (
    bucket_id = 'transfusion-lab-slips'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'transfusion-lab-slips'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Active clinicians can read lab slips for assigned patients only.
create policy "Clinicians read assigned lab slips"
  on storage.objects for select
  using (
    bucket_id = 'transfusion-lab-slips'
    and public.is_active_clinician_for(
      ((storage.foldername(name))[1])::uuid
    )
  );
