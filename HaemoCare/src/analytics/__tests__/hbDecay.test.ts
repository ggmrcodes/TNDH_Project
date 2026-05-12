import { projectHbDecay } from '../hbDecay';
import { Transfusion } from '../../types/database';

function tx(date: string, pre?: number, post?: number): Transfusion {
  return {
    id: date,
    user_id: 'u',
    date,
    hospital: 'H',
    units_received: 2,
    reaction_noted: false,
    reaction_detail: '',
    notes: '',
    pre_hb_g_dl: pre,
    post_hb_g_dl: post,
    created_at: date,
  };
}

describe('projectHbDecay', () => {
  it('returns empty result with zero transfusions', () => {
    const r = projectHbDecay([]);
    expect(r.sampleCount).toBe(0);
    expect(r.decayRatePerDay).toBeNull();
    expect(r.projectedThresholdDate).toBeNull();
  });

  it('returns empty result with a single transfusion (no pair to measure)', () => {
    const r = projectHbDecay([tx('2026-04-09T00:00:00Z', 7.0, 10.2)]);
    expect(r.sampleCount).toBe(0);
    expect(r.decayRatePerDay).toBeNull();
    expect(r.latestPostHb).toBe(10.2);
  });

  it('computes decay rate from two consecutive transfusions with valid pre/post', () => {
    // tx1 post 10.0, tx2 pre 7.0 -> drop of 3.0 over 30 days -> 0.1 g/dL/day
    const r = projectHbDecay([
      tx('2026-03-01T00:00:00Z', 6.5, 10.0),
      tx('2026-03-31T00:00:00Z', 7.0, 10.0),
    ]);
    expect(r.sampleCount).toBe(1);
    expect(r.decayRatePerDay).toBeCloseTo(0.1, 3);
    expect(r.latestPostHb).toBe(10.0);
    expect(r.confidence).toBe('low');
  });

  it('averages multiple decay rates and flags high confidence at n>=3', () => {
    const r = projectHbDecay([
      tx('2026-01-01T00:00:00Z', 6.5, 10.0),
      tx('2026-01-31T00:00:00Z', 7.0, 10.0), // rate: 0.1
      tx('2026-03-02T00:00:00Z', 7.0, 10.2), // rate: 0.1
      tx('2026-03-30T00:00:00Z', 7.4, 10.4), // rate: ~(10.2-7.4)/28 ~= 0.1
    ]);
    expect(r.sampleCount).toBe(3);
    expect(r.confidence).toBe('high');
    expect(r.decayRatePerDay).toBeGreaterThan(0.05);
    expect(r.decayRatePerDay).toBeLessThan(0.15);
  });

  it('projects threshold crossing from the latest post-Hb', () => {
    // latest post=10.0, rate=0.1/day, threshold=7.0 -> 30 days from latest tx
    const r = projectHbDecay(
      [
        tx('2026-03-01T00:00:00Z', 6.5, 10.0),
        tx('2026-03-31T00:00:00Z', 7.0, 10.0),
      ],
      { lowerThreshold: 7.0, asOf: '2026-03-31T00:00:00Z' }
    );
    expect(r.daysUntilThreshold).toBe(30);
    expect(r.projectedThresholdDate).toContain('2026-04-30');
  });

  it('returns latest tx date when patient is already at/below threshold', () => {
    const r = projectHbDecay(
      [
        tx('2026-03-01T00:00:00Z', 6.5, 10.0),
        tx('2026-03-31T00:00:00Z', 7.0, 6.9), // post already below threshold
      ],
      { lowerThreshold: 7.0, asOf: '2026-04-02T00:00:00Z' }
    );
    expect(r.projectedThresholdDate).toContain('2026-03-31');
  });

  it('skips pairs missing pre or post Hb', () => {
    // Pair 1 (tx1 post -> tx2 pre): tx2.pre missing -> skip.
    // Pair 2 (tx2 post -> tx3 pre): tx2.post missing -> skip.
    const r = projectHbDecay([
      tx('2026-01-01T00:00:00Z', 6.5, 10.0),
      tx('2026-01-31T00:00:00Z', undefined, undefined),
      tx('2026-02-28T00:00:00Z', 7.0, 10.2),
    ]);
    expect(r.sampleCount).toBe(0);
  });

  it('ignores non-physiological pairs where next pre >= prior post', () => {
    const r = projectHbDecay([
      tx('2026-01-01T00:00:00Z', 6.5, 9.0),
      tx('2026-02-01T00:00:00Z', 9.5, 10.5), // pre(9.5) > post(9.0), drop negative -> skip
    ]);
    expect(r.sampleCount).toBe(0);
  });
});
