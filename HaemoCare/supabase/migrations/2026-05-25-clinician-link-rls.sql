-- ============================================
-- Clinician-patient linking — write policies
-- ============================================
--
-- The clinician_patient_links table + is_active_clinician_for(uuid) shipped
-- in 2026-05-13_clinician_dashboard.sql with SELECT for both sides and an
-- UPDATE policy for patients. INSERT was never added (table was effectively
-- read-only for clinicians), and clinicians had no UPDATE policy to cancel
-- or revoke their own link rows. This migration fills both gaps.
--
-- Spec: docs/superpowers/specs/2026-05-25-clinician-patient-linking-design.md

-- Verified clinicians create link rows for themselves. Verification gate
-- mirrors the app-layer check in fetchClinicianProfile (unverified
-- clinicians never reach the Add Patient button) — repeated here as
-- defense in depth.
create policy "Clinicians insert links"
  on public.clinician_patient_links
  for insert
  with check (
    clinician_id = auth.uid()
    and exists (
      select 1 from public.clinician_profiles
      where user_id = auth.uid() and verified = true
    )
  );

-- Clinicians update their own link rows. Covers:
--   - cancelling a pending request (status: pending → revoked)
--   - re-requesting after a decline (status: declined/revoked → pending)
--   - revoking an active link from the clinician side (active → revoked)
-- Status transitions themselves are enforced by the table's status check
-- constraint plus the service layer.
create policy "Clinicians update own links"
  on public.clinician_patient_links
  for update
  using (clinician_id = auth.uid());
