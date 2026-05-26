# In-App Chat — Phase 1 (Core Text Chat) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working text-only chat between an actively-linked patient and clinician — messages persist, the thread is gated by link status (read-only once revoked), both sides have an inbox + thread screen with unread badges. Delivery is via refetch-on-focus (live realtime is Phase 2).

**Architecture:** The existing `clinician_patient_links` row *is* the conversation. A new `messages` table FKs to it; a `message_reads` table tracks per-participant last-read for unread badges. RLS reads gate on `is_link_party` (any status), inserts gate on `is_active_link_party` (status='active' → read-only-on-revoke for free). A shared `ChatThread` component serves both roles; patients reach it via a new Messages bottom tab, clinicians via a dashboard inbox.

**Tech Stack:** Expo SDK 54 / React Native 0.81 / react-native-web / TypeScript / Supabase JS v2 / Postgres + RLS.

**Spec:** `docs/superpowers/specs/2026-05-26-in-app-chat-design.md` (this plan covers **Phase 1 only**).

**Working branch:** `feat/in-app-chat` (already created off main; contains the spec commit `4d3f78a`).

**Project conventions** (read before starting):
- Theme tokens only from `src/config/theme.ts` (`COLORS`, `SPACING`, `RADIUS`, `SHADOWS`, `TYPOGRAPHY`). Never hardcode hex/spacing.
- i18n: `src/i18n/en.ts` is the source of truth (keys form `TranslationKey`); `src/i18n/th.ts` mirrors every key (`Record<TranslationKey, string>`). Add to BOTH. `t('k', { var })` substitutes single-brace `{var}`.
- Service/mock/hook triad: `src/services/<f>Service.ts` (real, throws on error) + `src/mock/services.ts` (in-memory) + hook selects via `useAuth().isMockMode`. Hook pattern: `tick`/`refresh`/`cancelled`/role-guard (see `src/hooks/useAssignedPatients.ts`).
- Typecheck: `npx tsc --noEmit` from `HaemoCare/`. Web build: `npm run build:web`. Both pass before commit.
- Migrations applied by the user via Dashboard SQL Editor — never run from code.
- SECURITY DEFINER pattern: `is_active_clinician_for` in `supabase/schema.sql`; pair with `revoke execute ... from anon, public; grant execute ... to authenticated;`.
- Localhost auto-login: `?as=patient` (mock patient), default (mock clinician), `?as=none` (LoginScreen), `?as=admin` (admin).
- **Mobile-first**: patient chat screens must be verified at iPhone-14 viewport. Use `KeyboardAvoidingView`.
- No component unit tests in this repo. Verify = typecheck + web build + Playwright screenshot.

---

### Task 1: Migration — messages + message_reads + RLS helpers

**Files:**
- Create: `supabase/migrations/2026-06-01-chat-core.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================
-- In-app chat — core schema + RLS (Phase 1)
-- ============================================
-- Spec: docs/superpowers/specs/2026-05-26-in-app-chat-design.md

create table public.messages (
  id              uuid default uuid_generate_v4() primary key,
  link_id         uuid references public.clinician_patient_links(id) on delete cascade not null,
  sender_id       uuid references auth.users(id) on delete cascade not null,
  body            text,
  attachment_path text,
  attachment_type text check (attachment_type in ('image')),
  created_at      timestamptz default now(),
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

create policy "Parties read messages" on public.messages
  for select using (public.is_link_party(link_id));

create policy "Active parties send messages" on public.messages
  for insert with check (sender_id = auth.uid() and public.is_active_link_party(link_id));

create policy "Users manage own read marker" on public.message_reads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Ask the user to apply**

Tell the user: "Phase 1 chat migration written — apply `supabase/migrations/2026-06-01-chat-core.sql` via Supabase Dashboard SQL Editor. Mock-mode lets the UI verify without it; reply when applied so real-mode works."

### Task 2: Types — Message + Conversation

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add interfaces** (near `ClinicianPatientLink`):

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

export interface Conversation {
  linkId: string;
  otherPartyUserId: string;
  otherPartyName: string;
  otherPartySubtitle: string | null;
  status: LinkStatus;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}
```

(`LinkStatus` already exists in this file.)

- [ ] **Step 2: Verify** `npx tsc --noEmit` → exit 0.

### Task 3: chatService (real)

