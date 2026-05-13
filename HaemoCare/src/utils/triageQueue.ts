import type { Outcome } from '../types/database';

export interface TriageInput {
  isOverdue: boolean;
  daysOverdue: number;
  bumpTiers: 0 | 1 | 2;
  worstRecentOutcome: Outcome;
  daysSinceLastTransfusion: number;
  hasReactionOnFile: boolean;
}

export function triageScore(input: TriageInput): number {
  let score = 0;
  if (input.worstRecentOutcome === 'urgent') score += 10000;
  if (input.bumpTiers === 2) score += 5000;
  else if (input.bumpTiers === 1) score += 2500;
  if (input.worstRecentOutcome === 'monitor' && score < 1000) score += 1000;
  if (input.hasReactionOnFile) score += 200;
  score += Math.min(input.daysOverdue, 365);
  return score;
}

export function sortTriageDescending<T>(rows: T[], project: (row: T) => TriageInput): T[] {
  return [...rows].sort((a, b) => triageScore(project(b)) - triageScore(project(a)));
}
