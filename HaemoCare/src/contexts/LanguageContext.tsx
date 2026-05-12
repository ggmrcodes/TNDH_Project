import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { translations, Language, TranslationKey } from '../i18n';
import { useAuth } from './AuthContext';
import { supabase } from '../config/supabase';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { profile, user } = useAuth();
  const [language, setLanguageState] = useState<Language>(
    (profile?.language_preference as Language) || 'th'
  );

  useEffect(() => {
    if (profile?.language_preference) {
      setLanguageState(profile.language_preference as Language);
    }
  }, [profile?.language_preference]);

  const setLanguage = useCallback(
    (lang: Language) => {
      setLanguageState(lang);
      if (user) {
        supabase
          .from('profiles')
          .update({ language_preference: lang })
          .eq('user_id', user.id)
          .then(() => {});
      }
    },
    [user]
  );

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      let str = translations[language][key] || key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replaceAll(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [language]
  );

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