**Files:**
- Create: `src/services/chatService.ts`

- [ ] **Step 1: Write the service**

```ts
import { supabase } from '../config/supabase';
import type { Message, Conversation, LinkStatus } from '../types/database';

// Patient view: their links (active + any with messages). Clinician view:
// links where they're the clinician. Both compute last message + unread.
export async function getConversations(
  userId: string,
  role: 'patient' | 'clinician'
): Promise<Conversation[]> {
  const partyCol = role === 'clinician' ? 'clinician_id' : 'patient_user_id';
  const { data: links, error: linkErr } = await supabase
    .from('clinician_patient_links')
    .select('id, clinician_id, patient_user_id, status')
    .eq(partyCol, userId);
  if (linkErr) throw new Error(linkErr.message);
  if (!links || links.length === 0) return [];

  const linkIds = links.map((l) => l.id as string);

  // Last message per link (fetch recent, reduce client-side — fine at Phase-1 volume).
  const { data: msgs, error: msgErr } = await supabase
    .from('messages')
    .select('link_id, body, attachment_type, created_at, sender_id')
    .in('link_id', linkIds)
    .order('created_at', { ascending: false });
  if (msgErr) throw new Error(msgErr.message);

  const { data: reads } = await supabase
    .from('message_reads')
    .select('link_id, last_read_at')
    .eq('user_id', userId)
    .in('link_id', linkIds);
  const readMap = new Map<string, string>();
  (reads ?? []).forEach((r) => readMap.set(r.link_id as string, r.last_read_at as string));

  // Resolve other-party display via profiles / clinician_profiles.
  const otherIds = links.map((l) =>
    role === 'clinician' ? (l.patient_user_id as string) : (l.clinician_id as string)
  );
  const displayMap = await resolveDisplayNames(otherIds, role);

  const lastByLink = new Map<string, { body: string | null; attachment_type: string | null; created_at: string }>();
  const unreadByLink = new Map<string, number>();
  (msgs ?? []).forEach((m) => {
    const lid = m.link_id as string;
    if (!lastByLink.has(lid)) {
      lastByLink.set(lid, { body: m.body as string | null, attachment_type: m.attachment_type as string | null, created_at: m.created_at as string });
    }
    const lastRead = readMap.get(lid);
    const isUnread = (m.sender_id as string) !== userId && (!lastRead || (m.created_at as string) > lastRead);
    if (isUnread) unreadByLink.set(lid, (unreadByLink.get(lid) ?? 0) + 1);
  });

  const conversations: Conversation[] = links
    .map((l) => {
      const lid = l.id as string;
      const last = lastByLink.get(lid);
      const otherId = role === 'clinician' ? (l.patient_user_id as string) : (l.clinician_id as string);
      const disp = displayMap.get(otherId);
      return {
        linkId: lid,
        otherPartyUserId: otherId,
        otherPartyName: disp?.name ?? '—',
        otherPartySubtitle: disp?.subtitle ?? null,
        status: l.status as LinkStatus,
        lastMessage: last ? (last.body ?? (last.attachment_type ? '📷' : null)) : null,
        lastMessageAt: last?.created_at ?? null,
        unreadCount: unreadByLink.get(lid) ?? 0,
      };
    })
    // Active first, then any with history; drop active-but-empty? keep active always.
    .filter((c) => c.status === 'active' || c.lastMessageAt !== null)
    .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));

  return conversations;
}

async function resolveDisplayNames(
  ids: string[],
  role: 'patient' | 'clinician'
): Promise<Map<string, { name: string; subtitle: string | null }>> {
  const map = new Map<string, { name: string; subtitle: string | null }>();
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return map;
  if (role === 'clinician') {
    // other party = patient. Show patient_id; full_name only if patient shares it (RLS already gates).
    const { data } = await supabase
      .from('profiles')
      .select('user_id, full_name, patient_id')
      .in('user_id', unique);
    (data ?? []).forEach((p) =>
      map.set(p.user_id as string, {
        name: (p.full_name as string)?.trim() || (p.patient_id as string) || '—',
        subtitle: (p.patient_id as string) ?? null,
      })
    );
  } else {
    // other party = clinician.
    const { data } = await supabase
      .from('clinician_profiles')
      .select('user_id, full_name, hospital_affiliation')
      .in('user_id', unique);
    (data ?? []).forEach((c) =>
      map.set(c.user_id as string, {
        name: (c.full_name as string)?.trim() || 'Clinician',
        subtitle: (c.hospital_affiliation as string)?.trim() || null,
      })
    );
  }
  return map;
}

export async function getMessages(linkId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('link_id', linkId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export async function sendMessage(linkId: string, senderId: string, body: string): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ link_id: linkId, sender_id: senderId, body: body.trim() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Message;
}

export async function markRead(linkId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('message_reads')
    .upsert({ link_id: linkId, user_id: userId, last_read_at: new Date().toISOString() }, { onConflict: 'link_id,user_id' });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Verify** `npx tsc --noEmit` → exit 0.

### Task 4: Mock chat service

**Files:**
- Modify: `src/mock/services.ts`

- [ ] **Step 1: Append mock implementations + seed**

Add `Message`, `Conversation` to the `'../types/database'` import. Then:

```ts
// ── In-app chat (mock) ─────────────────────────────────────────
// One seeded thread between the demo patient (MOCK_USER_ID) and demo
// clinician (MOCK_CLINICIAN_PROFILE.user_id). Their link id is synthetic.
const MOCK_CHAT_LINK_ID = 'mock-chat-link-1';
let mockMessages: import('../types/database').Message[] = [
  {
    id: 'mock-msg-1',
    link_id: MOCK_CHAT_LINK_ID,
    sender_id: MOCK_CLINICIAN_PROFILE.user_id,
    body: 'สวัสดีค่ะ คุณรู้สึกอย่างไรบ้างหลังการรับเลือดครั้งล่าสุด?',
    attachment_path: null,
    attachment_type: null,
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
];
let mockReads: Record<string, string> = {}; // key `${linkId}:${userId}` -> iso

export async function getConversations(
  userId: string,
  role: 'patient' | 'clinician'
): Promise<import('../types/database').Conversation[]> {
  const last = mockMessages[mockMessages.length - 1];
  const lastRead = mockReads[`${MOCK_CHAT_LINK_ID}:${userId}`];
  const unread = mockMessages.filter(
    m => m.sender_id !== userId && (!lastRead || m.created_at > lastRead)
  ).length;
  const otherName = role === 'clinician' ? 'สมชาย ทะลังสาง' : MOCK_CLINICIAN_PROFILE.full_name;
  const otherSub = role === 'clinician' ? 'HC-048291' : (MOCK_CLINICIAN_PROFILE.hospital_affiliation || null);
  return [{
    linkId: MOCK_CHAT_LINK_ID,
    otherPartyUserId: role === 'clinician' ? MOCK_USER_ID : MOCK_CLINICIAN_PROFILE.user_id,
    otherPartyName: otherName,
    otherPartySubtitle: otherSub,
    status: 'active',
    lastMessage: last?.body ?? null,
    lastMessageAt: last?.created_at ?? null,
    unreadCount: unread,
  }];
}

export async function getMessages(_linkId: string): Promise<import('../types/database').Message[]> {
  return [...mockMessages];
}

export async function sendMessage(linkId: string, senderId: string, body: string): Promise<import('../types/database').Message> {
  const msg = {
    id: `mock-msg-${mockMessages.length + 1}`,
    link_id: linkId,
    sender_id: senderId,
    body: body.trim(),
    attachment_path: null,
    attachment_type: null as 'image' | null,
    created_at: new Date().toISOString(),
  };
  mockMessages.push(msg);
  return msg;
}

export async function markRead(linkId: string, userId: string): Promise<void> {
  mockReads[`${linkId}:${userId}`] = new Date().toISOString();
}
```

- [ ] **Step 2: Verify** `npx tsc --noEmit` → exit 0.

### Task 5: useConversations hook

**Files:**
- Create: `src/hooks/useConversations.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as realService from '../services/chatService';
import * as mockService from '../mock/services';
import type { Conversation } from '../types/database';

export interface UseConversationsResult {
  conversations: Conversation[];
  totalUnread: number;
  loading: boolean;
  refresh: () => void;
}

export function useConversations(): UseConversationsResult {
  const { user, role, isMockMode } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  const userId = user?.id ?? null;
  const enabled = (role === 'patient' || role === 'clinician') && userId != null;

  useEffect(() => {
    if (!enabled) { setConversations([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const svc = isMockMode ? mockService : realService;
        const data = await svc.getConversations(userId!, role as 'patient' | 'clinician');
        if (!cancelled) setConversations(data);
      } catch {
        if (!cancelled) setConversations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, userId, role, isMockMode, tick]);

  const totalUnread = conversations.reduce((n, c) => n + c.unreadCount, 0);
  return { conversations, totalUnread, loading, refresh };
}
```

- [ ] **Step 2: Verify** `npx tsc --noEmit` → exit 0.

### Task 6: useThread hook

**Files:**
- Create: `src/hooks/useThread.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as realService from '../services/chatService';
import * as mockService from '../mock/services';
import type { Message } from '../types/database';

export interface UseThreadResult {
  messages: Message[];
  loading: boolean;
  sending: boolean;
  send: (body: string) => Promise<void>;
  refresh: () => void;
}

export function useThread(linkId: string): UseThreadResult {
  const { user, isMockMode } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const svc = isMockMode ? mockService : realService;
        const data = await svc.getMessages(linkId);
        if (!cancelled) {
          setMessages(data);
          await svc.markRead(linkId, userId);
        }
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [linkId, userId, isMockMode, tick]);

  const send = useCallback(async (body: string) => {
    if (!userId || !body.trim()) return;
    setSending(true);
    try {
      const svc = isMockMode ? mockService : realService;
      const msg = await svc.sendMessage(linkId, userId, body);
      setMessages(prev => [...prev, msg]);
    } finally {
      setSending(false);
    }
  }, [linkId, userId, isMockMode]);

  return { messages, loading, sending, send, refresh };
}
```

- [ ] **Step 2: Verify** `npx tsc --noEmit` → exit 0.

### Task 7: ChatThread component

**Files:**
- Create: `src/components/chat/ChatThread.tsx`

- [ ] **Step 1: Write the component**

```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useThread } from '../../hooks/useThread';
import { TranslationKey } from '../../i18n';
import type { LinkStatus } from '../../types/database';

interface Props {
  linkId: string;
  status: LinkStatus;
}

export default function ChatThread({ linkId, status }: Props) {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { messages, loading, sending, send } = useThread(linkId);
  const [draft, setDraft] = useState('');
  const isActive = status === 'active';

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    await send(body);
  };

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString(language === 'th' ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={[...messages].reverse()}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            return (
              <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowOther]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                  {item.body ? (
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
                  ) : null}
                  <Text style={[styles.time, mine && styles.timeMine]}>{fmtTime(item.created_at)}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{t('chat.threadEmpty' as TranslationKey)}</Text>}
        />
      )}

      {isActive ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('chat.composerPlaceholder' as TranslationKey)}
            placeholderTextColor={COLORS.textLight}
            multiline
            editable={!sending}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!draft.trim() || sending}
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('chat.send' as TranslationKey)}
          >
            {sending ? <ActivityIndicator size="small" color={COLORS.white} /> : <Feather name="send" size={18} color={COLORS.white} />}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.closedBanner}>
          <Feather name="lock" size={14} color={COLORS.textSecondary} />
          <Text style={styles.closedText}>{t('chat.closed' as TranslationKey)}</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: SPACING.md, gap: SPACING.xs },
  bubbleRow: { flexDirection: 'row', marginVertical: 2 },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.lg },
  bubbleMine: { backgroundColor: COLORS.primary, borderBottomRightRadius: RADIUS.sm },
  bubbleOther: { backgroundColor: COLORS.white, borderBottomLeftRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.borderLight },
  bubbleText: { fontSize: 15, color: COLORS.text, lineHeight: 20 },
  bubbleTextMine: { color: COLORS.white },
  time: { fontSize: 10, color: COLORS.textLight, marginTop: 4, alignSelf: 'flex-end' },
  timeMine: { color: 'rgba(255,255,255,0.7)' },
  empty: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 13, padding: SPACING.xl },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm,
    padding: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.borderLight, backgroundColor: COLORS.surface,
  },
  input: {
    flex: 1, maxHeight: 120, minHeight: 40, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    fontSize: 15, color: COLORS.text, backgroundColor: COLORS.white,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
  closedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.borderLight, backgroundColor: COLORS.background,
  },
  closedText: { fontSize: 13, color: COLORS.textSecondary },
});
```

- [ ] **Step 2: Verify** `npx tsc --noEmit` → exit 0.

### Task 8: ConversationRow component

**Files:**
- Create: `src/components/chat/ConversationRow.tsx`

- [ ] **Step 1: Write the component**

```tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import type { Conversation } from '../../types/database';

