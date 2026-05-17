import {
  DAYS_PER_WEEK,
  DEFAULT_INTERVAL_WEEKS,
  MAX_INTERVAL_WEEKS,
  MIN_INTERVAL_WEEKS,
  clampWeeks,
  daysToWeeks,
  weeksToDays,
} from '../visitInterval';

describe('visitInterval helpers', () => {
  describe('weeksToDays', () => {
    it('multiplies cleanly for the common cases', () => {
      expect(weeksToDays(1)).toBe(7);
      expect(weeksToDays(2)).toBe(14);
      expect(weeksToDays(4)).toBe(28); // default cadence
      expect(weeksToDays(8)).toBe(56);
    });

    it('always emits a multiple of 7', () => {
      for (let w = MIN_INTERVAL_WEEKS; w <= MAX_INTERVAL_WEEKS; w++) {
        expect(weeksToDays(w) % DAYS_PER_WEEK).toBe(0);
      }
    });

    it('clamps below the minimum to MIN_INTERVAL_WEEKS', () => {
      expect(weeksToDays(0)).toBe(MIN_INTERVAL_WEEKS * DAYS_PER_WEEK);
      expect(weeksToDays(-5)).toBe(MIN_INTERVAL_WEEKS * DAYS_PER_WEEK);
    });

    it('clamps above the maximum to MAX_INTERVAL_WEEKS', () => {
      expect(weeksToDays(MAX_INTERVAL_WEEKS + 1)).toBe(MAX_INTERVAL_WEEKS * DAYS_PER_WEEK);
      expect(weeksToDays(500)).toBe(MAX_INTERVAL_WEEKS * DAYS_PER_WEEK);
    });
  });

  describe('daysToWeeks', () => {
    it('round-trips clean multiples of 7', () => {
      expect(daysToWeeks(7)).toBe(1);
      expect(daysToWeeks(14)).toBe(2);
      expect(daysToWeeks(28)).toBe(4); // default
      expect(daysToWeeks(56)).toBe(8);
    });

    it('rounds non-multiples of 7 to the nearest whole week', () => {
      // 21 → 3 weeks per acceptance criterion
      expect(daysToWeeks(21)).toBe(3);
      // 10 days is closer to 2 weeks (14) than 1 week (7): 10/7 = 1.43 → 1
      expect(daysToWeeks(10)).toBe(1);
      // 11 days: 11/7 = 1.57 → 2
      expect(daysToWeeks(11)).toBe(2);
      // 17 days: 17/7 = 2.43 → 2
      expect(daysToWeeks(17)).toBe(2);
      // 18 days: 18/7 = 2.57 → 3
      expect(daysToWeeks(18)).toBe(3);
    });

    it('clamps tiny / huge legacy day values into the supported range', () => {
      expect(daysToWeeks(0)).toBe(MIN_INTERVAL_WEEKS); // 0/7 = 0 → clamp up
      expect(daysToWeeks(3)).toBe(MIN_INTERVAL_WEEKS); // 3/7 ≈ 0 → clamp up
      expect(daysToWeeks(365)).toBe(MAX_INTERVAL_WEEKS); // way above ceiling
    });

    it('falls back to the default for null / undefined / NaN', () => {
      expect(daysToWeeks(null)).toBe(DEFAULT_INTERVAL_WEEKS);
      expect(daysToWeeks(undefined)).toBe(DEFAULT_INTERVAL_WEEKS);
      expect(daysToWeeks(Number.NaN)).toBe(DEFAULT_INTERVAL_WEEKS);
      expect(daysToWeeks(Number.POSITIVE_INFINITY)).toBe(DEFAULT_INTERVAL_WEEKS);
    });
  });

  describe('clampWeeks', () => {
    it('passes valid values through (rounded)', () => {
      expect(clampWeeks(4)).toBe(4);
      expect(clampWeeks(4.4)).toBe(4);
      expect(clampWeeks(4.6)).toBe(5);
    });

    it('clamps to MIN / MAX', () => {
      expect(clampWeeks(-1)).toBe(MIN_INTERVAL_WEEKS);
      expect(clampWeeks(0)).toBe(MIN_INTERVAL_WEEKS);
      expect(clampWeeks(MAX_INTERVAL_WEEKS + 10)).toBe(MAX_INTERVAL_WEEKS);
    });

    it('falls back to the default for non-finite inputs', () => {
      expect(clampWeeks(Number.NaN)).toBe(DEFAULT_INTERVAL_WEEKS);
      expect(clampWeeks(Number.POSITIVE_INFINITY)).toBe(DEFAULT_INTERVAL_WEEKS);
    });
  });

  describe('round-trip behaviour', () => {
    it('weeksToDays → daysToWeeks is the identity inside the range', () => {
      for (let w = MIN_INTERVAL_WEEKS; w <= MAX_INTERVAL_WEEKS; w++) {
        expect(daysToWeeks(weeksToDays(w))).toBe(w);
      }
    });
  });
});
