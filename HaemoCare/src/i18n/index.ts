import en from './en';
import th from './th';
export type { TranslationKey } from './en';

export const translations = { en, th } as const;
export type Language = keyof typeof translations;
