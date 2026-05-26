# In-App Chat (Patient ↔ Clinician) — Design Spec

**Date:** 2026-05-26
**Branch:** `feat/in-app-chat` (five phases land sequentially)
**Scope:** Large — five subsystems (messages schema/RLS, realtime, attachments, push, retention) on top of the existing clinician-patient link backbone.

## Goal

Let an actively-linked patient and clinician exchange messages in the app: async text + image attachments, delivered live, with push notifications when the recipient is away. The conversation is keyed to the `clinician_patient_links` row that already governs their relationship — chat reuses that access-control backbone rather than inventing a new one.

## Locked decisions

| Decision | Value |
|---|---|
| v1 content | Async **text + image attachments** (image only) |
| Thread model | **One thread per active link.** The link row *is* the conversation — no separate conversations table. |
| Realtime transport | **Broadcast-from-trigger** (`realtime.broadcast_changes()` + private per-thread channel + realtime RLS). NOT `postgres_changes`. |
| Push | **Full Expo push stack in v1**, via a **Supabase Edge Function**. Extends notifications to clinicians (who get none today). |
| On link revoke | Thread becomes **read-only** (RLS blocks new inserts) + drops out of the active conversation list; history **retained + readable**. |
| Retention | Full history while link is active. On revoke, **7-day grace**, then a `pg_cron` job purges the thread's messages. |
| Unread | **Unread badges** via a lightweight `message_reads` table (last-read-at per participant). NOT "seen" receipts. |
| Patient entry | New **"Messages" bottom tab** (5th tab). Phone-first. |
| Clinician entry | **Dedicated clinician inbox** (conversation list, one row per patient, unread badges, recent-first) reachable from the dashboard. |
| Platform priority | **Mobile-first, especially patients.** Full-screen thread, keyboard-aware composer, touch targets ≥44px. |

## Visual styling — non-negotiable

Theme tokens only (`COLORS`, `SPACING`, `RADIUS`, `SHADOWS`, `TYPOGRAPHY`). Chat bubbles: own messages in `COLORS.primary` (teal) right-aligned, other party in a neutral surface left-aligned. Composer mirrors existing input patterns. The shared `ChatThread` component must be `KeyboardAvoidingView`-wrapped and tested at iPhone width first.

## Architecture overview

```
clinician_patient_links (existing) ── the "thread" key
  └── messages (link_id FK)         ── text + optional image attachment
  └── message_reads (link_id,user)  ── unread badge support

Phase 1 — Core text chat (works via refetch)
  ├── messages + message_reads tables, is_link_party() / is_active_link_party() helpers, RLS
  ├── chatService + mock + useConversations() + useThread()
  ├── patient: Messages bottom tab → conversation list → ChatThread
  └── clinician: dashboard inbox entry → conversation list → ChatThread

Phase 2 — Broadcast realtime
  └── trigger → realtime.broadcast_changes('thread:{link_id}') + realtime RLS + client subscribe + setAuth()

Phase 3 — Image attachments
  └── chat-attachments Storage bucket + RLS + client resize/upload + inline render

Phase 4 — Push notifications
  └── push_tokens table + registration (both roles) + DB webhook → Edge Function → Expo Push API + deep link

Phase 5 — Retention
  └── pg_cron daily purge of messages whose link was revoked >7d ago
```

---

## Phase 1 — Core text chat

### 1.1 Database

Migration: `supabase/migrations/2026-06-01-chat-core.sql`

