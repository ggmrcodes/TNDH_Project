import {
  computeOverdueState,
  applyBump,
  GRACE_DAYS,
  TIER_1_MAX,
  OUTCOME_LADDER,
} from '../overdueVisit';
import type { Profile, Transfusion, Appointment } from '../../types/database';

// Helpers to keep test fixtures tiny and explicit.
const profile = (intervalDays = 28): Pick<Profile, 'recommended_visit_interval_days'> => ({
  recommended_visit_interval_days: intervalDays,
});

const tx = (date: string): Pick<Transfusion, 'date'> => ({ date });

const appt = (scheduled_date: string): Pick<Appointment, 'scheduled_date'> => ({
  scheduled_date,
});

const TODAY = new Date('2026-05-12T12:00:00Z');

describe('OUTCOME_LADDER', () => {
  it('orders normal < monitor < urgent', () => {
    expect(OUTCOME_LADDER).toEqual(['normal', 'monitor', 'urgent']);
  });
});

describe('applyBump', () => {
  it('returns input unchanged when bumpTiers = 0', () => {
    expect(applyBump('normal', 0)).toBe('normal');
    expect(applyBump('monitor', 0)).toBe('monitor');
    expect(applyBump('urgent', 0)).toBe('urgent');
  });

  it('bumps one tier with bumpTiers = 1', () => {
    expect(applyBump('normal', 1)).toBe('monitor');
    expect(applyBump('monitor', 1)).toBe('urgent');
    expect(applyBump('urgent', 1)).toBe('urgent'); // cap
  });

  it('bumps two tiers with bumpTiers = 2', () => {
    expect(applyBump('normal', 2)).toBe('urgent');
    expect(applyBump('monitor', 2)).toBe('urgent'); // capped
    expect(applyBump('urgent', 2)).toBe('urgent'); // cap
  });
});

describe('computeOverdueState — empty data', () => {
  it('returns not-overdue when patient has no transfusions and no appointments', () => {
    const state = computeOverdueState({
      profile: profile(),
      mostRecentTransfusion: null,
      mostRecentPastAppointment: null,
      today: TODAY,
    });
    expect(state.isOverdue).toBe(false);
  });
});

describe('computeOverdueState — cadence path only', () => {
  it('returns not-overdue inside the grace period (N <= 7)', () => {
    const state = computeOverdueState({
      profile: profile(28),
      mostRecentTransfusion: tx('2026-04-10T10:00:00Z'),
      mostRecentPastAppointment: null,
      today: TODAY,
    });
    expect(state.isOverdue).toBe(false);
  });

  it('returns tier-1 bump on day 8 (boundary)', () => {
    const state = computeOverdueState({
      profile: profile(28),
      mostRecentTransfusion: tx('2026-04-06T12:00:00Z'),
      mostRecentPastAppointment: null,
      today: TODAY,
    });
    expect(state).toEqual(
      expect.objectContaining({
        isOverdue: true,
        daysOverdue: 8,
        bumpTiers: 1,
        sourcePath: 'cadence',
      })
    );
  });

  it('still tier-1 at day 21 (boundary upper edge)', () => {
    const state = computeOverdueState({
      profile: profile(28),
      mostRecentTransfusion: tx('2026-03-24T12:00:00Z'),
      mostRecentPastAppointment: null,
      today: TODAY,
    });
    expect(state).toEqual(
      expect.objectContaining({ isOverdue: true, daysOverdue: 21, bumpTiers: 1 })
    );
  });

  it('returns tier-2 bump on day 22 (boundary)', () => {
    const state = computeOverdueState({
      profile: profile(28),
      mostRecentTransfusion: tx('2026-03-23T12:00:00Z'),
      mostRecentPastAppointment: null,
      today: TODAY,
    });
    expect(state).toEqual(
      expect.objectContaining({ isOverdue: true, daysOverdue: 22, bumpTiers: 2 })
    );
  });

  it('uses the patient-set interval, not the 28 default', () => {
    const state = computeOverdueState({
      profile: profile(14),
      mostRecentTransfusion: tx('2026-04-17T12:00:00Z'),
      mostRecentPastAppointment: null,
      today: TODAY,
    });
    expect(state).toEqual(
      expect.objectContaining({ isOverdue: true, daysOverdue: 11, bumpTiers: 1 })
    );
  });
});

describe('computeOverdueState — appointment path only', () => {
  it('marks overdue when latest past appointment has no transfusion at/after it', () => {
    const state = computeOverdueState({
      profile: profile(),
      mostRecentTransfusion: null,
      mostRecentPastAppointment: appt('2026-05-02T09:00:00Z'),
      today: TODAY,
    });
    expect(state).toEqual(
      expect.objectContaining({
        isOverdue: true,
        daysOverdue: 10,
        bumpTiers: 1,
        sourcePath: 'appointment',
      })
    );
  });

  it('clears overdue when a transfusion was logged at/after the latest past appointment', () => {
    const state = computeOverdueState({
      profile: profile(28),
      mostRecentTransfusion: tx('2026-05-04T11:00:00Z'),
      mostRecentPastAppointment: appt('2026-05-02T09:00:00Z'),
      today: TODAY,
    });
    expect(state.isOverdue).toBe(false);
  });
});

describe('computeOverdueState — both paths', () => {
  it('uses the earlier planned date (more conservative) when both paths fire', () => {
    const state = computeOverdueState({
      profile: profile(28),
      mostRecentTransfusion: tx('2026-03-23T12:00:00Z'),
      mostRecentPastAppointment: appt('2026-05-07T09:00:00Z'),
      today: TODAY,
    });
    expect(state).toEqual(
      expect.objectContaining({
        isOverdue: true,
        daysOverdue: 22,
        bumpTiers: 2,
        sourcePath: 'cadence',
      })
    );
  });

  it('prefers the appointment sourcePath on an exact tie', () => {
    const state = computeOverdueState({
      profile: profile(28),
      mostRecentTransfusion: tx('2026-04-04T09:00:00Z'),
      mostRecentPastAppointment: appt('2026-05-02T09:00:00Z'),
      today: TODAY,
    });
    expect(state).toEqual(
      expect.objectContaining({
        isOverdue: true,
        daysOverdue: 10,
        sourcePath: 'appointment',
      })
    );
  });
});

describe('computeOverdueState — sanity', () => {
  it('exposes constants for tuning', () => {
    expect(GRACE_DAYS).toBe(7);
    expect(TIER_1_MAX).toBe(21);
  });
});
