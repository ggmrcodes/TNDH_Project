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
