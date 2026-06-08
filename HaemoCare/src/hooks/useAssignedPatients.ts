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
      // Diagnostic: this is the "race condition" failure mode — if userId
      // is null or role isn't 'clinician' at the time the dashboard mounts,
      // the hook short-circuits and patients stays [] forever until the
      // deps change. Surfaces hop 3 / hop 9 from the debugging plan.
      console.log('[useAssignedPatients] short-circuit', {
        enabled,
        userId,
        role,
        isMockMode,
        tick,
      });
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
      const [activeResult, pendingResult, incomingResult] = await Promise.allSettled([
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
      if (cancelled) return;
      // Diagnostic: prints the post-fetch state. Differentiates rejection
      // (network / auth / RLS) vs success-with-zero-rows (wrong project,
      // wrong account, mock mode) vs success-with-data (UI bug downstream).
      console.log('[useAssignedPatients] fetched', {
        userId,
        isMockMode,
        active: activeResult.status === 'fulfilled'
          ? {
              ok: true,
              count: activeResult.value.length,
              ids: activeResult.value.map(p => p.user_id),
              firstName: activeResult.value[0]?.full_name,
            }
          : { ok: false, error: String(activeResult.reason) },
        pending: pendingResult.status === 'fulfilled'
          ? { ok: true, count: pendingResult.value.length }
          : { ok: false, error: String(pendingResult.reason) },
        incoming: incomingResult.status === 'fulfilled'
          ? { ok: true, count: incomingResult.value.length }
          : { ok: false, error: String(incomingResult.reason) },
      });
      if (activeResult.status === 'fulfilled') {
        setPatients(activeResult.value);
      } else {
        setPatients([]);
      }
      if (pendingResult.status === 'fulfilled') {
        setPendingLinks(pendingResult.value);
      } else {
        setPendingLinks([]);
      }
      if (incomingResult.status === 'fulfilled') {
        setIncomingRequests(incomingResult.value);
      } else {
        setIncomingRequests([]);
      }
      const firstRejection =
        activeResult.status === 'rejected' ? activeResult.reason :
        pendingResult.status === 'rejected' ? pendingResult.reason :
        incomingResult.status === 'rejected' ? incomingResult.reason :
        null;
      setError(
        firstRejection != null
          ? (firstRejection instanceof Error ? firstRejection : new Error(String(firstRejection)))
          : null
      );
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [enabled, userId, isMockMode, tick]);

  return { patients, pendingLinks, incomingRequests, loading, error, refresh };
}
