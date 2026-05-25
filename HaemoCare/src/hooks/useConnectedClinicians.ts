import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as realService from '../services/patientService';
import * as mockService from '../mock/services';
import type { ConnectedClinician } from '../services/patientService';

export interface UseConnectedCliniciansResult {
  connected: ConnectedClinician[];
  loading: boolean;
  refresh: () => void;
}

export function useConnectedClinicians(): UseConnectedCliniciansResult {
  const { user, isMockMode, role } = useAuth();
  const [connected, setConnected] = useState<ConnectedClinician[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  const userId = user?.id ?? null;
  const enabled = role === 'patient' && userId != null;

  useEffect(() => {
    if (!enabled) {
      setConnected([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = isMockMode
          ? await mockService.getConnectedClinicians(userId!)
          : await realService.getConnectedClinicians(userId!);
        if (!cancelled) setConnected(data);
      } catch {
        if (!cancelled) setConnected([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, userId, isMockMode, tick]);

  return { connected, loading, refresh };
}