interface Props { conversation: Conversation; onPress: () => void; }

export default function ConversationRow({ conversation: c, onPress }: Props) {
  const { t, language } = useLanguage();
  const time = c.lastMessageAt
    ? new Date(c.lastMessageAt).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', { month: 'short', day: 'numeric' })
    : '';
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.row}>
      <View style={styles.avatar}><Feather name="user" size={18} color={COLORS.primary} /></View>
      <View style={styles.col}>
        <View style={styles.topLine}>
          <Text style={styles.name} numberOfLines={1}>{c.otherPartyName}</Text>
          {time ? <Text style={styles.time}>{time}</Text> : null}
        </View>
        <View style={styles.bottomLine}>
          <Text style={styles.preview} numberOfLines={1}>
            {c.lastMessage ?? t('chat.noMessages' as TranslationKey)}
          </Text>
          {c.unreadCount > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{c.unreadCount}</Text></View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  col: { flex: 1, gap: 2 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  time: { fontSize: 11, color: COLORS.textLight },
  bottomLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  preview: { flex: 1, fontSize: 13, color: COLORS.textSecondary },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: COLORS.white, fontSize: 11, fontWeight: '800' },
});
```

- [ ] **Step 2: Verify** `npx tsc --noEmit` → exit 0.

### Task 9: ChatThreadScreen (shared screen wrapper)

**Files:**
- Create: `src/screens/chat/ChatThreadScreen.tsx`

- [ ] **Step 1: Write the screen** (reads route params, renders ChatThread; used by both navigators)

```tsx
import React, { useLayoutEffect } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import ChatThread from '../../components/chat/ChatThread';
import { COLORS } from '../../config/theme';
import type { LinkStatus } from '../../types/database';

