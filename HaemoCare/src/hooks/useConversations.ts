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
