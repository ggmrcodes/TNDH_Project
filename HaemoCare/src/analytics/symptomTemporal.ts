import { SymptomLog, Transfusion } from '../types/database';

export interface SymptomTimepoint {
  logId: string;
  symptomKey: string;
  severity: number;
  hoursSinceTx: number;
  daysSinceTx: number;
}

export interface SymptomPattern {
  symptomKey: string;
  occurrences: number;
  meanDaysSinceTx: number;
  medianDaysSinceTx: number;
  minDaysSinceTx: number;
  maxDaysSinceTx: number;
  meanSeverity: number;
}

const MS_PER_HOUR = 1000 * 60 * 60;

/**
 * For each symptom instance in a log, compute time since the linked transfusion.
 * Falls back to most-recent-transfusion-before-log when transfusion_id is null.
 */
export function computeSymptomTimepoints(
  logs: SymptomLog[],
  transfusions: Transfusion[]
): SymptomTimepoint[] {
  const txById = new Map(transfusions.map(t => [t.id, t]));
  const txSortedAsc = [...transfusions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const out: SymptomTimepoint[] = [];

  for (const log of logs) {
    const linked = log.transfusion_id ? txById.get(log.transfusion_id) : undefined;
    const anchor = linked ?? mostRecentTxBefore(txSortedAsc, log.logged_at);
    if (!anchor) continue;

    const hours = (new Date(log.logged_at).getTime() - new Date(anchor.date).getTime()) / MS_PER_HOUR;
    if (hours < 0) continue; // log predates the anchor tx

    for (const [key, severity] of Object.entries(log.severity_scores)) {
      if (!severity || severity <= 0) continue;
      out.push({
        logId: log.id,
        symptomKey: key,
        severity,
        hoursSinceTx: Math.round(hours),
        daysSinceTx: Math.round(hours / 24),
      });
    }
  }

  return out;
}

function mostRecentTxBefore(txSortedAsc: Transfusion[], when: string): Transfusion | undefined {
  const t = new Date(when).getTime();
  let last: Transfusion | undefined;
  for (const tx of txSortedAsc) {
    if (new Date(tx.date).getTime() <= t) last = tx;
    else break;
  }
  return last;
}

/**
 * Surfaces per-symptom temporal patterns: when (in days since a transfusion) a
 * given symptom tends to show up, and how severely. Observation — no causal claim.
 */
export function summarizePatterns(timepoints: SymptomTimepoint[], minOccurrences = 2): SymptomPattern[] {
  const groups = new Map<string, SymptomTimepoint[]>();
  for (const tp of timepoints) {
    const arr = groups.get(tp.symptomKey) ?? [];
    arr.push(tp);
    groups.set(tp.symptomKey, arr);
  }

  const patterns: SymptomPattern[] = [];
  for (const [key, items] of groups) {
    if (items.length < minOccurrences) continue;
    const days = items.map(i => i.daysSinceTx).sort((a, b) => a - b);
    const sevs = items.map(i => i.severity);
    patterns.push({
      symptomKey: key,
      occurrences: items.length,
      meanDaysSinceTx: round1(average(days)),
      medianDaysSinceTx: median(days),
      minDaysSinceTx: days[0],
      maxDaysSinceTx: days[days.length - 1],
      meanSeverity: round1(average(sevs)),
    });
  }

  patterns.sort((a, b) => b.occurrences - a.occurrences);
  return patterns;
}

function average(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