type ChatThreadParams = { ChatThread: { linkId: string; otherPartyName: string; status: LinkStatus } };

export default function ChatThreadScreen() {
  const route = useRoute<RouteProp<ChatThreadParams, 'ChatThread'>>();
  const navigation = useNavigation();
  const { linkId, otherPartyName, status } = route.params;

  useLayoutEffect(() => {
    navigation.setOptions({ title: otherPartyName, headerShown: true });
  }, [navigation, otherPartyName]);

  return (
    <SafeAreaView style={styles.safe}>
      <ChatThread linkId={linkId} status={status} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: COLORS.background } });
```

- [ ] **Step 2: Verify** `npx tsc --noEmit` → exit 0.

### Task 10: navigation types

**Files:**
- Modify: `src/types/navigation.ts`

- [ ] **Step 1: Add routes**

To `MainTabParamList` add: `Messages: undefined;`
To `RootStackParamList` add: `ChatThread: { linkId: string; otherPartyName: string; status: import('./database').LinkStatus };`
To `ClinicianStackParamList` add: `ClinicianInbox: undefined;` and `ChatThread: { linkId: string; otherPartyName: string; status: import('./database').LinkStatus };`

- [ ] **Step 2: Verify** `npx tsc --noEmit` → exit 0.

### Task 11: Patient MessagesScreen + tab wiring

**Files:**
- Create: `src/screens/tabs/MessagesScreen.tsx`
- Modify: `src/navigation/MainTabNavigator.tsx`
- Modify: `src/components/common/DesktopSidebar.tsx`
- Modify: `src/navigation/AppNavigator.tsx`

- [ ] **Step 1: Write MessagesScreen**

```tsx
import React from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SPACING, TYPOGRAPHY } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useConversations } from '../../hooks/useConversations';
import ConversationRow from '../../components/chat/ConversationRow';
import { TranslationKey } from '../../i18n';

