import { computeAdherenceSummary } from '../adherence';
import { MedicationReminder } from '../../types/database';

function med(partial: Partial<MedicationReminder>): MedicationReminder {
  return {
    id: 'm',
    user_id: 'u',
    medication_name: 'Med',
    dosage: '10mg',
    frequency: 'daily',
    reminder_times: ['08:00'],
    instructions: '',
    is_active: true,
    taken_today: [],
    streak_days: 0,
    created_at: '',
    updated_at: '',
    ...partial,
  };
}

describe('computeAdherenceSummary', () => {
  it('excludes inactive reminders', () => {
    const r = computeAdherenceSummary([
      med({ id: 'a', is_active: true }),
      med({ id: 'b', is_active: false }),
    ]);
    expect(r.activeCount).toBe(1);
    expect(r.items).toHaveLength(1);
  });

  it('computes per-med percent today from taken vs expected', () => {
    const r = computeAdherenceSummary([
      med({
        id: 'a',
        frequency: 'twice_daily',
        reminder_times: ['08:00', '20:00'],
        taken_today: ['2026-04-10T08:02:00Z'],
      }),
    ]);
    expect(r.items[0].dosesExpectedToday).toBe(2);
    expect(r.items[0].dosesTakenToday).toBe(1);
    expect(r.items[0].todayPercent).toBe(50);
  });

  it('uses reminder_times length when frequency is daily', () => {
    const r = computeAdherenceSummary([
      med({
        id: 'a',
        frequency: 'daily',
        reminder_times: ['08:00'],
        taken_today: ['2026-04-10T08:01:00Z'],
      }),
    ]);
    expect(r.items[0].todayPercent).toBe(100);
  });

  it('as_needed and weekly meds are excluded from daily % but still appear in items', () => {
    const r = computeAdherenceSummary([
      med({ id: 'a', frequency: 'as_needed', reminder_times: [], taken_today: [] }),
      med({ id: 'b', frequency: 'weekly', reminder_times: ['08:00'], taken_today: [] }),
      med({ id: 'c', frequency: 'daily', reminder_times: ['08:00'], taken_today: ['x'] }),
    ]);
    expect(r.items).toHaveLength(3);
    expect(r.overallPercentToday).toBe(100); // only the daily one counts, and it's 100
  });

  it('overall is 100 when there are no daily items', () => {
    const r = computeAdherenceSummary([
      med({ frequency: 'weekly', reminder_times: ['08:00'], taken_today: [] }),
    ]);
    expect(r.overallPercentToday).toBe(100);
  });

  it('averages across multiple daily meds', () => {
    const r = computeAdherenceSummary([
      med({ id: 'a', frequency: 'daily', reminder_times: ['08:00'], taken_today: ['x'] }), // 100
      med({
        id: 'b',
        frequency: 'twice_daily',
        reminder_times: ['08:00', '20:00'],
        taken_today: [],
      }), // 0
    ]);
    expect(r.overallPercentToday).toBe(50);
  });
});
