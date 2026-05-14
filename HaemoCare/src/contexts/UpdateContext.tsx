import React, { createContext, useContext, ReactNode } from 'react';
import { useNativeUpdateCheck, type UseNativeUpdateCheckResult } from '../hooks/useNativeUpdateCheck';

const UpdateContext = createContext<UseNativeUpdateCheckResult | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const value = useNativeUpdateCheck();
  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useUpdateContext(): UseNativeUpdateCheckResult {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error('useUpdateContext must be used within UpdateProvider');
  return ctx;
}
