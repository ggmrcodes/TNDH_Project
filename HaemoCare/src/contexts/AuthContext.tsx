import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
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
  signUpClinician: (input: {
    email: string;
    password: string;
    fullName: string;
    licenseNumber: string;
    hospitalAffiliation: string;
  }) => Promise<{ error?: string }>;
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

  const fetchClinicianProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('clinician_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) {
      setClinicianProfile(null);
      return;
    }
    // Keep unverified rows in state so AppNavigator can route them to the
    // pending-verification screen. Consumers that need verified-only behavior
    // must check `clinicianProfile.verified` themselves.
    setClinicianProfile(data as ClinicianProfile);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (isMockMode) {
      if (clinicianProfile) {
        setClinicianProfile({ ...MOCK_CLINICIAN_PROFILE });
      } else {
        setProfile({ ...MOCK_PROFILE });
      }
      return;
    }
    if (user) {
      await Promise.all([fetchProfile(user.id), fetchClinicianProfile(user.id)]);
    }
  }, [user, fetchProfile, fetchClinicianProfile, isMockMode, clinicianProfile]);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          Promise.all([fetchProfile(s.user.id), fetchClinicianProfile(s.user.id)])
            .finally(() => setIsLoading(false));
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
        fetchClinicianProfile(s.user.id);
      } else {
        setProfile(null);
        setClinicianProfile(null);
      }
    });

    return () => subscription.unsubscribe();
    // Bootstrap should only run once on mount. The handler reads
    // `isMockModeRef.current` so it doesn't need to re-subscribe when mock
    // mode toggles — listing `isMockMode` here caused getSession to re-run
    // on every mock-mode flip, which wiped the just-set mock user.
  }, [fetchProfile, fetchClinicianProfile]);

  // Localhost web-only dev convenience: auto-sign-in as the mock clinician
  // so testing post-auth flows (dashboard layouts, clinician-only screens)
  // doesn't require typing demo credentials on every page reload. Guarded by
  // a hostname check — production deploys (haemocare.pages.dev,
  // expo.haemocare.app, EAS APK) never satisfy this, so users there still
  // see the real login screen.
  useEffect(() => {
    if (isLoading || user || isMockMode) return;
    // Native runtimes (iOS/Android/Hermes) expose `window` as a polyfill
    // global without `.location`, so `typeof window === 'undefined'` is
    // false and the hostname read below would crash. Gate on
    // Platform.OS === 'web' first.
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined' || !window.location) return;
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return;
    // Allow ?as=patient to sign in as the demo patient instead of clinician,
    // so post-auth patient flows can be exercised without typing creds.
    const asRole = new URLSearchParams(window.location.search).get('as');
    setIsMockMode(true);
    if (asRole === 'patient') {
      setUser({ id: MOCK_USER_ID, email: MOCK_EMAIL } as User);
      setProfile({ ...MOCK_PROFILE });
      setClinicianProfile(null);
    } else {
      setUser({ id: MOCK_CLINICIAN_USER_ID, email: MOCK_CLINICIAN_EMAIL } as User);
      setClinicianProfile(MOCK_CLINICIAN_PROFILE);
      setProfile(null);
    }
  }, [isLoading, user, isMockMode]);

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

  const signUpClinician = async (input: {
    email: string;
    password: string;
    fullName: string;
    licenseNumber: string;
    hospitalAffiliation: string;
  }): Promise<{ error?: string }> => {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
    });
    if (error) return { error: error.message };

    // signUp only returns a session when Supabase autoconfirm is enabled.
    // If it's disabled, we cannot insert under RLS (auth.uid() is null until
    // the user confirms and signs in). In that case the profile row is created
    // on first authenticated session via a fallback path — but the simple
    // path (autoconfirm on) is the current production state, so we insert here.
    const newUserId = data.user?.id;
    if (!newUserId) {
      // No user returned — surface a generic error.
      return { error: 'Account created, but we could not save your clinician details. Please contact support.' };
    }

    const { error: insertError } = await supabase.from('clinician_profiles').insert({
      user_id: newUserId,
      full_name: input.fullName,
      license_number: input.licenseNumber,
      hospital_affiliation: input.hospitalAffiliation,
      verified: false,
    });
    if (insertError) {
      return { error: 'Account created, but we could not save your clinician details. Please contact support.' };
    }
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
        signUpClinician,
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
