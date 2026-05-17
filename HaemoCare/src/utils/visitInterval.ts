/**
 * Visit-interval unit conversion helpers.
 *
 * The DB stores `profiles.recommended_visit_interval_days` in days (legacy schema).
 * UI surfaces speak weeks because that's how transfusion-dependent patients
 * (and clinicians) actually think about cadence — "every 4 weeks", not
 * "every 28 days". These helpers translate at the UI boundary; the storage
 * column is unchanged.
 *
 * Conventions:
 * - `weeksToDays(n)` always emits a clean multiple of 7 (`n * 7`).
 * - `daysToWeeks(n)` rounds to nearest whole week so existing non-multiple-of-7
 *   values (e.g. 21 days → 3 weeks, 14 days → 2 weeks) display sensibly.
 * - Both helpers clamp to the supported range so callers can't silently
 *   exceed the stepper bounds or the underlying day clamp (7–180).
 */

export const DAYS_PER_WEEK = 7;

// Display range presented to the user. 4 weeks (28 days) is the default —
// matches the legacy day-default and the most common Thai pilot cadence.
// 1 week (7 days) is the floor of the existing 7-day clamp; 26 weeks
// (182 days) is just above the legacy 180-day ceiling, picked because it
// rounds cleanly and matches the brief's locked decision.
export const MIN_INTERVAL_WEEKS = 1;
export const MAX_INTERVAL_WEEKS = 26;
export const DEFAULT_INTERVAL_WEEKS = 4;

/**
 * Convert a stored interval in days to whole weeks (rounded to nearest),
 * then clamp into the supported UI range. NaN / non-finite inputs fall back
 * to the default.
 */
export function daysToWeeks(days: number | null | undefined): number {
  if (days == null || !Number.isFinite(days)) return DEFAULT_INTERVAL_WEEKS;
  const raw = Math.round(days / DAYS_PER_WEEK);
  return clampWeeks(raw);
}

/**
 * Convert a UI week value to days for persistence. Always emits a clean
 * multiple of 7. Clamps the week input first so the resulting day value
 * stays inside the legacy 7–180 day range covered by the column's existing
 * validators.
 */
export function weeksToDays(weeks: number): number {
  return clampWeeks(weeks) * DAYS_PER_WEEK;
}

/** Clamp a week value into the supported UI range. */
export function clampWeeks(weeks: number): number {
  if (!Number.isFinite(weeks)) return DEFAULT_INTERVAL_WEEKS;
  if (weeks < MIN_INTERVAL_WEEKS) return MIN_INTERVAL_WEEKS;
  if (weeks > MAX_INTERVAL_WEEKS) return MAX_INTERVAL_WEEKS;
  return Math.round(weeks);
}
