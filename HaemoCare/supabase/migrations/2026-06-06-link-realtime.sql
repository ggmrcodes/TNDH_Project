-- ============================================
-- Clinician-patient links — broadcast realtime
-- ============================================
-- Makes link lifecycle events (request created / approved / declined /
-- revoked) push live to the affected parties, so the patient's
-- LinkRequestBanner (and the clinician's queues) update without an app
-- reload. Mirrors the chat broadcast-from-trigger pattern in
-- 2026-06-02-chat-realtime.sql.
--
-- Each link has two parties, so we broadcast to BOTH private topics:
--   'links:{patient_user_id}'  and  'links:{clinician_id}'
-- A client subscribes to 'links:{their own auth.uid()}' and refetches on
-- any event. Authorization below restricts each topic to its owner.

create or replace function public.broadcast_link_change()
returns trigger
security definer set search_path = ''
language plpgsql as $$
begin
  -- Notify the patient party's private topic.
  perform realtime.broadcast_changes(
    'links:' || NEW.patient_user_id::text,  -- topic
    TG_OP,                                  -- event
    TG_OP,                                  -- operation
    TG_TABLE_NAME,                          -- table
    TG_TABLE_SCHEMA,                        -- schema
    NEW,                                    -- new record
    OLD                                     -- old record
  );
  -- Notify the clinician party's private topic.
  perform realtime.broadcast_changes(
    'links:' || NEW.clinician_id::text,
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, NEW, OLD
  );
  return null;
end;
$$;

create trigger links_broadcast
  after insert or update on public.clinician_patient_links
  for each row execute function public.broadcast_link_change();

-- Broadcast authorization: a user may receive a 'links:{user_id}' topic
-- only when that id is their own. This sits alongside the chat policy on
-- realtime.messages ('thread:%'); RLS policies are OR-ed, and the topic
-- prefixes are disjoint.
create policy "Link parties read link broadcasts" on realtime.messages
  for select to authenticated
  using (
    topic like 'links:%'
    and split_part(topic, ':', 2)::uuid = auth.uid()
  );