export default function MessagesScreen() {
  const { t } = useLanguage();
  const navigation = useNavigation<any>();
  const { conversations, loading } = useConversations();

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>{t('chat.title' as TranslationKey)}</Text>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.linkId}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            onPress={() => navigation.navigate('ChatThread', { linkId: item.linkId, otherPartyName: item.otherPartyName, status: item.status })}
          />
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>{t('chat.empty' as TranslationKey)}</Text> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  title: { ...TYPOGRAPHY.h1, color: COLORS.text, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  empty: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 14, marginTop: SPACING.xl },
});
```

- [ ] **Step 2: MainTabNavigator — add the Messages tab**

In `src/navigation/MainTabNavigator.tsx`:
- Import `MessagesScreen` and add to the `SCREENS` map + `TAB_ICONS` (`Messages: 'message-circle'`).
- Add `<Tab.Screen name="Messages" component={MessagesScreen} options={{ tabBarLabel: tabLabels.Messages, tabBarBadge: totalUnread > 0 ? totalUnread : undefined }} />` after TransfusionHistory.
- Add `Messages: t('chat.tab')` to `tabLabels`.
- Call `const { totalUnread } = useConversations();` at the top of the component (it's already inside the patient-only mobile path; safe — hook returns 0 for non-patient).

- [ ] **Step 3: DesktopSidebar — add Messages entry**

Add `{ name: 'Messages', icon: 'message-circle' }` to the sidebar tab list array, and ensure `MessagesScreen` is in the `SCREENS` map used by `DesktopTabLayout` in MainTabNavigator.

- [ ] **Step 4: AppNavigator — register ChatThread route**

Import `ChatThreadScreen`; add `<RootStack.Screen name="ChatThread" component={ChatThreadScreen} options={{ headerShown: true }} />` inside the patient RootStack.

- [ ] **Step 5: Verify** `npx tsc --noEmit` → exit 0.

### Task 12: Clinician inbox + dashboard entry

**Files:**
- Create: `src/screens/clinician/ClinicianInboxScreen.tsx`
- Modify: `src/navigation/ClinicianStackNavigator.tsx`
- Modify: `src/screens/clinician/ClinicianDashboardScreen.tsx`

- [ ] **Step 1: Write ClinicianInboxScreen** (same shape as MessagesScreen but navigates within the clinician stack)

```tsx
import React from 'react';
import { Text, FlatList, StyleSheet, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SPACING, TYPOGRAPHY } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useConversations } from '../../hooks/useConversations';
import ConversationRow from '../../components/chat/ConversationRow';
import { TranslationKey } from '../../i18n';

