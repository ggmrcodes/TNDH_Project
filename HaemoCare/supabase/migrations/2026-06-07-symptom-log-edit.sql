-- Lets patients backdate, edit, and delete their own symptom logs.
-- Adds an `edited_at` marker (null = never edited) so edits stay
-- transparent to the patient's linked clinician, plus UPDATE/DELETE RLS
-- policies for the owning patient. The patient insert/select-own and
-- clinician-read SELECT policies already exist from earlier migrations
-- (2026-05-13_clinician_dashboard.sql) and are not recreated here.

alter table public.symptom_logs
  add column if not exists edited_at timestamptz;

create policy "Patients update own symptom logs" on public.symptom_logs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Patients delete own symptom logs" on public.symptom_logs
  for delete using (auth.uid() = user_id);
