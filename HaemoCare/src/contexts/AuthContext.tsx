import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';
import { Profile } from '../types/database';
import { MOCK_PROFILE, MOCK_USER_ID } from '../mock/data';
import { MOCK_CLINICIAN_PROFILE, MOCK_CLINICIAN_USER_ID } from '../mock/clinicianData';
import type { ClinicianProfile } from '../types/database';

const MOCK_EMAIL = 'demo@haemocare.app';
const MOCK_PASSWORD = 'HaemoDemo2024';
const MOCK_CLINICIAN_EMAIL = 'demo-doctor@haemocare.app';
const MOCK_CLINICIAN_PASSWORD = 'HaemoDoc2024';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isProfileComplete: boolean;
  isPdpaConsented: boolean;
  isMockMode: boolean;
  role: 'patient' | 'clinician' | null;
  clinicianProfile: ClinicianProfile | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setPdpaConsent: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMockMode, setIsMockMode] = useState(false);
  const [clinicianProfile, setClinicianProfile] = useState<ClinicianProfile | null>(null);

  const isMockModeRef = useRef(isMockMode);
  useEffect(() => { isMockModeRef.current = isMockMode; }, [isMockMode]);

  const role: 'patient' | 'clinician' | null =
    clinicianProfile ? 'clinician' : profile ? 'patient' : null;

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      setProfile(null);
      return;
    }
    setProfile(data as Profile);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (isMockMode) {
      setProfile({ ...MOCK_PROFILE });
      return;
    }
    if (user) {
      await fetchProfile(user.id);
    }
  }, [user, fetchProfile, isMockMode]);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          fetchProfile(s.user.id).finally(() => setIsLoading(false));
        } else {
          setIsLoading(false);
        }
      })
      .catch(() => {
        setIsLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      if (isMockModeRef.current) return; // Don't let real auth events disturb mock sessions.
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, isMockMode]);

  const isProfileComplete = !!(profile && profile.full_name.trim().length > 0);
  const isPdpaConsented = !!(profile && profile.pdpa_consented);

  const setPdpaConsent = useCallback(async () => {
    const now = new Date().toISOString();
    if (isMockMode) {
      setProfile(prev => prev ? { ...prev, pdpa_consented: true, pdpa_consented_at: now } : prev);
      return;
    }
    if (user) {
      await supabase
        .from('profiles')
        .update({ pdpa_consented: true, pdpa_consented_at: now })
        .eq('user_id', user.id);
      await fetchProfile(user.id);
    }
  }, [user, isMockMode, fetchProfile]);

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    // Mock mode: accept clinician demo credentials
    if (email.trim().toLowerCase() === MOCK_CLINICIAN_EMAIL && password === MOCK_CLINICIAN_PASSWORD) {
      setIsMockMode(true);
      setUser({ id: MOCK_CLINICIAN_USER_ID, email: MOCK_CLINICIAN_EMAIL } as User);
      setClinicianProfile(MOCK_CLINICIAN_PROFILE);
      setProfile(null);
      return {};
    }

    // Mock mode: accept demo credentials
    if (email.trim().toLowerCase() === MOCK_EMAIL && password === MOCK_PASSWORD) {
      setIsMockMode(true);
      setUser({ id: MOCK_USER_ID, email: MOCK_EMAIL } as User);
      setProfile({ ...MOCK_PROFILE });
      setClinicianProfile(null);
      return {};
    }

    // Real Supabase auth
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  };

  const signUp = async (email: string, password: string): Promise<{ error?: string }> => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    return {};
  };

  const signOut = async () => {
    if (isMockMode) {
      setIsMockMode(false);
      setUser(null);
      setProfile(null);
      setSession(null);
      setClinicianProfile(null);
      return;
    }
    await supabase.auth.signOut();
    setProfile(null);
    setClinicianProfile(null);
    setIsMockMode(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isLoading,
        isProfileComplete,
        isPdpaConsented,
        isMockMode,
        role,
        clinicianProfile,
        signIn,
        signUp,
        signOut,
        refreshProfile,
        setPdpaConsent,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
