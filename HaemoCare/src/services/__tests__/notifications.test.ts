/**
 * Tests for the medication-reminder notification scheduling logic.
 * Mocks expo-notifications to verify scheduling/cancellation behavior
 * without touching native modules.
 */

// jest's mock-factory hoists above imports and disallows out-of-scope refs,
// except for names prefixed with "mock". Hence mockScheduled / mockNextId.
type ScheduledFake = { identifier: string; content: { data?: any } };

const mockScheduled: ScheduledFake[] = [];
const mockState = { nextId: 1 };

jest.mock('expo-notifications', () => {
  return {
    __esModule: true,
    SchedulableTriggerInputTypes: {
      CALENDAR: 'calendar',
      DAILY: 'daily',
      WEEKLY: 'weekly',
      MONTHLY: 'monthly',
      YEARLY: 'yearly',
      DATE: 'date',
      TIME_INTERVAL: 'timeInterval',
    },
    AndroidImportance: { HIGH: 4, DEFAULT: 3 },
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, canAskAgain: false }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    scheduleNotificationAsync: jest.fn(async ({ content }: any) => {
      const id = `n-${mockState.nextId++}`;
      mockScheduled.push({ identifier: id, content });
      return id;
    }),
    cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
      const idx = mockScheduled.findIndex(s => s.identifier === id);
      if (idx >= 0) mockScheduled.splice(idx, 1);
    }),
    getAllScheduledNotificationsAsync: jest.fn(async () => mockScheduled.map(s => ({ ...s }))),
  };
});

import {
  nextDailyFireDates,
  nextWeeklyFireDates,
  rehydrateFromSchedule,
  scheduleReminder,
  cancelReminder,
  REHYDRATE_DAYS,
} from '../notifications';
import type { MedicationReminder } from '../../types/database';

function med(partial: Partial<MedicationReminder>): MedicationReminder {
  return {
    id: 'm1',
    user_id: 'u1',
    medication_name: 'Deferasirox',
    dosage: '500mg',
    frequency: 'daily',
    reminder_times: ['08:00'],
    instructions: '',
    is_active: true,
    taken_today: [],
    streak_days: 0,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    ...partial,
  };
}

function strings() {
  return { title: 'Time to take', body: 'Take it' };
}

beforeEach(() => {
  mockScheduled.length = 0;
  mockState.nextId = 1;
});

describe('nextDailyFireDates', () => {
  it('schedules N future days when starting before today\'s time', () => {
    // 06:00 local; reminder at 08:00 so today is included
    const now = new Date(2026, 4, 17, 6, 0, 0);
    const fires = nextDailyFireDates('08:00', now, 14);
    expect(fires).toHaveLength(14);
    expect(fires[0].getDate()).toBe(17);
    expect(fires[0].getHours()).toBe(8);
    expect(fires[1].getDate()).toBe(18);
  });

  it('skips today when the time has already passed', () => {
    const now = new Date(2026, 4, 17, 10, 0, 0);
    const fires = nextDailyFireDates('08:00', now, 14);
    expect(fires).toHaveLength(14);
    expect(fires[0].getDate()).toBe(18);
    expect(fires[fires.length - 1].getDate()).toBe(31);
  });

  it('returns empty on malformed time', () => {
    const now = new Date(2026, 4, 17, 6, 0, 0);
    expect(nextDailyFireDates('not-a-time', now, 14)).toEqual([]);
  });
});

