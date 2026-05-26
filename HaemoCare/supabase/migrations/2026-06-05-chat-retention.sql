-- ============================================
-- In-app chat — retention purge (Phase 5)
-- ============================================
-- Spec: docs/superpowers/specs/2026-05-26-in-app-chat-design.md
-- Purges chat messages 7 days after their link was revoked. Active and
-- never-revoked threads keep full history.

create extension if not exists pg_cron;

select cron.schedule(
  'purge-revoked-chat',
  '0 3 * * *',  -- daily at 03:00 UTC
  $$
    delete from public.messages m
    using public.clinician_patient_links l
    where m.link_id = l.id
      and l.status = 'revoked'
      and l.revoked_at is not null
      and l.revoked_at < now() - interval '7 days';
  $$
);
