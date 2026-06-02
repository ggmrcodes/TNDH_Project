-- ============================================
-- Hospitals: admin write access + admin read-all
-- ============================================
-- The hospitals directory is currently:
--   * SELECT — gated on is_active = true via the existing
--     "Authenticated reads active hospitals" policy, so the
--     HospitalPicker stays clean for end users.
--   * INSERT via the SECURITY DEFINER find_or_create_hospital RPC,
--     which lets any authenticated user add a free-text entry when
--     they pick "Other" in the picker. Useful as a fallback but the
--     directory accumulates typos / duplicates / inconsistent
--     capitalization, with no curation surface.
--
-- This migration adds admin-only write policies so the AdminScreen can
-- curate the list directly (add canonical entries, fix typos, retire
-- bad entries). Deletion is intentionally NOT granted — profiles.
-- hospital_id and clinician_profiles.hospital_id FK against this table
-- and we don't want to break those links. To retire a hospital, admins
-- set is_active = false; existing links survive but the hospital no
-- longer appears in the picker for new users.

create policy "Admin inserts hospitals" on public.hospitals
  for insert to authenticated
  with check (public.is_admin());

create policy "Admin updates hospitals" on public.hospitals
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Admins also need to SEE inactive rows in the management list so they
-- can reactivate or fix retired entries. The existing "Authenticated
-- reads active hospitals" policy stays in place (RLS SELECT policies
-- are OR'd, so non-admins keep their active-only view).
create policy "Admin reads all hospitals" on public.hospitals
  for select to authenticated
  using (public.is_admin());