```sql
create table public.messages (
  id            uuid default uuid_generate_v4() primary key,
  link_id       uuid references public.clinician_patient_links(id) on delete cascade not null,
  sender_id     uuid references auth.users(id) on delete cascade not null,
  body          text,
  attachment_path text,
  attachment_type text check (attachment_type in ('image')),
  created_at    timestamptz default now(),
  -- A message must carry text or an attachment (or both).
  constraint message_has_content check (
    (body is not null and length(btrim(body)) > 0) or attachment_path is not null
  )
);
create index idx_messages_link_created on public.messages (link_id, created_at desc);

create table public.message_reads (
  link_id      uuid references public.clinician_patient_links(id) on delete cascade not null,
  user_id      uuid references auth.users(id) on delete cascade not null,
  last_read_at timestamptz default now() not null,
  primary key (link_id, user_id)
);

-- Party to a link (any status) — for reads + read-tracking.
create or replace function public.is_link_party(p_link_id uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.clinician_patient_links l
    where l.id = p_link_id
      and (l.clinician_id = auth.uid() or l.patient_user_id = auth.uid())
  );
$$;
revoke execute on function public.is_link_party(uuid) from anon, public;
grant execute on function public.is_link_party(uuid) to authenticated;

-- Party to a CURRENTLY ACTIVE link — for sending.
create or replace function public.is_active_link_party(p_link_id uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.clinician_patient_links l
    where l.id = p_link_id
      and l.status = 'active'
      and (l.clinician_id = auth.uid() or l.patient_user_id = auth.uid())
  );
$$;
revoke execute on function public.is_active_link_party(uuid) from anon, public;
grant execute on function public.is_active_link_party(uuid) to authenticated;

alter table public.messages enable row level security;
alter table public.message_reads enable row level security;

-- Read history for any link you're a party to (incl. revoked → read-only history).
create policy "Parties read messages" on public.messages
  for select using (public.is_link_party(link_id));

-- Send only on an active link, and only as yourself.
create policy "Active parties send messages" on public.messages
  for insert with check (
    sender_id = auth.uid() and public.is_active_link_party(link_id)
  );

-- No update/delete from clients (immutable; retention handled by pg_cron).

create policy "Users manage own read marker" on public.message_reads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Notes: messages are immutable client-side (no edit/delete) — simplest + safest for a medical record; retention is the only deletion path (Phase 5). The `message_has_content` check prevents empty sends.

### 1.2 Types (`src/types/database.ts`)

```ts
export interface Message {
  id: string;
  link_id: string;
  sender_id: string;
  body: string | null;
  attachment_path: string | null;
  attachment_type: 'image' | null;
  created_at: string;
}

