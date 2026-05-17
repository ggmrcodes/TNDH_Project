-- Medication reminders + adherence events
-- Brief: docs/superpowers/specs/2026-05-17-medication-reminders-wire-up-brief.md
-- Owner-scoped via RLS; clinicians get read-only access via
-- is_active_clinician_for() helper defined in schema.sql.

-- ============================================
-- MEDICATION REMINDERS
-- ============================================
-- Mirrors the MedicationReminder TS interface 1:1. taken_today / streak_days
-- stay in this table for backward-compat with the existing UI: the screen
-- reads them today, and we keep populating them so the UI behaves identically
-- in both mock and real mode. Authoritative adherence history lives in
-- medication_adherence_events.

create table public.medication_reminders (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  medication_name text not null,
  dosage text not null default '',
  frequency text not null default 'daily'
    check (frequency in ('daily', 'twice_daily', 'three_times', 'weekly', 'as_needed')),
  -- ["08:00", "20:00"] etc. Times are local wall-clock in Asia/Bangkok.
  reminder_times text[] not null default '{}',
  instructions text not null default '',
  is_active boolean not null default true,
  -- Timestamps of doses confirmed taken today (rolled over on day boundary by
  -- the service layer). Maintained for UI parity with the mock service.
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

-- ============================================
-- MEDICATION ADHERENCE EVENTS
-- ============================================
-- One row per dose action. scheduled_at is the planned dose time (today's
-- date + reminder HH:MM converted to UTC). Exactly one of (taken_at,
-- skipped_at) should be set per event in v1, but we don't enforce it as a
-- constraint because future iterations may add a "missed" auto-event.

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
