-- ============================================
-- Extend patient-data realtime to profiles + medication_reminders
-- ============================================
-- 2026-06-09-patient-data-realtime broadcasted transfusions, symptom
-- logs, and appointments. Profile edits (name, blood type, antibodies,
-- visit interval, etc.) and medication adherence still required a
-- manual refresh on the clinician side.
--
-- The broadcast function broadcast_patient_data_change() handles any
-- table with a `user_id` column, so attaching two more after-triggers
-- to the same function closes the gap with no new SQL functions and
-- no new client subscriptions (PatientDetailPane subscribes on the
-- same 'patient:{user_id}' topic — see the client change in the same
-- PR).
--
-- Both target tables already have user_id columns referencing
-- auth.users(id), confirmed in:
--   * schema.sql (profiles)
--   * 2026-05-17_medication_reminders.sql (medication_reminders)
--
-- RLS authorization stays unchanged: the policy
-- "Patient + linked clinicians read patient broadcasts" already
-- covers any 'patient:%' topic. Both tables ride that policy.

create trigger profiles_broadcast
  after insert or update or delete on public.profiles
  for each row execute function public.broadcast_patient_data_change();

create trigger medication_reminders_broadcast
  after insert or update or delete on public.medication_reminders
  for each row execute function public.broadcast_patient_data_change();
