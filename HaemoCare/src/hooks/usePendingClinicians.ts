import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as realService from '../services/clinicianService';
import * as mockService from '../mock/services';
import type { PendingClinician } from '../types/database';

export interface UsePendingCliniciansResult {
  pending: PendingClinician[];
  count: number;
  loading: boolean;
  refresh: () => void;
}

export function usePendingClinicians(): UsePendingCliniciansResult {
  const { isAdmin, isMockMode } = useAuth();
  const [pending, setPending] = useState<PendingClinician[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    if (!isAdmin) {
      setPending([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = isMockMode
          ? await mockService.getPendingClinicians()
          : await realService.getPendingClinicians();
        if (!cancelled) setPending(data);
      } catch {
        if (!cancelled) setPending([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin, isMockMode, tick]);

  return { pending, count: pending.length, loading, refresh };
}
