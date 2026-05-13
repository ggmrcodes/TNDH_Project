import type { TranslationKey } from '../i18n';
import type { EmergencyContext } from '../types/database';

export interface BuildSmsBodyArgs {
  context: EmergencyContext;
  patientName: string;
  daysOverdue?: number;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export function buildSmsBody(args: BuildSmsBodyArgs): string {
  switch (args.context) {
    case 'sos':
      return args.t('emergency.body.sos' as TranslationKey, { name: args.patientName });
    case 'urgent_symptom':
      return args.t('emergency.body.urgentSymptom' as TranslationKey, { name: args.patientName });
    case 'overdue':
      return args.t('emergency.body.overdue' as TranslationKey, {
        name: args.patientName,
        days: args.daysOverdue ?? 0,
      });
  }
}

export function digitsOnly(input: string): string {
  return (input || '').replace(/\D/g, '');
}

export function isValidPhone(input: string): boolean {
  return digitsOnly(input).length >= 9;
}
