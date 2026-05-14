import { parseISO } from 'date-fns';
import type { Transfusion, SymptomLog, Appointment } from '../types/database';

export type CareEventKind = 'transfusion' | 'symptom_log' | 'appointment';

export interface CareEvent {
  id: string;
  kind: CareEventKind;
  date: string; // ISO
  transfusion?: Transfusion;
  log?: SymptomLog;
  appointment?: Appointment;
}

export interface CareEventsResult {
  events: CareEvent[]; // newest first, up to maxEvents
  totalInWindow: number; // total within window before truncation
}

export interface CareEventsArgs {
  transfusions: Transfusion[];
  logs: SymptomLog[];
  appointments: Appointment[];
  today: Date;
  windowDays?: number; // default 60
  maxEvents?: number; // default 25
}

const DEFAULT_WINDOW_DAYS = 60;
const DEFAULT_MAX_EVENTS = 25;

// Stable source order for tie-breaks: transfusions first, then logs, then appointments.
const SOURCE_ORDER: Record<CareEventKind, number> = {
  transfusion: 0,
  symptom_log: 1,
  appointment: 2,
};

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function buildCareEventsTimeline(args: CareEventsArgs): CareEventsResult {
  const {
    transfusions,
    logs,
    appointments,
    today,
    windowDays = DEFAULT_WINDOW_DAYS,
    maxEvents = DEFAULT_MAX_EVENTS,
  } = args;

  const todayMs = today.getTime();
  // Align window start to UTC start-of-day of (today - windowDays) so the
  // cutoff is calendar-day aligned and independent of time-of-day.
  const windowStartDate = startOfUtcDay(today);
  windowStartDate.setUTCDate(windowStartDate.getUTCDate() - windowDays);
  const windowStartMs = windowStartDate.getTime();

  const candidates: Array<{ event: CareEvent; sourceIdx: number }> = [];

  transfusions.forEach((tx, idx) => {
    const dateMs = parseISO(tx.date).getTime();
    if (dateMs >= windowStartMs && dateMs <= todayMs) {
      candidates.push({
        event: {
          id: `tx-${tx.id}`,
          kind: 'transfusion',
          date: tx.date,
          transfusion: tx,
        },
        sourceIdx: idx,
      });
    }
  });

  logs.forEach((log, idx) => {
    const dateMs = parseISO(log.logged_at).getTime();
    if (dateMs >= windowStartMs && dateMs <= todayMs) {
      candidates.push({
        event: {
          id: `log-${log.id}`,
          kind: 'symptom_log',
          date: log.logged_at,
          log,
        },
        sourceIdx: idx,
      });
    }
  });

  appointments.forEach((appt, idx) => {
    const dateMs = parseISO(appt.scheduled_date).getTime();
    // Past only (scheduled_date <= today) AND within window
    if (dateMs <= todayMs && dateMs >= windowStartMs) {
      candidates.push({
        event: {
          id: `appt-${appt.id}`,
          kind: 'appointment',
          date: appt.scheduled_date,
          appointment: appt,
        },
        sourceIdx: idx,
      });
    }
  });

  candidates.sort((a, b) => {
    const dt = parseISO(b.event.date).getTime() - parseISO(a.event.date).getTime();
    if (dt !== 0) return dt;
    const srcDelta = SOURCE_ORDER[a.event.kind] - SOURCE_ORDER[b.event.kind];
    if (srcDelta !== 0) return srcDelta;
    return a.sourceIdx - b.sourceIdx;
  });

  const events = candidates.slice(0, maxEvents).map((c) => c.event);

  return {
    events,
    totalInWindow: candidates.length,
  };
}