describe('nextWeeklyFireDates', () => {
  it('returns weekly future occurrences', () => {
    const now = new Date(2026, 4, 17, 10, 0, 0); // past 08:00 today
    const fires = nextWeeklyFireDates('08:00', now, 14);
    expect(fires.length).toBeGreaterThanOrEqual(2);
    // First occurrence is next week's same wall-clock day
    expect(fires[1].getTime() - fires[0].getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('scheduleReminder', () => {
  it('skips as_needed frequency', async () => {
    const ids = await scheduleReminder({ reminder: med({ frequency: 'as_needed' }), strings: strings() });
    expect(ids).toEqual([]);
  });

  it('skips inactive reminders', async () => {
    const ids = await scheduleReminder({ reminder: med({ is_active: false }), strings: strings() });
    expect(ids).toEqual([]);
  });

  it('schedules a notification per time slot per day for daily meds', async () => {
    const now = new Date(2026, 4, 17, 6, 0, 0);
    const r = med({ frequency: 'twice_daily', reminder_times: ['08:00', '20:00'] });
    const ids = await scheduleReminder({ reminder: r, strings: strings(), now, days: 3 });
    expect(ids).toHaveLength(6);
  });

  it('embeds the reminder identifier in notification data', async () => {
    const now = new Date(2026, 4, 17, 6, 0, 0);
    await scheduleReminder({ reminder: med({ id: 'abc' }), strings: strings(), now, days: 1 });
    expect(mockScheduled[0].content.data.reminderId).toBe('abc');
    expect(mockScheduled[0].content.data.kind).toBe('medication-reminder');
  });
});

describe('rehydrateFromSchedule', () => {
  it('is idempotent — running twice produces the same end state with no duplicates', async () => {
    const now = new Date(2026, 4, 17, 6, 0, 0);
    const reminders = [med({ id: 'a', reminder_times: ['08:00'] })];
    const r1 = await rehydrateFromSchedule(reminders, { now, days: 5, buildStrings: () => strings() });
    expect(r1.scheduledCount).toBe(5);
    expect(mockScheduled).toHaveLength(5);

    const r2 = await rehydrateFromSchedule(reminders, { now, days: 5, buildStrings: () => strings() });
    expect(r2.cancelledCount).toBe(5);
    expect(r2.scheduledCount).toBe(5);
    expect(mockScheduled).toHaveLength(5);
  });

  it('cancels removed reminders on the next rehydrate', async () => {
    const now = new Date(2026, 4, 17, 6, 0, 0);
    const a = med({ id: 'a', reminder_times: ['08:00'] });
    const b = med({ id: 'b', reminder_times: ['12:00'] });
    await rehydrateFromSchedule([a, b], { now, days: 3, buildStrings: () => strings() });
    expect(mockScheduled).toHaveLength(6);
    // Drop reminder 'b'
    const after = await rehydrateFromSchedule([a], { now, days: 3, buildStrings: () => strings() });
    expect(after.scheduledCount).toBe(3);
    expect(mockScheduled).toHaveLength(3);
    for (const s of mockScheduled) expect(s.content.data.reminderId).toBe('a');
  });

  it('handles edits — changed reminder_times produces only new schedules', async () => {
    const now = new Date(2026, 4, 17, 6, 0, 0);
    const a = med({ id: 'a', reminder_times: ['08:00'] });
    await rehydrateFromSchedule([a], { now, days: 3, buildStrings: () => strings() });
    expect(mockScheduled).toHaveLength(3);

    // Patient edits to twice daily
    const aEdited = med({ id: 'a', reminder_times: ['08:00', '20:00'] });
    await rehydrateFromSchedule([aEdited], { now, days: 3, buildStrings: () => strings() });
    expect(mockScheduled).toHaveLength(6);
  });

  it('leaves non-medication mockScheduled notifications alone', async () => {
    // Simulate an unrelated mockScheduled notification.
    mockScheduled.push({ identifier: 'foreign-1', content: { data: { kind: 'something-else' } } });
    const now = new Date(2026, 4, 17, 6, 0, 0);
    await rehydrateFromSchedule([med({ id: 'a' })], { now, days: 2, buildStrings: () => strings() });
    expect(mockScheduled.find(s => s.identifier === 'foreign-1')).toBeDefined();
  });
});

describe('cancelReminder', () => {
  it('removes only notifications matching the given reminder id', async () => {
    const now = new Date(2026, 4, 17, 6, 0, 0);
    await scheduleReminder({ reminder: med({ id: 'a' }), strings: strings(), now, days: 2 });
    await scheduleReminder({ reminder: med({ id: 'b' }), strings: strings(), now, days: 2 });
    expect(mockScheduled).toHaveLength(4);
    const count = await cancelReminder('a');
    expect(count).toBe(2);
    expect(mockScheduled).toHaveLength(2);
    for (const s of mockScheduled) expect(s.content.data.reminderId).toBe('b');
  });
});

describe('REHYDRATE_DAYS', () => {
  it('is 14 days per brief', () => {
    expect(REHYDRATE_DAYS).toBe(14);
  });
});
