# In-app chat — Phase 2: Broadcast Realtime

**Date:** 2026-05-26  
**Branch:** feat/chat-realtime  
**Spec:** docs/superpowers/specs/2026-05-26-in-app-chat-design.md

## Goal

Deliver new chat messages live to the recipient without polling, using Supabase
Broadcast-from-trigger (NOT postgres_changes). When a message is inserted, a
Postgres trigger broadcasts to a private per-thread channel; the open
`useThread` subscription refetches on that event.

## Migration (`supabase/migrations/2026-06-02-chat-realtime.sql`)

- **Trigger function `public.broadcast_message()`** — SECURITY DEFINER, called
  after each INSERT on `public.messages`. Calls
  `realtime.broadcast_changes('thread:{link_id}', ...)` to push the event to
  the private per-thread topic.
- **Trigger `messages_broadcast`** — AFTER INSERT on `public.messages`, FOR
  EACH ROW, executes the above function.
- **RLS policy "Chat parties read broadcast"** on `realtime.messages` — allows
  authenticated users to subscribe to a `thread:{link_id}` topic only when
  `public.is_link_party(link_id)` returns true (reuses the Phase 1 helper).

## Client subscription (`src/hooks/useThread.ts`)

A second `useEffect` (independent of the fetch effect) runs when NOT in mock
mode and both `userId` and `linkId` are present:

1. `await supabase.realtime.setAuth()` — attaches the user JWT to the realtime
   connection so the private-channel RLS check passes.
2. Opens `supabase.channel('thread:' + linkId, { config: { private: true } })`
   and listens for `broadcast` events with `event: 'INSERT'`.
3. On each event: calls `refresh()` (increments a `tick`, re-runs the fetch
   effect). Deduplicates naturally against the sender's optimistic append.
4. Uses a `cancelled` flag to prevent a torn-down effect from subscribing after
   `setAuth` resolves.
5. Cleanup: `supabase.removeChannel(channel)`.
6. Effect deps: `[linkId, userId, isMockMode, refresh]`. `refresh` is a stable
   `useCallback` in the hook — no infinite loop.

## Gate

- User must **apply the migration** to their Supabase project.
- User must **enable Realtime** on the `messages` table in the Supabase
  dashboard (Table Editor → Replication → enable for `messages`).
- End-to-end verification requires **two live sessions** (sender + recipient).
