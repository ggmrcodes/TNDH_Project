import { format } from 'date-fns';
import { computeOverdueState } from './overdueVisit';

export interface OverdueHistorySlice {
  recommendedIntervalDays: number;
  latestTxDate: string | null; // ISO
  pastApptDate: string | null; // ISO; null if none
}

export interface DailyOverdueCount {
  date: string; // ISO date (yyyy-MM-dd) for that day
  count: number;
}

const HISTORY_DAYS = 14;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * For each of the last 14 days (oldest first, today last, total 14 entries),
 * count how many slices would be overdue *as of that day* using the same
 * predicate logic as `computeOverdueState`.
 */
export function computeOverdueHistory14d(
  slices: OverdueHistorySlice[],
  today: Date
): DailyOverdueCount[] {
  const todayStart = startOfUtcDay(today);
  const out: DailyOverdueCount[] = [];

  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const day = new Date(todayStart.getTime());
    day.setUTCDate(day.getUTCDate() - i);

    let count = 0;
    for (const slice of slices) {
      // Skip slices that would have no signal at all (matches `computeOverdueState`
      // returning not-overdue when both inputs are null — saves a fn call).
      if (!slice.latestTxDate && !slice.pastApptDate) continue;

      const state = computeOverdueState({
        profile: { recommended_visit_interval_days: slice.recommendedIntervalDays },
        mostRecentTransfusion: slice.latestTxDate ? { date: slice.latestTxDate } : null,
        mostRecentPastAppointment: slice.pastApptDate
          ? { scheduled_date: slice.pastApptDate }
          : null,
        today: day,
      });
      if (state.isOverdue) count++;
    }

    out.push({
      date: format(day, 'yyyy-MM-dd'),
      count,
    });
  }

  return out;
}
