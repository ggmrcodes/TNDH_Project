// src/hooks/useHospitals.ts
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as realService from '../services/hospitalService';
import * as mockService from '../mock/services';
import type { Hospital } from '../types/database';

let cachedMockHospitals: Hospital[] | null = null;
let cachedRealHospitals: Hospital[] | null = null;

export interface UseHospitalsResult {
  hospitals: Hospital[];
  loading: boolean;
}

export function useHospitals(): UseHospitalsResult {
  const { isMockMode } = useAuth();
  const [hospitals, setHospitals] = useState<Hospital[]>(
    () => (isMockMode ? cachedMockHospitals : cachedRealHospitals) ?? []
  );
  const [loading, setLoading] = useState(
    () => (isMockMode ? cachedMockHospitals : cachedRealHospitals) === null
  );

  useEffect(() => {
    const cached = isMockMode ? cachedMockHospitals : cachedRealHospitals;
    if (cached !== null) {
      setHospitals(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = isMockMode
          ? await mockService.getHospitals()
          : await realService.getHospitals();
        if (!cancelled) {
          if (isMockMode) cachedMockHospitals = data;
          else cachedRealHospitals = data;
          setHospitals(data);
        }
      } catch {
        if (!cancelled) setHospitals([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isMockMode]);

  return { hospitals, loading };
}
