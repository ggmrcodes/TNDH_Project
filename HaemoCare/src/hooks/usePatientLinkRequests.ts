import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as realService from '../services/patientService';
import * as mockService from '../mock/services';
import type { PendingLinkRequest } from '../services/patientService';

export interface UsePatientLinkRequestsResult {
  pending: PendingLinkRequest[];
  count: number;
  loading: boolean;
  refresh: () => void;
}

export function usePatientLinkRequests(): UsePatientLinkRequestsResult {
  const { user, isMockMode, role } = useAuth();
  const [pending, setPending] = useState<PendingLinkRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  const userId = user?.id ?? null;
  // Banner is patient-only; clinicians never receive link requests in this model.
  const enabled = role === 'patient' && userId != null;

  useEffect(() => {
    if (!enabled) {
      setPending([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = isMockMode
          ? await mockService.getPendingLinkRequests(userId!)
          : await realService.getPendingLinkRequests(userId!);
        if (!cancelled) setPending(data);
      } catch {
        if (!cancelled) setPending([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, userId, isMockMode, tick]);

  return { pending, count: pending.length, loading, refresh };
}
