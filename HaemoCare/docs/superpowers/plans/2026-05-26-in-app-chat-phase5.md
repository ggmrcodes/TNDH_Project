# In-App Chat — Phase 5: Retention Purge

**Date:** 2026-05-26  
**Branch:** `feat/chat-realtime`  
**Spec:** [2026-05-26-in-app-chat-design.md](../specs/2026-05-26-in-app-chat-design.md)

## Goal

Automatically purge chat messages 7 days after their associated `clinician_patient_links` row is revoked, while preserving full history for active and never-revoked threads.

## Implementation

**Migration:** `supabase/migrations/2026-06-05-chat-retention.sql`

A PostgreSQL cron job runs daily at **03:00 UTC**:
```sql
delete from public.messages m
using public.clinician_patient_links l
where m.link_id = l.id
  and l.status = 'revoked'
  and l.revoked_at is not null
  and l.revoked_at < now() - interval '7 days';
```

### Notes

- **Cascade behavior:** `message_reads` rows are automatically cascade-deleted when their link is deleted; messages are explicitly purged by this job.
- **Storage attachments:** Chat-attachment objects in the `chat-attachments` Storage bucket are **not** auto-purged by this job (scope out for a future enhancement). Manual or periodic cleanup of orphaned objects may be needed; flag for future ops.
- **Active/never-revoked threads:** Untouched indefinitely.
- **Re-linked scenarios:** If a revoked link is re-linked (status back to active), the same thread row persists and messages within the 7-day window are retained.

## Gate

**Do not merge without:**

1. ✅ Apply the migration (`supabase db push`).
2. ✅ Enable `pg_cron` in the **Supabase Dashboard** → Database → Extensions → search "pg_cron" → enable.
3. ✅ Verify the cron job is scheduled: `select * from cron.job;` (should show `purge-revoked-chat`).

Without step 2, the migration will fail at the `cron.schedule()` call.

## Files

- `supabase/migrations/2026-06-05-chat-retention.sql` (new)
- `docs/superpowers/plans/2026-05-26-in-app-chat-phase5.md` (this file, new)
