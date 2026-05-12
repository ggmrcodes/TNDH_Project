import { MedicationReminder } from '../types/database';

export interface MedicationAdherence {
  medicationId: string;
  medicationName: string;
  dosesExpectedToday: number;
  dosesTakenToday: number;
  todayPercent: number;
  streakDays: number;
}

export interface AdherenceSummary {
  items: MedicationAdherence[];
  overallPercentToday: number;
  activeCount: number;
}

const FREQUENCY_DOSES_PER_DAY: Record<MedicationReminder['frequency'], number | null> = {
  daily: 1,
  twice_daily: 2,
  three_times: 3,
  weekly: null, // not daily — excluded from today's %
  as_needed: null,
};

function dosesExpectedToday(r: MedicationReminder): number {
  const fromFreq = FREQUENCY_DOSES_PER_DAY[r.frequency];
  if (fromFreq == null) return 0;
  return r.reminder_times.length > 0 ? r.reminder_times.length : fromFreq;
}

/**
 * Computes per-medication and overall today-adherence from the existing
 * MedicationReminder shape. "As needed" and "weekly" are excluded from the daily %.
 */
export function computeAdherenceSummary(reminders: MedicationReminder[]): AdherenceSummary {
  const active = reminders.filter(r => r.is_active);
  const items: MedicationAdherence[] = active.map(r => {
    const expected = dosesExpectedToday(r);
    const taken = Math.min(r.taken_today.length, Math.max(expected, r.taken_today.length));
    const pct = expected > 0 ? Math.round((taken / expected) * 100) : 100;
    return {
      medicationId: r.id,
      medicationName: r.medication_name,
      dosesExpectedToday: expected,
      dosesTakenToday: taken,
      todayPercent: pct,
      streakDays: r.streak_days,
    };
  });

  const dailyItems = items.filter(i => i.dosesExpectedToday > 0);
  const overall =
    dailyItems.length === 0
      ? 100
      : Math.round(
          dailyItems.reduce((sum, i) => sum + i.todayPercent, 0) / dailyItems.length
        );

  return {
    items,
    overallPercentToday: overall,
    activeCount: active.length,
  };
}