// A conversation row in either inbox (derived, not a table).
export interface Conversation {
  linkId: string;
  otherPartyUserId: string;
  otherPartyName: string;       // clinician name for patient view; patient display id/name for clinician view
  otherPartySubtitle: string | null; // hospital (patient view) / patient_id (clinician view)
  status: LinkStatus;           // 'active' | 'revoked' | ...
  lastMessage: string | null;   // preview text ('📷 Photo' if attachment-only)
  lastMessageAt: string | null;
  unreadCount: number;
}
```

### 1.3 Service + mock + hooks

`src/services/chatService.ts` (real):
- `getConversations(userId, role)` — lists threads. Patient: from their links (active + revoked-with-messages). Clinician: from assigned/previously-linked patients with messages. Joins last message + computes unread via `message_reads`. Returns `Conversation[]`.
- `getMessages(linkId)` — messages for a thread, ascending. Returns `Message[]`.
- `sendMessage(linkId, senderId, body)` — INSERT (text only in Phase 1; attachment params added Phase 3).
- `markRead(linkId, userId)` — upsert `message_reads.last_read_at = now()`.

`src/mock/services.ts`: in-memory mock mirroring all four, seeded with one demo thread between the demo patient and demo clinician.

Hooks:
- `src/hooks/useConversations.ts` — `{ conversations, totalUnread, loading, refresh }`, role-aware, `tick`/`cancelled`/`isMockMode` pattern.
- `src/hooks/useThread.ts` — `{ messages, loading, send, refresh }` for a `linkId`; calls `markRead` on mount + after new messages. (Realtime subscription added in Phase 2 — Phase 1 refetches on focus.)

### 1.4 Shared UI — `ChatThread`

`src/components/chat/ChatThread.tsx` — the conversation screen, used by both roles:
- `KeyboardAvoidingView` root (mobile-first).
- Inverted `FlatList` of message bubbles (own = teal right, other = neutral left; timestamp; day separators).
- Composer: multiline `TextInput` + send button (+ attach button, wired in Phase 3).
- Read-only banner when `status !== 'active'` ("This conversation is closed" / Thai), composer hidden.
- Props: `linkId`, `otherPartyName`, `status`.

`src/components/chat/ConversationRow.tsx` — one inbox row: avatar, name, last-message preview, time, unread badge.

### 1.5 Patient entry — Messages tab

- Add `Messages` to `MainTabParamList` + `MainTabNavigator` (5th tab, icon `message-circle`). Tab badge shows `totalUnread`.
- `src/screens/tabs/MessagesScreen.tsx` — conversation list (active links first, revoked read-only below). Tap → ChatThread.
- Desktop sidebar (DesktopSidebar) gets the same entry.

### 1.6 Clinician entry — inbox

- `src/screens/clinician/ClinicianInboxScreen.tsx` — conversation list (one row per patient with a thread, recent-first, unread badges).
- Reached from `ClinicianDashboardScreen`: a message icon in the top bar with a total-unread badge → pushes the inbox. (Clinician stack already exists via `ClinicianStackNavigator` — add the route.)
- Unread badge also shown on the relevant `PatientQueueRow`s.

### 1.7 i18n (Phase 1)

`chat.*` namespace (~15 keys): `chat.tab`, `chat.title`, `chat.empty`, `chat.composerPlaceholder`, `chat.send`, `chat.closed`, `chat.closedBody`, `chat.photoPreview` ("📷 Photo"), `chat.today`, `chat.yesterday`, `chat.unreadOne`/`chat.unreadMany`, etc. en + th.

### 1.8 Files (Phase 1)

**Create:** migration; `src/services/chatService.ts`; `src/hooks/useConversations.ts`; `src/hooks/useThread.ts`; `src/components/chat/ChatThread.tsx`; `src/components/chat/ConversationRow.tsx`; `src/screens/tabs/MessagesScreen.tsx`; `src/screens/clinician/ClinicianInboxScreen.tsx`.
**Modify:** `src/types/database.ts`; `src/mock/services.ts`; `src/navigation/MainTabNavigator.tsx`; `src/components/common/DesktopSidebar.tsx`; `src/navigation/ClinicianStackNavigator.tsx`; `src/screens/clinician/ClinicianDashboardScreen.tsx`; `src/components/clinician/PatientQueueRow.tsx`; `src/types/navigation.ts`; `src/i18n/en.ts` + `th.ts`.

---

## Phase 2 — Broadcast realtime

Migration: `supabase/migrations/2026-06-02-chat-realtime.sql`

- Trigger on `messages` AFTER INSERT calls `realtime.broadcast_changes()` to topic `thread:{NEW.link_id}` with the new row.
- RLS on `realtime.messages` (broadcast-auth table): authorize a user for topic `thread:{link_id}` only if `is_link_party(link_id)`. (Parse the link_id out of the topic per the Supabase realtime-authorization docs.)
- Client: `useThread` calls `await supabase.realtime.setAuth()` then subscribes to `supabase.channel('thread:'+linkId, { config: { private: true } }).on('broadcast', { event: 'INSERT' }, ...)`. New messages append to state live; unsubscribe on unmount.
- `useConversations` optionally subscribes to the viewer's threads for live inbox reordering (or just refetches on focus — decide in plan).

**Files:** migration; modify `src/hooks/useThread.ts` (+ maybe `useConversations.ts`), `src/config/supabase.ts` (confirm realtime enabled).

---

## Phase 3 — Image attachments

Migration: `supabase/migrations/2026-06-03-chat-attachments.sql` — create `chat-attachments` Storage bucket + RLS on `storage.objects`: a user may read/write objects whose path starts with `{link_id}/` when `is_link_party(link_id)` (read) / `is_active_link_party(link_id)` (write).

- Client: attach button → `expo-image-picker` → resize (reuse existing image utilities if present) → upload to `chat-attachments/{link_id}/{message_id}/{file}` → `sendMessage` with `attachment_path` + `attachment_type='image'`.
- Render: signed-URL (or public-with-RLS) image in the bubble; tap to view full.
- `sendMessage` signature extended with optional attachment params.

**Files:** migration; modify `chatService.ts`, mock, `ChatThread.tsx`, i18n.

---

## Phase 4 — Push notifications

Migration: `supabase/migrations/2026-06-04-push-tokens.sql`:
```sql
create table public.push_tokens (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  token text not null unique,
  platform text check (platform in ('ios','android','web')),
  updated_at timestamptz default now()
);
alter table public.push_tokens enable row level security;
create policy "Users manage own push tokens" on public.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- **Token registration**: on login (both roles), `getExpoPushTokenAsync()` → upsert into `push_tokens`. Extend `src/services/notifications.ts` + `NotificationGate` (currently patient-only) to register for clinicians too.
- **Delivery**: DB webhook on `messages` INSERT → **Supabase Edge Function** `notify-new-message` (Deno). It resolves the recipient (the link's other party), loads their `push_tokens`, and calls the **Expo Push API** with a deep link to `thread:{link_id}`. Skips if recipient was the sender.
- **Deep link**: tapping the push routes into the thread (extend the existing notification-response handler).
- **Ops note**: this introduces Supabase Edge Functions (Supabase CLI + Deno + `supabase functions deploy`) — new operational surface for this project, which has been dashboard-SQL-only so far. The Edge Function needs the Expo Push API endpoint (no secret required for Expo push, but the function uses the service role to read push_tokens).

**Files:** migration; `supabase/functions/notify-new-message/index.ts`; modify `src/services/notifications.ts`, `src/components/NotificationGate.tsx` (or a new clinician-side gate), `src/services/chatService.ts` (token registration helper), i18n.

---

## Phase 5 — Retention purge

Migration: `supabase/migrations/2026-06-05-chat-retention.sql`:
- Enable `pg_cron` (if not already) + schedule a daily job:
```sql
select cron.schedule('purge-revoked-chat', '0 3 * * *', $$
  delete from public.messages m
  using public.clinician_patient_links l
  where m.link_id = l.id
    and l.status = 'revoked'
    and l.revoked_at is not null
    and l.revoked_at < now() - interval '7 days';
$$);
```
- `message_reads` rows cascade-delete with the link; messages purged here. Active/never-revoked threads untouched.

**Files:** migration only.

---

## Edge cases

| Scenario | Behavior |
|---|---|
| Patient sends while link still pending (not yet active) | RLS rejects INSERT (`is_active_link_party` false). UI shouldn't surface a composer for non-active links. |
| Link revoked mid-conversation | Composer hides, read-only banner shows; existing messages remain readable; thread moves to the revoked section of the inbox. |
| Re-link after revoke (status back to active) | Same link row → same thread → history reappears (if within 7-day purge window) and composer re-enables. |
| Attachment upload fails | Message not sent; inline error; no orphan row (upload before insert; if insert fails, best-effort delete the object). |
| Recipient has no push token | Edge Function no-ops for that recipient (in-app realtime still delivers when they open). |
| Two devices / web + phone | Multiple push_tokens per user; Edge Function sends to all; realtime delivers to all open sessions. |
| Message arrives while thread open | Realtime appends + auto-marks read; no push needed (recipient is viewing). |

## Testing

Per phase: typecheck + web build + Playwright (mobile viewport for patient screens). Mock-mode regression for the chat flows (send, receive-on-refresh, unread badge, read-only-on-revoke). Realtime + push need real Supabase + two sessions — documented in a manual QA checklist. Edge Function tested via `supabase functions serve` locally + a manual insert.

## Phasing & rollout

Five phases, each its own commit + migration(s), same push/merge workflow as prior features. Phase 4 additionally requires deploying the Edge Function and enabling Database Webhooks; Phase 5 requires enabling `pg_cron` — both flagged at apply time.

## Out of scope (v1.5+)

- "Seen"/read receipts UI (unread badges only), typing indicators, presence/online status.
- Non-image attachments (PDF, video).
- Message edit/delete, reactions, threading/replies.
- Group conversations (always 1 patient ↔ 1 clinician per link).
- Configurable retention windows / per-message TTL (fixed 7-day-post-revoke).
- Message search.
