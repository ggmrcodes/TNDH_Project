import { useCallback, useEffect, useState } from 'react';
import * as Application from 'expo-application';
import { fetchReleaseManifest } from '../services/updateManifestService';
import { evaluateUpdateStatus, type UpdateStatus } from '../utils/updateCheck';

export interface UseNativeUpdateCheckResult {
  status: UpdateStatus | null;
  loading: boolean;
  error: Error | null;
  lastCheckedAt: Date | null;
  check: () => void;
}

/**
 * Polls the release manifest on mount and exposes a manual `check()` action.
 * `status` is null while the first fetch is in flight; after the first resolution
 * it stays populated (even on error) so the UI can show a stable state.
 */
export function useNativeUpdateCheck(): UseNativeUpdateCheckResult {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  const check = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const installed = Application.nativeApplicationVersion;
        const manifest = await fetchReleaseManifest();
        if (cancelled) return;
        setStatus(evaluateUpdateStatus(installed, manifest));
        setLastCheckedAt(new Date());
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        // Keep status as-is on error so a stale-but-known state still renders.
        setLastCheckedAt(new Date());
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  return { status, loading, error, lastCheckedAt, check };
}
