-- ============================================
-- In-app chat — broadcast realtime (Phase 2)
-- ============================================
-- Spec: docs/superpowers/specs/2026-05-26-in-app-chat-design.md

-- Broadcast each new message to a private per-thread topic 'thread:{link_id}'.
create or replace function public.broadcast_message()
returns trigger
security definer set search_path = ''
language plpgsql as $$
begin
  perform realtime.broadcast_changes(
    'thread:' || NEW.link_id::text,  -- topic
    TG_OP,                           -- event
    TG_OP,                           -- operation
    TG_TABLE_NAME,                   -- table
    TG_TABLE_SCHEMA,                 -- schema
    NEW,                             -- new record
    OLD                              -- old record
  );
  return null;
end;
$$;

create trigger messages_broadcast
  after insert on public.messages
  for each row execute function public.broadcast_message();

-- Broadcast authorization: a user may receive a 'thread:{link_id}' topic
-- only if they are a party to that link (any status — read access).
create policy "Chat parties read broadcast" on realtime.messages
  for select to authenticated
  using (
    topic like 'thread:%'
    and public.is_link_party(split_part(topic, ':', 2)::uuid)
  );
