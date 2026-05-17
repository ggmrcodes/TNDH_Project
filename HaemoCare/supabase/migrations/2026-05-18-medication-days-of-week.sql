-- Adds `days_of_week` to medication_reminders so patients can specify
-- which days a medication is taken (e.g. weekly meds, MWF iron-chelation
-- regimens, weekend-only). NULL or empty array = every day (legacy
-- behavior, no migration needed for existing rows).
--
-- Day codes use ISO weekday abbreviations: mon, tue, wed, thu, fri, sat, sun.
-- Enforced at the DB level via a CHECK constraint.

alter table public.medication_reminders
  add column if not exists days_of_week text[];

-- Validate every element of the array is a known weekday code. Allows NULL
-- (= every day) and an empty array (also = every day; client may write
-- either). Element-wise validation uses an ALL subquery pattern.
alter table public.medication_reminders
  drop constraint if exists medication_reminders_days_of_week_check;

alter table public.medication_reminders
  add constraint medication_reminders_days_of_week_check
  check (
    days_of_week is null
    or array_length(days_of_week, 1) is null
    or days_of_week <@ array['mon','tue','wed','thu','fri','sat','sun']
  );
