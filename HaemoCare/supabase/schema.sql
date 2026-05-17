-- HaemoCare Database Schema
-- Run this in Supabase SQL Editor

create extension if not exists "uuid-ossp";

-- ============================================
-- PROFILES
-- ============================================
create table public.profiles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  patient_id text unique,
  full_name text not null default '',
  blood_type text default '' check (blood_type in ('A', 'B', 'AB', 'O', '')),
  rh_factor text default '' check (rh_factor in ('+', '-', '')),
  antibodies text[] default '{}',
  known_reactions text default '',
  medications text default '',
  language_preference text default 'th' check (language_preference in ('th', 'en')),
  pdpa_consented boolean default false,
  pdpa_consented_at timestamptz,
  share_full_name boolean default false,
  recommended_visit_interval_days integer not null default 28
    check (recommended_visit_interval_days between 7 and 180),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================
-- TRANSFUSIONS
-- ============================================
create table public.transfusions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date timestamptz not null,
  hospital text not null default '',
  units_received integer not null default 1,
  reaction_noted boolean default false,
  reaction_detail text default '',
  pre_hb_g_dl numeric(4,2),
  post_hb_g_dl numeric(4,2),
  notes text default '',
  created_at timestamptz default now()
);

-- ============================================
-- SYMPTOM LOGS
-- ============================================
create table public.symptom_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  transfusion_id uuid references public.transfusions(id) on delete set null,
  logged_at timestamptz default now(),
  symptoms jsonb not null default '[]',
  severity_scores jsonb not null default '{}',
  outcome text default 'normal' check (outcome in ('normal', 'monitor', 'urgent')),
  notes text default '',
  created_at timestamptz default now()
);

-- ============================================
-- APPOINTMENTS
-- ============================================
create table public.appointments (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  scheduled_date timestamptz not null,
  hospital text not null default '',
  notes text default '',
  linked_transfusion_id uuid references public.transfusions(id) on delete set null,
  -- Integration fields: where this appointment came from
  source text not null default 'manual',          -- 'manual' | 'ics_import' | 'fhir_th_core' | 'mor_prom' | 'hospital_api'
  external_id text,                               -- ICS UID or FHIR Appointment.id
  external_source_name text,                      -- human label, e.g. 'TH Core FHIR sandbox'
  created_at timestamptz default now()
);

-- Dedup guard for imported appointments: (user, source, external_id) uniqueness.
-- NULL external_id (manual entries) are not subject to this constraint.
create unique index idx_appointments_external
  on public.appointments(user_id, source, external_id)
  where external_id is not null;

-- ============================================
-- CLINICIAN DASHBOARD
-- ============================================

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

-- ============================================
-- EMERGENCY CONTACTS
-- ============================================

-- Per-patient emergency contacts (up to 3, priority-ordered).
-- See docs/superpowers/specs/2026-05-14-emergency-contact-design.md.

create table public.emergency_contacts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  phone text not null check (length(phone) >= 9),
  role_label text not null default '',
  priority integer not null default 1 check (priority between 1 and 3),
  created_at timestamptz default now(),
  constraint emergency_contacts_user_priority_unique
    unique (user_id, priority) deferrable initially deferred
);
create index idx_emergency_contacts_user
  on public.emergency_contacts(user_id, priority);

alter table public.emergency_contacts enable row level security;

create policy "Users manage own emergency contacts"
  on public.emergency_contacts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Clinicians read assigned emergency contacts"
  on public.emergency_contacts
  for select
  using (public.is_active_clinician_for(user_id));

