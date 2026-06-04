-- ============================================
-- Patients: SELECT verified clinicians at active hospitals
-- ============================================
-- Bug: PatientFindClinicianScreen would never list any clinicians.
-- The patient picks a hospital, the app runs
--   select user_id, full_name, hospital_id from clinician_profiles
--    where hospital_id = $1 and verified = true
-- and gets zero rows back, regardless of how many verified clinicians
-- are actually at that hospital.
--
-- Root cause was a chicken-and-egg in clinician_profiles' RLS. The
-- only patient-side SELECT policy ("Patients view linked clinicians",
-- added with the original link RLS work) requires an EXISTS row in
-- clinician_patient_links between this patient and this clinician.
-- But the whole point of the "Find a doctor" directory is to surface
-- clinicians the patient is NOT yet linked to so they can request a
-- link. At directory-time the link doesn't exist yet → RLS strips
-- every clinician out → directory looks empty.
--
-- This policy opens up SELECT for any authenticated user to see a
-- clinician_profiles row when the clinician is verified AND their
-- hospital is in the directory and active. That's exactly the
-- intended discoverability surface — no PII beyond the fields the
-- query already returns (user_id, full_name, hospital_id), no
-- unverified clinicians, no clinicians at retired hospitals.
--
-- Policies are OR'd within an operation, so the existing
-- "Patients view linked clinicians" stays — patients still see
-- their connected clinicians even if those clinicians get
-- unverified or move to an inactive hospital later.

create policy "Authenticated discover verified clinicians at active hospitals"
  on public.clinician_profiles
  for select to authenticated
  using (
    verified = true
    and hospital_id is not null
    and exists (
      select 1 from public.hospitals h
       where h.id = clinician_profiles.hospital_id
         and h.is_active = true
    )
  );
