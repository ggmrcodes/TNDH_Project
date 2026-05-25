import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as realClinicianService from '../services/clinicianService';
import * as mockServices from '../mock/services';
import type { Profile } from '../types/database';
import type { PendingPatientLinkRow, IncomingPatientRequest } from '../services/clinicianService';

export interface UseAssignedPatientsResult {
  patients: Profile[];
  pendingLinks: PendingPatientLinkRow[];
  incomingRequests: IncomingPatientRequest[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useAssignedPatients(): UseAssignedPatientsResult {
  const { user, isMockMode, role } = useAuth();
  const [patients, setPatients] = useState<Profile[]>([]);
  const [pendingLinks, setPendingLinks] = useState<PendingPatientLinkRow[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingPatientRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  const userId = user?.id ?? null;
  const enabled = role === 'clinician' && userId != null;

  useEffect(() => {
    if (!enabled) {
      setPatients([]);
      setPendingLinks([]);
      setIncomingRequests([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [activeData, pendingData, incomingData] = await Promise.all([
          isMockMode
            ? mockServices.getAssignedPatients()
            : realClinicianService.getAssignedPatients(userId!),
          isMockMode
            ? mockServices.getPendingPatientLinks(userId!)
            : realClinicianService.getPendingPatientLinks(userId!),
          isMockMode
            ? mockServices.getIncomingPatientRequests(userId!)
            : realClinicianService.getIncomingPatientRequests(userId!),
        ]);
        if (!cancelled) {
          setPatients(activeData);
          setPendingLinks(pendingData);
          setIncomingRequests(incomingData);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setPatients([]);
        setPendingLinks([]);
        setIncomingRequests([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, userId, isMockMode, tick]);

  return { patients, pendingLinks, incomingRequests, loading, error, refresh };
}
