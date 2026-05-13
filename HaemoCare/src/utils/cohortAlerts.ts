import { differenceInCalendarDays, parseISO } from 'date-fns';

export type AlertKind = 'urgent_log' | 'reaction_recorded' | 'tier2_overdue' | 'tier1_overdue_new';
export type AlertSeverity = 'red' | 'amber';

export interface AlertSlice {
  patientId: string; // profile.user_id
  patientDisplayName: string; // already-resolved (full_name if shared, else patient_id)
  bumpTiers: 0 | 1 | 2;
  daysOverdue: number; // 0 when not overdue
  isOverdue: boolean;
  hasReactionOnFile: boolean;
  latestTxDate: string | null; // ISO; needed for reaction_recorded freshness check
  mostRecentUrgentLogAt: string | null; // ISO of most recent urgent symptom log (any time); null if none
}

export interface CohortAlert {
  patientId: string;
  patientDisplayName: string;
  kind: AlertKind;
  severity: AlertSeverity;
  signalAt: string; // ISO timestamp used for ordering
}

export interface CohortAlertsResult {
  alerts: CohortAlert[]; // top 5
  total: number; // total alerts before truncation
}

const URGENT_LOG_WINDOW_DAYS = 7;
const REACTION_WINDOW_DAYS = 30;
const TIER1_NEW_MAX_DAYS = 3;
const MAX_ALERTS = 5;

const SEVERITY_RANK: Record<AlertSeverity, number> = { red: 0, amber: 1 };

function dedupeKey(patientId: string, kind: AlertKind): string {
  return `${patientId}::${kind}`;
}

function daysAgoIso(today: Date, days: number): string {
  const out = new Date(today.getTime());
  out.setDate(out.getDate() - days);
  return out.toISOString();
}

export function computeCohortAlerts(slices: AlertSlice[], today: Date): CohortAlertsResult {
  const candidates: CohortAlert[] = [];

  for (const slice of slices) {
    // urgent_log — most recent urgent log within last 7 days
    if (slice.mostRecentUrgentLogAt) {
      const logDate = parseISO(slice.mostRecentUrgentLogAt);
      const daysSince = differenceInCalendarDays(today, logDate);
      if (daysSince >= 0 && daysSince < URGENT_LOG_WINDOW_DAYS) {
        candidates.push({
          patientId: slice.patientId,
          patientDisplayName: slice.patientDisplayName,
          kind: 'urgent_log',
          severity: 'red',
          signalAt: slice.mostRecentUrgentLogAt,
        });
      }
    }

    // reaction_recorded — has reaction on file AND latest tx within last 30 days
    if (slice.hasReactionOnFile && slice.latestTxDate) {
      const txDate = parseISO(slice.latestTxDate);
      const daysSince = differenceInCalendarDays(today, txDate);
      if (daysSince >= 0 && daysSince < REACTION_WINDOW_DAYS) {
        candidates.push({
          patientId: slice.patientId,
          patientDisplayName: slice.patientDisplayName,
          kind: 'reaction_recorded',
          severity: 'red',
          signalAt: slice.latestTxDate,
        });
      }
    }

    // tier2_overdue
    if (slice.bumpTiers === 2) {
      candidates.push({
        patientId: slice.patientId,
        patientDisplayName: slice.patientDisplayName,
        kind: 'tier2_overdue',
        severity: 'red',
        signalAt: daysAgoIso(today, slice.daysOverdue),
      });
    }

    // tier1_overdue_new
    if (slice.bumpTiers === 1 && slice.daysOverdue <= TIER1_NEW_MAX_DAYS) {
      candidates.push({
        patientId: slice.patientId,
        patientDisplayName: slice.patientDisplayName,
        kind: 'tier1_overdue_new',
        severity: 'amber',
        signalAt: daysAgoIso(today, slice.daysOverdue),
      });
    }
  }

  // Dedupe per (patientId, kind), newest signalAt wins.
  const byKey = new Map<string, CohortAlert>();
  for (const alert of candidates) {
    const key = dedupeKey(alert.patientId, alert.kind);
    const existing = byKey.get(key);
    if (!existing || parseISO(alert.signalAt) > parseISO(existing.signalAt)) {
      byKey.set(key, alert);
    }
  }

  const deduped = Array.from(byKey.values());

  // Sort: red before amber, then signalAt desc.
  deduped.sort((a, b) => {
    const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (sev !== 0) return sev;
    return parseISO(b.signalAt).getTime() - parseISO(a.signalAt).getTime();
  });

  return {
    alerts: deduped.slice(0, MAX_ALERTS),
    total: deduped.length,
  };
}