export default function ClinicianInboxScreen() {
  const { t } = useLanguage();
  const navigation = useNavigation<any>();
  const { conversations, loading } = useConversations();
  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>{t('chat.title' as TranslationKey)}</Text>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.linkId}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            onPress={() => navigation.navigate('ChatThread', { linkId: item.linkId, otherPartyName: item.otherPartyName, status: item.status })}
          />
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>{t('chat.empty' as TranslationKey)}</Text> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  title: { ...TYPOGRAPHY.h1, color: COLORS.text, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  empty: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 14, marginTop: SPACING.xl },
});
```

- [ ] **Step 2: ClinicianStackNavigator — register inbox + thread**

Import `ClinicianInboxScreen` + `ChatThreadScreen`; add both as `<Stack.Screen>`s (`ClinicianInbox` with `headerShown: true` + title `t('chat.title')`; `ChatThread` with `headerShown: true`).

- [ ] **Step 3: Dashboard top-bar entry**

In `ClinicianDashboardScreen.tsx` top bar (`topBarActions`), add a message icon button before sign-out:
```tsx
<TouchableOpacity onPress={() => navigation.navigate('ClinicianInbox')} style={styles.inboxBtn} accessibilityLabel={t('chat.title' as TranslationKey)}>
  <Feather name="message-circle" size={18} color={COLORS.primary} />
  {totalUnread > 0 && <View style={styles.inboxBadge}><Text style={styles.inboxBadgeText}>{totalUnread}</Text></View>}
</TouchableOpacity>
```
Add `const navigation = useNavigation<any>();` and `const { totalUnread } = useConversations();` near the top. Add styles `inboxBtn` (36×36, relative) + `inboxBadge` (absolute top-right, accent bg) + `inboxBadgeText`. Import `useNavigation`.

- [ ] **Step 4: Verify** `npx tsc --noEmit` → exit 0.

### Task 13: i18n (Phase 1)

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/th.ts`

- [ ] **Step 1: Add to en.ts**

