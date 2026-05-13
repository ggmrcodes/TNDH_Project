import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Outcome, Profile, Transfusion, Appointment } from '../types/database';

export const OUTCOME_LADDER: readonly Outcome[] = ['normal', 'monitor', 'urgent'] as const;

export const GRACE_DAYS = 7;
export const TIER_1_MAX = 21;

export type OverdueState =
  | { isOverdue: false }
  | {
      isOverdue: true;
      daysOverdue: number;
      bumpTiers: 1 | 2;
      sourcePath: 'appointment' | 'cadence';
      plannedVisitDate: string; // ISO
    };

export interface ComputeOverdueStateArgs {
  profile: Pick<Profile, 'recommended_visit_interval_days'>;
  mostRecentTransfusion: Pick<Transfusion, 'date'> | null;
  mostRecentPastAppointment: Pick<Appointment, 'scheduled_date'> | null;
  today: Date;
}

export function applyBump(originalOutcome: Outcome, bumpTiers: 0 | 1 | 2): Outcome {
  if (bumpTiers === 0) return originalOutcome;
  const idx = OUTCOME_LADDER.indexOf(originalOutcome);
  const bumped = Math.min(idx + bumpTiers, OUTCOME_LADDER.length - 1);
  return OUTCOME_LADDER[bumped];
}

export function computeOverdueState(args: ComputeOverdueStateArgs): OverdueState {
  const { profile, mostRecentTransfusion, mostRecentPastAppointment, today } = args;

  // Path A: missed appointment. Latest past appointment with no transfusion at/after.
  let appointmentPlanned: Date | null = null;
  if (mostRecentPastAppointment) {
    const apptDate = parseISO(mostRecentPastAppointment.scheduled_date);
    const hasTransfusionAtOrAfter =
      mostRecentTransfusion != null &&
      parseISO(mostRecentTransfusion.date) >= apptDate;
    if (!hasTransfusionAtOrAfter) {
      appointmentPlanned = apptDate;
    }
  }

  // Path B: cadence. last_transfusion + interval.
  let cadencePlanned: Date | null = null;
  if (mostRecentTransfusion) {
    const txDate = parseISO(mostRecentTransfusion.date);
    cadencePlanned = new Date(txDate);
    cadencePlanned.setDate(cadencePlanned.getDate() + profile.recommended_visit_interval_days);
  }

  if (!appointmentPlanned && !cadencePlanned) {
    return { isOverdue: false };
  }

  // Pick the earlier (more conservative) planned date. Tie → prefer appointment.
  let planned: Date;
  let sourcePath: 'appointment' | 'cadence';
  if (appointmentPlanned && cadencePlanned) {
    if (appointmentPlanned.getTime() <= cadencePlanned.getTime()) {
      planned = appointmentPlanned;
      sourcePath = 'appointment';
    } else {
      planned = cadencePlanned;
      sourcePath = 'cadence';
    }
  } else if (appointmentPlanned) {
    planned = appointmentPlanned;
    sourcePath = 'appointment';
  } else {
    planned = cadencePlanned!;
    sourcePath = 'cadence';
  }

  const daysOverdue = differenceInCalendarDays(today, planned);
  if (daysOverdue <= GRACE_DAYS) {
    return { isOverdue: false };
  }

  const bumpTiers: 1 | 2 = daysOverdue <= TIER_1_MAX ? 1 : 2;
  return {
    isOverdue: true,
    daysOverdue,
    bumpTiers,
    sourcePath,
    plannedVisitDate: planned.toISOString(),
  };
}
