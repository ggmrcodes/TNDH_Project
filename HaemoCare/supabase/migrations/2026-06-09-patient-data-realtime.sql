-- ============================================
-- Patient-data realtime broadcasts
-- ============================================
-- The 2026-06-06-link-realtime migration broadcasts link lifecycle
-- events (request / accept / decline / revoke) so the clinician's
-- dashboard refreshes its assigned-patient list live. But once a
-- patient is linked, ANY data they log on their side (transfusion,
-- symptom log, appointment) only surfaced on the clinician's
-- dashboard when:
--   * The clinician pulled to refresh, or
--   * The link broadcast happened to fire and re-trigger the slices
--     refetch as a side effect (rare and incidental).
--
-- This migration closes that gap with the same broadcast-from-trigger
-- pattern. Every patient-side mutation publishes to a single private
-- topic 'patient:{user_id}'. The patient themselves and any active
-- linked clinician can subscribe and refetch.
--
-- Tables covered:
--   public.transfusions    — patient adds / edits a transfusion
--   public.symptom_logs    — patient logs a new symptom event
--   public.appointments    — patient schedules / updates an appointment
--
-- Profiles + clinician_patient_links already have their own broadcast
-- paths (the assigned-patients hook refetches profile + link state on
-- the link broadcast). Pre-transfusion labs live as a JSONB column on
-- transfusions, so they ride along with the transfusion broadcast.
-- Medication reminders aren't on the main dashboard surface; can be
-- added in a follow-up if PatientDetailPane needs live adherence.

create or replace function public.broadcast_patient_data_change()
returns trigger
security definer
set search_path = ''
language plpgsql as $$
declare
  v_user_id uuid;
begin
  -- All three target tables key on user_id. Handle insert / update /
  -- delete uniformly by coalescing NEW and OLD.
  v_user_id := coalesce(NEW.user_id, OLD.user_id);
  if v_user_id is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'patient:' || v_user_id::text,  -- topic
    TG_OP,                          -- event ('INSERT' | 'UPDATE' | 'DELETE')
    TG_OP,                          -- operation
    TG_TABLE_NAME,                  -- table
    TG_TABLE_SCHEMA,                -- schema
    NEW,                            -- new record (null on delete)
    OLD                             -- old record (null on insert)
  );
  return null;
end;
$$;

create trigger transfusions_broadcast
  after insert or update or delete on public.transfusions
  for each row execute function public.broadcast_patient_data_change();

create trigger symptom_logs_broadcast
  after insert or update or delete on public.symptom_logs
  for each row execute function public.broadcast_patient_data_change();

create trigger appointments_broadcast
  after insert or update or delete on public.appointments
  for each row execute function public.broadcast_patient_data_change();

-- Broadcast authorization: a user may receive a 'patient:{user_id}'
-- topic when EITHER they are that user_id (their own data) OR they are
-- an active linked clinician for that patient. RLS policies are OR'd
-- across this and the existing 'links:%' and 'thread:%' policies; the
-- topic prefixes are disjoint, so they don't interfere.
create policy "Patient + linked clinicians read patient broadcasts"
  on realtime.messages
  for select to authenticated
  using (
    topic like 'patient:%'
    and (
      split_part(topic, ':', 2)::uuid = auth.uid()
      or public.is_active_clinician_for(split_part(topic, ':', 2)::uuid)
    )
  );
