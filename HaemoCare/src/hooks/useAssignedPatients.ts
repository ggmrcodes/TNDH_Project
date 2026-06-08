import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
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
  // Diagnostic: --no-dev bundles strip console output from Metro / pm2,
  // so we surface the first hook outcome via Alert (always renders).
  // Fires once per session per surface, then never again.
  const alertedShortCircuit = useRef(false);
  const alertedFetch = useRef(false);

  useEffect(() => {
    if (!enabled) {
      console.log('[useAssignedPatients] short-circuit', {
        enabled,
        userId,
        role,
        isMockMode,
        tick,
      });
      if (!alertedShortCircuit.current) {
        alertedShortCircuit.current = true;
        Alert.alert(
          '[useAssignedPatients] short-circuit',
          `enabled: ${enabled}\nuserId: ${userId ?? 'null'}\nrole: ${role ?? 'null'}\nmock: ${isMockMode}`,
        );
      }
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
      const activeSummary = activeResult.status === 'fulfilled'
        ? `ok count=${activeResult.value.length}${activeResult.value[0] ? ` first=${activeResult.value[0].full_name}` : ''}`
        : `ERR ${String(activeResult.reason).slice(0, 180)}`;
      const pendingSummary = pendingResult.status === 'fulfilled'
        ? `ok count=${pendingResult.value.length}`
        : `ERR ${String(pendingResult.reason).slice(0, 80)}`;
      const incomingSummary = incomingResult.status === 'fulfilled'
        ? `ok count=${incomingResult.value.length}`
        : `ERR ${String(incomingResult.reason).slice(0, 80)}`;
      console.log('[useAssignedPatients] fetched', {
        userId,
        isMockMode,
        active: activeSummary,
        pending: pendingSummary,
        incoming: incomingSummary,
      });
      if (!alertedFetch.current) {
        alertedFetch.current = true;
        Alert.alert(
          '[useAssignedPatients] fetched',
          `userId: ${userId?.slice(0, 8) ?? 'null'}…\nmock: ${isMockMode}\n` +
          `active:   ${activeSummary}\n` +
          `pending:  ${pendingSummary}\n` +
          `incoming: ${incomingSummary}`,
        );
      }
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
