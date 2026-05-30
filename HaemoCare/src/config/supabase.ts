import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store has no web implementation. Using it on web throws every
// auto-refresh tick (~30s). Fall back to localStorage on web; SecureStore on native.
const isWeb = Platform.OS === 'web';

const webStorageAdapter = {
  getItem: (key: string) =>
    Promise.resolve(typeof window !== 'undefined' ? window.localStorage.getItem(key) : null),
  setItem: (key: string, value: string) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
    return Promise.resolve();
  },
};

const nativeStorageAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: isWeb ? webStorageAdapter : nativeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // Web only: parse `#access_token=...&type=recovery` from the URL when
    // the user lands here from a Supabase password-reset email. Triggers
    // the PASSWORD_RECOVERY auth event which AuthContext routes to the
    // reset screen. No effect on native (URL parsing happens via Linking).
    detectSessionInUrl: isWeb,
  },
});

// Pause the auth auto-refresh timer when the app is in the background and
// resume it on foreground. Without this, supabase-js's refresh tick keeps
// firing during suspension and can race the React Native bridge during
// deep-link resumption — RCTNetworking's HTTP handler hasn't been
// re-registered yet, so the fetch crashes with
// "No suitable URL request handler found for https://<project>.supabase.co/
//  auth/v1/token?grant_type=refresh_token".
// This is the canonical Supabase RN recipe; native-only because AppState
// is a no-op on web (the browser handles tab visibility itself).
if (!isWeb) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
