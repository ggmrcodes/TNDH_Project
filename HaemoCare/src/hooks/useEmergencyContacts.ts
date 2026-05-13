import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as realService from '../services/emergencyContactsService';
import * as mockServices from '../mock/services';
import type { EmergencyContact } from '../types/database';

export interface UseEmergencyContactsResult {
  contacts: EmergencyContact[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useEmergencyContacts(): UseEmergencyContactsResult {
  const { user, isMockMode } = useAuth();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      setContacts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = isMockMode
          ? await mockServices.listEmergencyContacts(userId)
          : await realService.listEmergencyContacts(userId);
        if (!cancelled) setContacts(data);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setContacts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, isMockMode, tick]);

  return { contacts, loading, error, refresh };
}