```ts
'chat.tab': 'Messages',
'chat.title': 'Messages',
'chat.empty': 'No conversations yet.',
'chat.noMessages': 'No messages yet',
'chat.threadEmpty': 'Say hello to start the conversation.',
'chat.composerPlaceholder': 'Type a message…',
'chat.send': 'Send',
'chat.closed': 'This conversation is closed.',
```

- [ ] **Step 2: Add matching keys to th.ts**

```ts
'chat.tab': 'ข้อความ',
'chat.title': 'ข้อความ',
'chat.empty': 'ยังไม่มีการสนทนา',
'chat.noMessages': 'ยังไม่มีข้อความ',
'chat.threadEmpty': 'ทักทายเพื่อเริ่มการสนทนา',
'chat.composerPlaceholder': 'พิมพ์ข้อความ...',
'chat.send': 'ส่ง',
'chat.closed': 'การสนทนานี้ปิดแล้ว',
```

- [ ] **Step 3: Verify** `npx tsc --noEmit` → exit 0.

### Task 14: Phase 1 verify + commit

- [ ] **Step 1: Typecheck** — `cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit; echo "EXIT: $?"` → `EXIT: 0`.

- [ ] **Step 2: Web build** — `npm run build:web 2>&1 | tail -5` → success.

- [ ] **Step 3: Visual check (patient, mobile viewport)** — serve dist, Playwright iPhone-14 at `http://localhost:4173/?as=patient`: confirm a 5th "Messages" tab with the demo conversation; open it → ChatThread shows the seeded clinician message; type + send → bubble appears right-aligned teal. Screenshot.

- [ ] **Step 4: Visual check (clinician)** — `http://localhost:4173/`: confirm a message icon in the dashboard top bar → tap → inbox lists the demo patient conversation → open thread → send works.

- [ ] **Step 5: Commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare
git add \
  supabase/migrations/2026-06-01-chat-core.sql \
  src/types/database.ts src/types/navigation.ts \
  src/services/chatService.ts src/mock/services.ts \
  src/hooks/useConversations.ts src/hooks/useThread.ts \
  src/components/chat/ChatThread.tsx src/components/chat/ConversationRow.tsx \
  src/screens/chat/ChatThreadScreen.tsx \
  src/screens/tabs/MessagesScreen.tsx src/screens/clinician/ClinicianInboxScreen.tsx \
  src/navigation/MainTabNavigator.tsx src/navigation/ClinicianStackNavigator.tsx src/navigation/AppNavigator.tsx \
  src/components/common/DesktopSidebar.tsx src/screens/clinician/ClinicianDashboardScreen.tsx \
  src/i18n/en.ts src/i18n/th.ts

git commit -m "$(cat <<'EOF'
feat(chat): phase 1 — core text chat (patient ↔ clinician)

messages + message_reads tables keyed to clinician_patient_links (the
link IS the thread). RLS: read via is_link_party (any status),
send via is_active_link_party (active only → read-only-on-revoke).
chatService + mock + useConversations/useThread hooks. Shared
ChatThread component; patient Messages bottom tab + clinician dashboard
inbox, both with unread badges. Delivery via refetch (realtime is
Phase 2).

Requires applying supabase/migrations/2026-06-01-chat-core.sql.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## After Phase 1

Phases 2-5 (realtime, attachments, push, retention) each get their own focused plan increment, written when we reach them — their task detail firms up once Phase 1's data layer + hook shapes are real. Push/merge follows the usual workflow.

## Self-review notes (addressed inline)

- **Spec coverage (Phase 1 slice):** messages/message_reads schema ✓ (T1), RLS read/write split incl. read-only-on-revoke ✓ (T1, T7 banner), services ✓ (T3/T4), unread badges ✓ (T5/T8/T11/T12), patient Messages tab ✓ (T11), clinician inbox ✓ (T12), mobile-first ChatThread w/ KeyboardAvoidingView ✓ (T7), i18n ✓ (T13). Realtime/attachments/push/retention intentionally deferred to later phase plans.
- **Type consistency:** `Conversation`/`Message` defined T2, consumed T3-T12 with matching fields. `sendMessage(linkId, senderId, body)` identical in real (T3) + mock (T4) + `useThread` (T6). `ChatThread` props `{ linkId, status }` match T9 usage. Nav param `ChatThread { linkId, otherPartyName, status }` consistent across T10/T11/T12.
- **No placeholders:** every step has full code.
