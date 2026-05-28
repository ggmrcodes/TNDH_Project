-- ============================================
-- Patient profile: primary hospital
-- ============================================
-- Patients can now record which hospital they regularly transfuse at.
-- This is a profile-level attribute (distinct from the per-transfusion
-- `transfusions.hospital` text and from the clinician-link workflow),
-- so it appears in Edit Profile and at signup, and is used to prefill
-- the hospital field on new transfusion records.
--
-- Nullable: patients without a known hospital, and all pre-existing
-- rows, keep the value as NULL — no behavioral change for existing
-- accounts until they pick one.
--
-- On hospital delete: set null. The patient row stays intact even if
-- a directory hospital is later removed.

alter table public.profiles
  add column if not exists hospital_id uuid
    references public.hospitals(id) on delete set null;

create index if not exists idx_profiles_hospital
  on public.profiles (hospital_id)
  where hospital_id is not null;
