-- ============================================
-- Patients: UPDATE policy on clinician_patient_links
-- ============================================
-- Bug: when a clinician initiated a link request by HC code and the
-- patient tapped Accept in LinkRequestModal, the row stayed at
-- status='pending' and the patient never showed up on the clinician
-- dashboard (which filters status='active'). After-refresh patient
-- count: 0.
--
-- Root cause: the link table had only two write policies, both
-- clinician-side ("Clinicians insert links" and "Clinicians update
-- own links" from 2026-05-25-clinician-link-rls.sql). The patient-
-- initiated migration (2026-05-27-patient-initiated-links.sql) added
-- a "Patients request links" INSERT policy so patients can create
-- pending requests of their own, but never a corresponding UPDATE
-- policy. With RLS enabled the patient's UPDATE silently affected 0
-- rows on Accept, .single() then errored — but the link stayed
-- pending and the dashboard never saw the active link.
--
-- This policy lets a patient UPDATE rows where they are the
-- patient_user_id. Three real flows are unblocked at once:
--   * Accept    — pending (initiated_by='clinician') → active
--                 (patientService.acceptLinkRequest)
--   * Decline   — pending (initiated_by='clinician') → declined
--                 (patientService.declineLinkRequest)
--   * Revoke    — active → revoked
--                 (patientService.revokeClinicianLink)
--
-- Status transition rules themselves are enforced application-side
-- in the service layer (matches the existing comment in
-- 2026-05-25-clinician-link-rls.sql which leaves transitions to
-- the service layer rather than RLS).

create policy "Patients update own links"
  on public.clinician_patient_links
  for update to authenticated
  using (patient_user_id = auth.uid())
  with check (patient_user_id = auth.uid());
