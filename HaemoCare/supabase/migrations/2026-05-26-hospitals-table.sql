-- ============================================
-- Hospitals directory + clinician affiliation FK
-- ============================================
--
-- Spec: docs/superpowers/specs/2026-05-25-profile-additions-design.md
-- Phase: 2

create table public.hospitals (
  id uuid default uuid_generate_v4() primary key,
  name_th text not null,
  name_en text not null,
  code text unique,
  region text check (region in ('north', 'northeast', 'central', 'south', 'east', 'west')),
  is_active boolean default true,
  created_at timestamptz default now()
);

create index idx_hospitals_active_region on public.hospitals (region) where is_active = true;
create index idx_hospitals_name_th on public.hospitals (name_th);

alter table public.hospitals enable row level security;

create policy "Authenticated reads active hospitals" on public.hospitals
  for select using (is_active = true);

-- Seed: placeholder set. Expand later via INSERT.
insert into public.hospitals (name_th, name_en, code, region) values
  ('โรงพยาบาลสงขลานครินทร์', 'Songklanagarind Hospital', 'songklanagarind', 'south'),
  ('โรงพยาบาลศิริราช', 'Siriraj Hospital', 'siriraj', 'central'),
  ('โรงพยาบาลรามาธิบดี', 'Ramathibodi Hospital', 'ramathibodi', 'central');

-- Link clinician_profiles to the directory. Nullable so legacy free-text
-- rows are unaffected; new signups populate hospital_id from the picker.
alter table public.clinician_profiles
  add column hospital_id uuid references public.hospitals(id);

create index idx_clinician_profiles_hospital on public.clinician_profiles (hospital_id) where hospital_id is not null;
