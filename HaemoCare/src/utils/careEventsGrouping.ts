import {
  addDays,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { CareEvent } from './careEventsTimeline';
import type { Transfusion } from '../types/database';

export type DayOutcome = 'urgent' | 'monitor' | 'normal' | null;

export interface DayGroup {
  /** YYYY-MM-DD (UTC) — stable identifier and sort key. */
  dayKey: string;
  /** ISO of the first event on this day — used for display formatting. */
  date: string;
  events: CareEvent[];
  /** Worst symptom outcome on this day; null when no symptom logs. */
  worstOutcome: DayOutcome;
  hasTransfusion: boolean;
  hasAppointment: boolean;
  hasUrgentLog: boolean;
  symptomLogCount: number;
  normalLogCount: number;
}

export interface TimelineFilters {
  /** When false, hides outcome==='normal' symptom logs from the visible list. */
  showNormals: boolean;
  /** When true, hides everything except urgent symptom logs. */
  urgentOnly: boolean;
  /** Days back from `today` that the strip + body cover. */
  windowDays: number;
}

export interface HbDelta {
  pre: number;
  post: number;
  /** post - pre, rounded to one decimal. */
  delta: number;
}

export interface StripCell {
  dayKey: string;
  date: string;
  hasTransfusion: boolean;
  hasAppointment: boolean;
  worstOutcome: DayOutcome;
  isToday: boolean;
}

const OUTCOME_RANK: Record<'normal' | 'monitor' | 'urgent', number> = {
  normal: 0,
  monitor: 1,
  urgent: 2,
};

function ymdUtc(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function groupEventsByDay(events: CareEvent[]): DayGroup[] {
  const byKey = new Map<string, DayGroup>();
  for (const ev of events) {
    const key = ymdUtc(ev.date);
    let grp = byKey.get(key);
    if (!grp) {
      grp = {
        dayKey: key,
        date: ev.date,
        events: [],
        worstOutcome: null,
        hasTransfusion: false,
        hasAppointment: false,
        hasUrgentLog: false,
        symptomLogCount: 0,
        normalLogCount: 0,
      };
      byKey.set(key, grp);
    }
    grp.events.push(ev);
    if (ev.kind === 'transfusion') grp.hasTransfusion = true;
    if (ev.kind === 'appointment') grp.hasAppointment = true;
    if (ev.kind === 'symptom_log' && ev.log) {
      grp.symptomLogCount += 1;
      const o = ev.log.outcome;
      if (o === 'urgent') grp.hasUrgentLog = true;
      if (o === 'normal') grp.normalLogCount += 1;
      const cur = grp.worstOutcome ? OUTCOME_RANK[grp.worstOutcome] : -1;
      if (OUTCOME_RANK[o] > cur) grp.worstOutcome = o;
    }
  }
  return [...byKey.values()].sort((a, b) =>
    a.dayKey < b.dayKey ? 1 : a.dayKey > b.dayKey ? -1 : 0
  );
}

export function applyTimelineFilters(
  events: CareEvent[],
  filters: TimelineFilters,
  today: Date
): CareEvent[] {
  const cutoffMs = today.getTime() - filters.windowDays * 24 * 60 * 60 * 1000;
  return events.filter((ev) => {
    if (new Date(ev.date).getTime() < cutoffMs) return false;
    if (filters.urgentOnly) {
      return ev.kind === 'symptom_log' && ev.log?.outcome === 'urgent';
    }
    if (!filters.showNormals) {
      if (ev.kind === 'symptom_log' && ev.log?.outcome === 'normal') return false;
    }
    return true;
  });
}

export function computeHbDelta(
  tx: Pick<Transfusion, 'pre_hb_g_dl' | 'post_hb_g_dl'>
): HbDelta | null {
  if (tx.pre_hb_g_dl == null || tx.post_hb_g_dl == null) return null;
  const raw = tx.post_hb_g_dl - tx.pre_hb_g_dl;
  return {
    pre: tx.pre_hb_g_dl,
    post: tx.post_hb_g_dl,
    delta: Math.round(raw * 10) / 10,
  };
}

/** Count in-window normal-outcome logs that are hidden by the current filters. */
export function countHiddenNormalLogs(
  events: CareEvent[],
  filters: TimelineFilters,
  today: Date
): number {
  if (filters.showNormals && !filters.urgentOnly) return 0;
  const cutoffMs = today.getTime() - filters.windowDays * 24 * 60 * 60 * 1000;
  let n = 0;
  for (const ev of events) {
    if (new Date(ev.date).getTime() < cutoffMs) continue;
    if (ev.kind === 'symptom_log' && ev.log?.outcome === 'normal') n += 1;
  }
  return n;
}

/**
 * Build a fixed-length array of N strip cells, oldest → newest, covering
 * the most recent `windowDays`. Used to paint the at-a-glance mini strip
 * at the top of the timeline card.
 */
// ─── Monthly-grid calendar widget ─────────────────────────────────────
// Calendar cells are indexed by LOCAL date (the clinician's wall-clock day),
// not UTC, because that's how every calendar UI in the world reads. Pure
// UTC keys (used by buildStripCells / groupEventsByDay) would mis-bucket
// any event logged late-night across the TH offset, e.g. a 20:00 UTC log
// on May 22 is May 23 03:00 local Bangkok.

export interface MonthCell {
  /** YYYY-MM-DD (local time). */
  dayKey: string;
  /** ISO of midnight-local for this day. */
  date: string;
  dayNumber: number;
  inViewMonth: boolean;
  isToday: boolean;
  hasTransfusion: boolean;
  hasAppointment: boolean;
  hasReaction: boolean;
  outcomes: Set<'normal' | 'monitor' | 'urgent'>;
  eventCount: number;
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Build a 42-cell monthly grid (always 6 rows × 7 cols so the card height
 * is constant). Cells outside the `viewMonth` are still rendered so the
 * grid stays full — the caller dims them.
 *
 * `weekStartsOn`: 0 = Sunday (default; iOS Calendar default in TH locale).
 */
export function buildMonthGrid(
  viewMonth: Date,
  today: Date,
  events: CareEvent[],
  weekStartsOn: 0 | 1 = 0
): MonthCell[] {
  const monthStart = startOfMonth(viewMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });

  const byKey = new Map<string, CareEvent[]>();
  for (const ev of events) {
    const key = ymdLocal(new Date(ev.date));
    const arr = byKey.get(key);
    if (arr) arr.push(ev);
    else byKey.set(key, [ev]);
  }

  // Always emit 42 cells (6 rows × 7 cols) so the card height is constant
  // regardless of where the month sits in the week.
  const cells: MonthCell[] = [];
  let cursor = gridStart;
  while (cells.length < 42) {
    const key = ymdLocal(cursor);
    const dayEvents = byKey.get(key) ?? [];
    const cell: MonthCell = {
      dayKey: key,
      date: cursor.toISOString(),
      dayNumber: cursor.getDate(),
      inViewMonth: isSameMonth(cursor, viewMonth),
      isToday: isSameDay(cursor, today),
      hasTransfusion: false,
      hasAppointment: false,
      hasReaction: false,
      outcomes: new Set(),
      eventCount: dayEvents.length,
    };
    for (const ev of dayEvents) {
      if (ev.kind === 'transfusion') {
        cell.hasTransfusion = true;
        if (ev.transfusion?.reaction_noted) cell.hasReaction = true;
      }
      if (ev.kind === 'appointment') cell.hasAppointment = true;
      if (ev.kind === 'symptom_log' && ev.log) cell.outcomes.add(ev.log.outcome);
    }
    cells.push(cell);
    cursor = addDays(cursor, 1);
  }
  return cells;
}

/** Return all events whose local date matches `dayKey` (YYYY-MM-DD). */
export function getEventsForLocalDay(events: CareEvent[], dayKey: string): CareEvent[] {
  return events.filter((ev) => ymdLocal(new Date(ev.date)) === dayKey);
}

/** Count normal-outcome symptom logs in `viewMonth` that current filters hide. */
export function countHiddenNormalLogsInMonth(
  events: CareEvent[],
  viewMonth: Date,
  filters: Pick<TimelineFilters, 'showNormals' | 'urgentOnly'>
): number {
  if (filters.showNormals && !filters.urgentOnly) return 0;
  let n = 0;
  for (const ev of events) {
    if (ev.kind !== 'symptom_log' || ev.log?.outcome !== 'normal') continue;
    if (!isSameMonth(new Date(ev.date), viewMonth)) continue;
    n += 1;
  }
  return n;
}

export function buildStripCells(
  events: CareEvent[],
  today: Date,
  windowDays: number
): StripCell[] {
  const todayKey = ymdUtc(today.toISOString());
  const byKey = new Map<string, StripCell>();
  const cells: StripCell[] = [];
  for (let i = 0; i < windowDays; i += 1) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = ymdUtc(d.toISOString());
    const cell: StripCell = {
      dayKey: key,
      date: d.toISOString(),
      hasTransfusion: false,
      hasAppointment: false,
      worstOutcome: null,
      isToday: key === todayKey,
    };
    byKey.set(key, cell);
    cells.push(cell);
  }
  for (const ev of events) {
    const cell = byKey.get(ymdUtc(ev.date));
    if (!cell) continue;
    if (ev.kind === 'transfusion') cell.hasTransfusion = true;
    if (ev.kind === 'appointment') cell.hasAppointment = true;
    if (ev.kind === 'symptom_log' && ev.log) {
      const o = ev.log.outcome;
      const cur = cell.worstOutcome ? OUTCOME_RANK[cell.worstOutcome] : -1;
      if (OUTCOME_RANK[o] > cur) cell.worstOutcome = o;
    }
  }
  return cells.reverse();
}