create or replace function public.swap_emergency_contact_priorities(
  a_id uuid, b_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  a_user uuid; b_user uuid;
  a_prio integer; b_prio integer;
begin
  select user_id, priority into a_user, a_prio
    from emergency_contacts where id = a_id for update;
  select user_id, priority into b_user, b_prio
    from emergency_contacts where id = b_id for update;
  if a_user is null or b_user is null then
    raise exception 'contact not found';
  end if;
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if a_user is distinct from auth.uid() or b_user is distinct from auth.uid() then
    raise exception 'not authorized';
  end if;
  update emergency_contacts
    set priority = case
      when id = a_id then b_prio
      when id = b_id then a_prio
      else priority
    end
    where id in (a_id, b_id);
end;
$$;

revoke execute on function public.swap_emergency_contact_priorities(uuid, uuid) from anon;
grant execute on function public.swap_emergency_contact_priorities(uuid, uuid) to authenticated;

-- ============================================
-- MEDICATION REMINDERS + ADHERENCE
-- ============================================
-- See migrations/2026-05-17_medication_reminders.sql.

create table public.medication_reminders (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  medication_name text not null,
  dosage text not null default '',
  frequency text not null default 'daily'
    check (frequency in ('daily', 'twice_daily', 'three_times', 'weekly', 'as_needed')),
  reminder_times text[] not null default '{}',
  instructions text not null default '',
  is_active boolean not null default true,
  taken_today timestamptz[] not null default '{}',
  streak_days integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_medication_reminders_user
  on public.medication_reminders(user_id, is_active);

alter table public.medication_reminders enable row level security;

create policy "Users manage own medication reminders"
  on public.medication_reminders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Clinicians read assigned medication reminders"
  on public.medication_reminders
  for select
  using (public.is_active_clinician_for(user_id));

create trigger medication_reminders_updated_at
  before update on public.medication_reminders
  for each row execute function update_updated_at();

create table public.medication_adherence_events (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  reminder_id uuid references public.medication_reminders(id) on delete cascade not null,
  scheduled_at timestamptz not null,
  taken_at timestamptz,
  skipped_at timestamptz,
  source text not null default 'manual'
    check (source in ('tap', 'notification', 'manual')),
  created_at timestamptz default now()
);

create index idx_med_adherence_user_time
  on public.medication_adherence_events(user_id, scheduled_at desc);
create index idx_med_adherence_reminder
  on public.medication_adherence_events(reminder_id, scheduled_at desc);

alter table public.medication_adherence_events enable row level security;

create policy "Users manage own adherence events"
  on public.medication_adherence_events
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Clinicians read assigned adherence events"
  on public.medication_adherence_events
  for select
  using (public.is_active_clinician_for(user_id));

-- ============================================
-- INDEXES
-- ============================================
create index idx_transfusions_user_date on public.transfusions(user_id, date desc);
create index idx_symptom_logs_user on public.symptom_logs(user_id, logged_at desc);
create index idx_symptom_logs_transfusion on public.symptom_logs(transfusion_id);
create index idx_appointments_user_date on public.appointments(user_id, scheduled_date desc);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function update_updated_at();

-- ============================================
-- AUTO-GENERATE PATIENT ID
-- ============================================
create or replace function generate_patient_id()
returns trigger as $$
begin
  if new.patient_id is null then
    new.patient_id := 'HC-' || lpad(floor(random() * 999999 + 1)::text, 6, '0');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger profiles_generate_patient_id
  before insert on public.profiles
  for each row execute function generate_patient_id();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
alter table public.profiles enable row level security;
alter table public.transfusions enable row level security;
alter table public.symptom_logs enable row level security;
alter table public.appointments enable row level security;

-- Profiles
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = user_id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = user_id);
create policy "Users can delete own profile" on public.profiles for delete using (auth.uid() = user_id);

-- Transfusions
create policy "Users can view own transfusions" on public.transfusions for select using (auth.uid() = user_id);
create policy "Users can insert own transfusions" on public.transfusions for insert with check (auth.uid() = user_id);
create policy "Users can update own transfusions" on public.transfusions for update using (auth.uid() = user_id);
create policy "Users can delete own transfusions" on public.transfusions for delete using (auth.uid() = user_id);

-- Symptom logs
create policy "Users can view own symptom_logs" on public.symptom_logs for select using (auth.uid() = user_id);
create policy "Users can insert own symptom_logs" on public.symptom_logs for insert with check (auth.uid() = user_id);
create policy "Users can update own symptom_logs" on public.symptom_logs for update using (auth.uid() = user_id);
create policy "Users can delete own symptom_logs" on public.symptom_logs for delete using (auth.uid() = user_id);

-- Appointments
create policy "Users can view own appointments" on public.appointments for select using (auth.uid() = user_id);
create policy "Users can insert own appointments" on public.appointments for insert with check (auth.uid() = user_id);
create policy "Users can update own appointments" on public.appointments for update using (auth.uid() = user_id);
create policy "Users can delete own appointments" on public.appointments for delete using (auth.uid() = user_id);
