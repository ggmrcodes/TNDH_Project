-- ============================================
-- Patient-initiated clinician links
-- ============================================
--
-- Spec: docs/superpowers/specs/2026-05-25-profile-additions-design.md
-- Phase: 3

alter table public.clinician_patient_links
  add column initiated_by text not null default 'clinician'
    check (initiated_by in ('clinician', 'patient'));

create index idx_cpl_pending_by_clinician_for_patient_inbox
  on public.clinician_patient_links (clinician_id)
  where status = 'pending' and initiated_by = 'patient';

-- New INSERT policy: patients can self-request a link to a verified clinician.
create policy "Patients request links" on public.clinician_patient_links
  for insert
  with check (
    patient_user_id = auth.uid()
    and status = 'pending'
    and initiated_by = 'patient'
    and exists (
      select 1 from public.clinician_profiles
      where user_id = clinician_id and verified = true
    )
  );
