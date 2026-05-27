import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as realService from '../services/chatService';
import * as mockService from '../mock/services';
import type { Message } from '../types/database';
import { supabase } from '../config/supabase';

export interface UseThreadResult {
  messages: Message[];
  loading: boolean;
  sending: boolean;
  send: (body: string, attachment?: { path: string; type: 'image' }) => Promise<void>;
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
  // Distinguishes the first load from realtime-triggered refetches (tick), so a
  // broadcast doesn't flip the whole thread back into the full-screen loader
  // (which hides messages and collapses the layout on every sent/received msg).
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      if (!initialLoadDone.current) setLoading(true);
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
        if (!cancelled) { setLoading(false); initialLoadDone.current = true; }
      }
    })();
    return () => { cancelled = true; };
  }, [linkId, userId, isMockMode, tick]);

  // Phase 2 — subscribe to the private broadcast channel for live delivery.
  // Skipped in mock mode (no realtime). The handler just calls refresh(), which
  // refetches from the DB and deduplicates against the sender's optimistic append.
  useEffect(() => {
    if (isMockMode || !userId || !linkId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel('thread:' + linkId, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, () => { refresh(); })
        .subscribe();
    })();
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel); };
  }, [linkId, userId, isMockMode, refresh]);

  const send = useCallback(async (body: string, attachment?: { path: string; type: 'image' }) => {
    if (!userId || (!body.trim() && !attachment)) return;
    setSending(true);
    try {
      const svc = isMockMode ? mockService : realService;
      const msg = await svc.sendMessage(linkId, userId, body, attachment);
      setMessages(prev => [...prev, msg]);
    } finally {
      setSending(false);
    }
  }, [linkId, userId, isMockMode]);

  return { messages, loading, sending, send, refresh };
}
