-- Adds per-patient transfusion cadence used by the overdue-visit feature.
-- Run once against any existing Supabase project.

alter table public.profiles
  add column recommended_visit_interval_days integer not null default 28
  check (recommended_visit_interval_days between 7 and 180);
