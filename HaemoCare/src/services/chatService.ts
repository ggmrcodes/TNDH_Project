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
