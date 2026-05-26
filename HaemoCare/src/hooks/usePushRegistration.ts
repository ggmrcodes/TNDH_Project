/**
 * Registers the device's Expo push token once per authenticated session,
 * for both patient and clinician roles.
 *
 * Call this hook near the top of AppNavigator so it runs for every
 * authenticated user regardless of role.
 *
 * Guards:
 *  - Mock mode: no-op (avoids hitting Supabase with a fake userId).
 *  - Web: registerPushToken returns early internally.
 *  - No user: no-op.
 * Re-runs whenever userId changes (i.e. on sign-in / sign-out / switch).
 */

import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { registerPushToken } from '../services/notifications';

export function usePushRegistration(): void {
  const { user, isMockMode } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId || isMockMode) return;
    // Fire-and-forget — non-fatal if it fails.
    registerPushToken(userId);
  }, [userId]);
}
