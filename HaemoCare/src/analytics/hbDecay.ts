import { Transfusion } from '../types/database';

export interface HbDecayResult {
  sampleCount: number;
  decayRatePerDay: number | null;
  latestPostHb: number | null;
  latestTxDate: string | null;
  projectedThresholdDate: string | null;
  daysUntilThreshold: number | null;
  confidence: 'low' | 'moderate' | 'high';
}

const DEFAULT_LOWER_THRESHOLD_G_DL = 7.0;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / MS_PER_DAY;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Estimates a patient-specific Hb decay rate (g/dL per day) from prior transfusion
 * intervals, then projects when the most recent post-transfusion Hb will drop to a
 * lower threshold. Observation only — not a recommendation.
 *
 * Approach:
 *   For each consecutive (tx_i -> tx_{i+1}) pair, we derive an implicit decay rate:
 *     rate_i = (post_hb_i - pre_hb_{i+1}) / days_between(tx_i, tx_{i+1})
 *   Final rate = mean of per-pair rates. Projection from latest post_hb at latest tx.
 */
export function projectHbDecay(
  transfusions: Transfusion[],
  opts: { lowerThreshold?: number; asOf?: string } = {}
): HbDecayResult {
  const lower = opts.lowerThreshold ?? DEFAULT_LOWER_THRESHOLD_G_DL;
  const asOf = opts.asOf ?? new Date().toISOString();

  // Sort ascending by date. Input is often newest-first.
  const txs = [...transfusions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const latest = txs[txs.length - 1];
  const latestPost = latest?.post_hb_g_dl ?? null;
  const latestDate = latest?.date ?? null;

  const rates: number[] = [];
  for (let i = 0; i < txs.length - 1; i++) {
    const a = txs[i];
    const b = txs[i + 1];
    const post = a.post_hb_g_dl;
    const nextPre = b.pre_hb_g_dl;
    if (post == null || nextPre == null) continue;
    const days = daysBetween(a.date, b.date);
    if (days <= 0) continue;
    const drop = post - nextPre;
    if (drop <= 0) continue; // pre >= post is non-physiological between cycles
    rates.push(drop / days);
  }

  const result: HbDecayResult = {
    sampleCount: rates.length,
    decayRatePerDay: null,
    latestPostHb: latestPost,
    latestTxDate: latestDate,
    projectedThresholdDate: null,
    daysUntilThreshold: null,
    confidence: 'low',
  };

  if (rates.length === 0 || latestPost == null || latestDate == null) {
    return result;
  }

  const rate = mean(rates);
  result.decayRatePerDay = Number(rate.toFixed(3));
  result.confidence = rates.length >= 3 ? 'high' : rates.length === 2 ? 'moderate' : 'low';

  if (latestPost <= lower) {
    // Already at/below threshold as of last post-transfusion.
    result.projectedThresholdDate = latestDate;
    result.daysUntilThreshold = Math.round(daysBetween(asOf, latestDate));
    return result;
  }

  const daysToThresholdFromLatest = (latestPost - lower) / rate;
  const projectedTs = new Date(latestDate).getTime() + daysToThresholdFromLatest * MS_PER_DAY;
  result.projectedThresholdDate = new Date(projectedTs).toISOString();
  result.daysUntilThreshold = Math.round((projectedTs - new Date(asOf).getTime()) / MS_PER_DAY);
  return result;
}
