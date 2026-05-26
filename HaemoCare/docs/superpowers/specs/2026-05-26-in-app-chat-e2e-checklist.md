# In-App Chat — End-to-End Test Checklist (Phases 1-5)

**Status of code:** all 5 phases implemented + code-QA'd + typecheck/build green + mock-mode regression passing. This checklist covers the **real** end-to-end tests that require live infrastructure (DB migrations applied, Realtime/pg_cron enabled, Edge Function deployed, real devices). It cannot be run from a headless/CI environment.

## Prerequisite — apply infrastructure (one-time)

Apply these migrations via Supabase Dashboard → SQL Editor **in order**:
1. `supabase/migrations/2026-06-01-chat-core.sql` (Phase 1 — messages, message_reads, RLS helpers)
2. `supabase/migrations/2026-06-02-chat-realtime.sql` (Phase 2 — broadcast trigger + realtime.messages RLS)
3. `supabase/migrations/2026-06-03-chat-attachments.sql` (Phase 3 — Storage bucket + RLS)
4. `supabase/migrations/2026-06-04-push-tokens.sql` (Phase 4 — push_tokens)
5. `supabase/migrations/2026-06-05-chat-retention.sql` (Phase 5 — pg_cron purge)

Then:
- **Realtime**: Dashboard → Realtime — confirm it's enabled (on by default). Broadcast-from-trigger needs no table in the publication.
- **pg_cron**: Dashboard → Database → Extensions — enable `pg_cron` (the migration also `create extension if not exists`).
- **Edge Function**: `supabase functions deploy notify-new-message`.
- **Database Webhook**: Dashboard → Database → Webhooks — create one on `public.messages` **INSERT** → HTTP request to the `notify-new-message` function.

## Test accounts
Two real accounts with an **active** link between them:
- A verified clinician (in `clinician_profiles` with `verified=true`).
- A patient with a profile.
- An `active` row in `clinician_patient_links` between them (clinician adds patient + patient approves, or vice-versa).

---

## Phase 1 — Core text chat (works once migration 1 applied)
- [ ] Patient → Messages tab shows the conversation with unread badge.
- [ ] Open thread → clinician's messages left/neutral, patient's right/teal, correct chronological order (oldest top, newest bottom).
- [ ] Patient sends text → appears at bottom; unread badge clears.
- [ ] Clinician dashboard → inbox icon (top bar) shows unread badge → inbox lists the patient → open thread.
- [ ] Clinician sends text → patient sees it (after refetch in Phase 1; live in Phase 2).
- [ ] Revoke the link (patient PrivacySettings → revoke, or clinician side) → thread becomes read-only (composer hidden, "conversation closed" banner) for both; thread drops out of active list but history still readable.

## Phase 2 — Realtime (migrations 1-2 + Realtime enabled)
- [ ] Open the same thread in **two browser sessions** (patient + clinician), side by side.
- [ ] Clinician sends → message appears in the patient's open thread **without a manual refresh** (within ~1s).
- [ ] Patient sends → appears live on the clinician side.
- [ ] Confirm no duplicate bubbles for the sender (optimistic append + broadcast refetch dedupe).
- [ ] Sign out / unmount → no console errors from a lingering channel subscription.

## Phase 3 — Image attachments (migration 3 + real Storage)
- [ ] On a real device (or web with file picker), tap the attach (image) button → pick a photo.
- [ ] Uploading state shows; on success an image bubble renders inline (resized ≤1200px).
- [ ] Recipient sees the image (signed URL resolves) in their thread.
- [ ] Conversation list preview shows "📷" for an attachment-only last message.
- [ ] Attempt to send on a revoked (read-only) thread → not possible (composer hidden); direct upload would be RLS-rejected.

## Phase 4 — Push (migration 4 + Edge Function deployed + webhook + REAL DEVICES)
- [ ] On a physical device, log in (patient and clinician on two devices). Confirm a `push_tokens` row is created per device.
- [ ] Device A sends a message while Device B's app is backgrounded → Device B receives a push notification with the sender's text (or "📷 Photo").
- [ ] Tapping the push opens the app and routes to the recipient's inbox (Messages tab / clinician inbox).
- [ ] Sender does NOT receive a push for their own message.
- [ ] A user with no token (e.g., web-only) simply doesn't get a push; no error in the Edge Function logs.

## Phase 5 — Retention purge (migration 5 + pg_cron)
- [ ] Verify the cron job is scheduled: `select * from cron.job where jobname = 'purge-revoked-chat';`
- [ ] Logic test (no need to wait 7 days): manually set a test link `status='revoked', revoked_at = now() - interval '8 days'`, then run the purge body once:
  ```sql
  delete from public.messages m using public.clinician_patient_links l
  where m.link_id = l.id and l.status='revoked' and l.revoked_at < now() - interval '7 days';
  ```
  Confirm that link's messages are deleted and active threads' messages are untouched.

## Known headless limitations (why this is a manual checklist)
- Push token registration + delivery require a **physical device** — impossible on web/simulator.
- Realtime + attachments require the **migrations applied** to the live project — no DDL access from the app's anon key.
- The 7-day retention window is exercised via the manual SQL above rather than waiting.
