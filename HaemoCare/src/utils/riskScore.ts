import type { Outcome } from '../types/database';

export interface RiskInput {
  bumpTiers: 0 | 1 | 2;
  worstRecentOutcome: Outcome;
  hasReactionOnFile: boolean;
  hbDaysUntilThreshold: number | null; // from HbDecayResult.daysUntilThreshold
}

export type RiskLevel = 'low' | 'med' | 'high';

export interface RiskResult {
  score: number; // 0..10
  level: RiskLevel;
}

const MAX_SCORE = 10;

function levelFor(score: number): RiskLevel {
  if (score >= 6) return 'high';
  if (score >= 3) return 'med';
  return 'low';
}

export function computeRiskScore(input: RiskInput): RiskResult {
  let score = 0;

  if (input.bumpTiers === 2) score += 3;
  else if (input.bumpTiers === 1) score += 2;

  if (input.worstRecentOutcome === 'urgent') score += 3;
  else if (input.worstRecentOutcome === 'monitor') score += 1;

  if (input.hasReactionOnFile) score += 2;

  if (input.hbDaysUntilThreshold != null) {
    if (input.hbDaysUntilThreshold <= 0) score += 3;
    else if (input.hbDaysUntilThreshold <= 14) score += 2;
  }

  if (score > MAX_SCORE) score = MAX_SCORE;

  return { score, level: levelFor(score) };
}
