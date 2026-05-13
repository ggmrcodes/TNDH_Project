import { computeOverdueHistory14d, OverdueHistorySlice } from '../cohortHistory';

const TODAY = new Date('2026-05-12T12:00:00Z');

describe('computeOverdueHistory14d — shape', () => {
  it('returns exactly 14 entries', () => {
    const result = computeOverdueHistory14d([], TODAY);
    expect(result).toHaveLength(14);
  });

  it('orders oldest first, today last', () => {
    const result = computeOverdueHistory14d([], TODAY);
    // First entry is today - 13 days, last is today.
    expect(result[0].date).toBe('2026-04-29');
    expect(result[13].date).toBe('2026-05-12');
  });

  it('returns zero counts for an empty cohort', () => {
    const result = computeOverdueHistory14d([], TODAY);
    for (const day of result) {
      expect(day.count).toBe(0);
    }
  });
});

describe('computeOverdueHistory14d — predicate behavior', () => {
  it('never contributes a count for a non-overdue patient', () => {
    // Patient with a recent transfusion — never overdue across the 14d window.
    const slices: OverdueHistorySlice[] = [
      {
        recommendedIntervalDays: 28,
        latestTxDate: '2026-05-12T10:00:00Z', // today
        pastApptDate: null,
      },
    ];
    const result = computeOverdueHistory14d(slices, TODAY);
    for (const day of result) {
      expect(day.count).toBe(0);
    }
  });

  it('does not contribute when slice has no tx or appt (mirrors computeOverdueState early-return)', () => {
    const slices: OverdueHistorySlice[] = [
      {
        recommendedIntervalDays: 28,
        latestTxDate: null,
        pastApptDate: null,
      },
    ];
    const result = computeOverdueHistory14d(slices, TODAY);
    for (const day of result) {
      expect(day.count).toBe(0);
    }
  });

  it('counts a long-overdue patient on every day of the window', () => {
    // Last tx way back — overdue across the entire 14d view.
    const slices: OverdueHistorySlice[] = [
      {
        recommendedIntervalDays: 28,
        latestTxDate: '2026-01-01T00:00:00Z',
        pastApptDate: null,
      },
    ];
    const result = computeOverdueHistory14d(slices, TODAY);
    for (const day of result) {
      expect(day.count).toBe(1);
    }
  });

  it('captures the day a patient crosses the overdue threshold', () => {
    // Interval 28d + grace 7d. Tx on 2026-04-06: planned date = 2026-05-04.
    // Patient becomes "overdue" once daysOverdue > 7 → on 2026-05-12 daysOverdue=8.
    // So they cross on day 2026-05-12 (today). Earlier days = 0.
    const slices: OverdueHistorySlice[] = [
      {
        recommendedIntervalDays: 28,
        latestTxDate: '2026-04-06T12:00:00Z',
        pastApptDate: null,
      },
    ];
    const result = computeOverdueHistory14d(slices, TODAY);
    // Today (last entry) should be 1, earlier days 0.
    expect(result[13]).toEqual({ date: '2026-05-12', count: 1 });
    // The day before (2026-05-11): daysOverdue = 7 → grace, not overdue.
    expect(result[12]).toEqual({ date: '2026-05-11', count: 0 });
    // All earlier days also 0.
    for (let i = 0; i < 12; i++) {
      expect(result[i].count).toBe(0);
    }
  });

  it('aggregates counts across multiple slices per day', () => {
    const slices: OverdueHistorySlice[] = [
      {
        recommendedIntervalDays: 28,
        latestTxDate: '2026-01-01T00:00:00Z', // always overdue
        pastApptDate: null,
      },
      {
        recommendedIntervalDays: 28,
        latestTxDate: '2026-01-01T00:00:00Z', // always overdue
        pastApptDate: null,
      },
      {
        recommendedIntervalDays: 28,
        latestTxDate: '2026-05-12T10:00:00Z', // never overdue
        pastApptDate: null,
      },
    ];
    const result = computeOverdueHistory14d(slices, TODAY);
    for (const day of result) {
      expect(day.count).toBe(2);
    }
  });
});
