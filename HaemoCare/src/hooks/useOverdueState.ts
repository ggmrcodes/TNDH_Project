import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as realProfileService from '../services/profileService';
import * as realTransfusionService from '../services/transfusionService';
import * as realAppointmentService from '../services/appointmentService';
import * as mockServices from '../mock/services';
import { computeOverdueState, OverdueState } from '../utils/overdueVisit';

export interface UseOverdueStateResult {
  overdueState: OverdueState | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useOverdueState(): UseOverdueStateResult {
  const { user, isMockMode } = useAuth();
  const [overdueState, setOverdueState] = useState<OverdueState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      setOverdueState(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [profile, mostRecentTransfusion, mostRecentPastAppointment] = isMockMode
          ? await Promise.all([
              mockServices.getProfile(),
              mockServices.getLatestTransfusion(),
              mockServices.getMostRecentPastAppointment(userId),
            ])
          : await Promise.all([
              realProfileService.getProfile(userId),
              realTransfusionService.getLatestTransfusion(userId),
              realAppointmentService.getMostRecentPastAppointment(userId),
            ]);

        if (cancelled) return;

        if (!profile) {
          setOverdueState({ isOverdue: false });
          return;
        }

        const state = computeOverdueState({
          profile,
          mostRecentTransfusion,
          mostRecentPastAppointment,
          today: new Date(),
        });
        setOverdueState(state);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setOverdueState(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isMockMode, tick]);

  return { overdueState, loading, error, refresh };
}
