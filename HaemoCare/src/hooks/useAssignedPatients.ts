import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../config/supabase';
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

  // Live updates: subscribe to the clinician's private 'links:{userId}'
  // topic. The trigger in 2026-06-06-link-realtime.sql broadcasts to
  // BOTH parties of every link change, so when a patient taps Accept (or
  // declines / revokes) the UPDATE broadcast lands here and we refresh.
  // Also covers the clinician-side INSERT case (just added a patient by
  // HC code → broadcast → refresh → "AWAITING PATIENT" row appears).
  // Mirrors the patient-side subscription in usePatientLinkRequests.ts.
  // Skipped in mock mode (no realtime).
  useEffect(() => {
    if (isMockMode || !enabled || !userId) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel('links:' + userId, { config: { private: true } })
        .on('broadcast', { event: 'INSERT' }, () => { refresh(); })
        .on('broadcast', { event: 'UPDATE' }, () => { refresh(); })
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, userId, isMockMode, refresh]);

  return { patients, pendingLinks, incomingRequests, loading, error, refresh };
}
