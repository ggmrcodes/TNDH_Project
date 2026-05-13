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

alter table public.clinician_profiles enable row level security;
alter table public.clinician_patient_links enable row level security;

create policy "Clinicians view own profile" on public.clinician_profiles
  for select using (auth.uid() = user_id);
create policy "Clinicians update own profile" on public.clinician_profiles
  for update using (auth.uid() = user_id);
create policy "Patients view linked clinicians" on public.clinician_profiles
  for select using (
    exists (select 1 from public.clinician_patient_links l
            where l.clinician_id = clinician_profiles.user_id
              and l.patient_user_id = auth.uid()
              and l.status in ('pending', 'active'))
  );

create policy "Both sides view own links" on public.clinician_patient_links
  for select using (auth.uid() = clinician_id or auth.uid() = patient_user_id);
create policy "Patient updates own link status" on public.clinician_patient_links
  for update using (auth.uid() = patient_user_id);

create policy "Clinicians read assigned profiles" on public.profiles
  for select using (public.is_active_clinician_for(user_id));
create policy "Clinicians read assigned transfusions" on public.transfusions
  for select using (public.is_active_clinician_for(user_id));
create policy "Clinicians read assigned symptom_logs" on public.symptom_logs
  for select using (public.is_active_clinician_for(user_id));
create policy "Clinicians read assigned appointments" on public.appointments
  for select using (public.is_active_clinician_for(user_id));
