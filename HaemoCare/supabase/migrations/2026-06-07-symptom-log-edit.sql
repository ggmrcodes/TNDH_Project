-- Lets patients backdate and edit their own symptom logs. Adds an `edited_at`
-- marker (null = never edited) so edits stay transparent to the patient's
-- linked clinician.
--
-- No new RLS policies are needed: symptom_logs already has patient
-- update-own and delete-own policies ("Users can update/delete own
-- symptom_logs" in supabase/schema.sql). Postgres uses an UPDATE policy's
-- USING expression as its implicit WITH CHECK when none is given, so a patient
-- already cannot reassign a log's user_id.

alter table public.symptom_logs
  add column if not exists edited_at timestamptz;
