import { evaluateSymptoms, ThresholdResult } from '../utils/clinicalThresholds';
import { Outcome, SymptomLog, Transfusion, UrineColor } from '../types/database';

/**
 * Reduce a list of symptom logs to the single worst outcome seen.
 * Precedence: urgent > monitor > normal.
 * Returns 'normal' for an empty list.
 */
export function worstRecentOutcome(logs: { outcome: Outcome }[]): Outcome {
  if (logs.some(l => l.outcome === 'urgent')) return 'urgent';
  if (logs.some(l => l.outcome === 'monitor')) return 'monitor';
  return 'normal';
}

export type TriageTier = 'self_monitor' | 'contact_clinic' | 'seek_urgent_care';

export interface TriageResult {
  tier: TriageTier;
  outcome: Outcome;
  triggeringSymptoms: string[];
  observations: string[];
}

const MS_PER_HOUR = 1000 * 60 * 60;

/**
 * Extends the existing per-log evaluateSymptoms() with contextual observations:
 *   - recent transfusion (within 72h) raises monitoring sensitivity
 *   - repeated red-flags across a short window escalate to urgent
 *
 * Output is framed as *observations*, never as a directive. Callers must present
 * the observation plus guidance to discuss with a clinician.
 */
export function triageSymptoms(
  severityScores: Record<string, number>,
  context: {
    loggedAt?: string;
    recentLogs?: SymptomLog[];
    recentTransfusion?: Transfusion | null;
    urineColor?: UrineColor | null;
  } = {}
): TriageResult {
  const base: ThresholdResult = evaluateSymptoms(severityScores, context.urineColor ?? null);
  const observations: string[] = [];

  const loggedAt = context.loggedAt ? new Date(context.loggedAt) : new Date();
  const tx = context.recentTransfusion;
  const withinPostTxWindow =
    tx && (loggedAt.getTime() - new Date(tx.date).getTime()) / MS_PER_HOUR <= 72;

  if (withinPostTxWindow && tx) {
    const hrs = Math.max(
      0,
      Math.round((loggedAt.getTime() - new Date(tx.date).getTime()) / MS_PER_HOUR)
    );
    observations.push(`Within ${hrs}h of most recent transfusion.`);
  }

  // Escalation: if base is 'monitor' but inside the 72h post-tx window, treat as contact_clinic.
  let tier: TriageTier;
  if (base.outcome === 'urgent') {
    tier = 'seek_urgent_care';
  } else if (base.outcome === 'monitor' && withinPostTxWindow) {
    tier = 'contact_clinic';
    observations.push('Monitor-tier symptoms within post-transfusion window may warrant earlier clinical contact.');
  } else if (base.outcome === 'monitor') {
    tier = 'contact_clinic';
  } else {
    tier = 'self_monitor';
  }

  // Pattern observation: two or more monitor/urgent logs in the last 24h.
  const recent = context.recentLogs ?? [];
  const cutoff = loggedAt.getTime() - 24 * MS_PER_HOUR;
  const flaggedRecent = recent.filter(l => {
    const ts = new Date(l.logged_at).getTime();
    return ts >= cutoff && (l.outcome === 'monitor' || l.outcome === 'urgent');
  });
  if (flaggedRecent.length >= 2 && tier === 'self_monitor') {
    tier = 'contact_clinic';
    observations.push(`${flaggedRecent.length} flagged logs in the last 24h — pattern to discuss with your clinician.`);
  }

  return {
    tier,
    outcome: base.outcome,
    triggeringSymptoms: base.triggeringSymptoms,
    observations,
  };
}
