import { computeSymptomTimepoints, summarizePatterns } from '../symptomTemporal';
import { SymptomLog, Transfusion } from '../../types/database';

function tx(id: string, date: string): Transfusion {
  return {
    id,
    user_id: 'u',
    date,
    hospital: 'H',
    units_received: 2,
    reaction_noted: false,
    reaction_detail: '',
    notes: '',
    created_at: date,
  };
}

function log(
  id: string,
  txId: string | null,
  loggedAt: string,
  scores: Record<string, number>
): SymptomLog {
  return {
    id,
    user_id: 'u',
    transfusion_id: txId,
    logged_at: loggedAt,
    symptoms: Object.keys(scores),
    severity_scores: scores,
    outcome: 'normal',
    notes: '',
    created_at: loggedAt,
  };
}

describe('computeSymptomTimepoints', () => {
  it('computes days since linked transfusion per symptom', () => {
    const txs = [tx('tx-a', '2026-03-01T00:00:00Z')];
    const logs = [log('l1', 'tx-a', '2026-03-20T00:00:00Z', { fatigue: 4, fever: 2 })];
    const tps = computeSymptomTimepoints(logs, txs);
    expect(tps).toHaveLength(2);
    expect(tps[0].daysSinceTx).toBe(19);
    expect(tps.find(t => t.symptomKey === 'fever')?.severity).toBe(2);
  });

  it('falls back to most recent prior transfusion when transfusion_id is null', () => {
    const txs = [
      tx('tx-a', '2026-01-01T00:00:00Z'),
      tx('tx-b', '2026-02-01T00:00:00Z'),
    ];
    const logs = [log('l1', null, '2026-02-20T00:00:00Z', { fatigue: 3 })];
    const tps = computeSymptomTimepoints(logs, txs);
    expect(tps).toHaveLength(1);
    expect(tps[0].daysSinceTx).toBe(19); // 19 days after tx-b, not 50 after tx-a
  });

  it('drops zero-severity entries', () => {
    const txs = [tx('tx-a', '2026-03-01T00:00:00Z')];
    const logs = [log('l1', 'tx-a', '2026-03-05T00:00:00Z', { fatigue: 0, fever: 3 })];
    const tps = computeSymptomTimepoints(logs, txs);
    expect(tps).toHaveLength(1);
    expect(tps[0].symptomKey).toBe('fever');
  });

  it('drops logs that predate all transfusions', () => {
    const txs = [tx('tx-a', '2026-03-01T00:00:00Z')];
    const logs = [log('l1', null, '2026-02-20T00:00:00Z', { fatigue: 3 })];
    const tps = computeSymptomTimepoints(logs, txs);
    expect(tps).toHaveLength(0);
  });
});

describe('summarizePatterns', () => {
  it('surfaces patterns for symptoms with at least minOccurrences', () => {
    const txs = [
      tx('tx-a', '2026-01-01T00:00:00Z'),
      tx('tx-b', '2026-02-01T00:00:00Z'),
      tx('tx-c', '2026-03-01T00:00:00Z'),
    ];
    const logs = [
      log('l1', 'tx-a', '2026-01-20T00:00:00Z', { fatigue: 5 }),
      log('l2', 'tx-b', '2026-02-19T00:00:00Z', { fatigue: 6 }),
      log('l3', 'tx-c', '2026-03-21T00:00:00Z', { fatigue: 4, fever: 2 }),
    ];
    const tps = computeSymptomTimepoints(logs, txs);
    const patterns = summarizePatterns(tps, 2);
    const fatigue = patterns.find(p => p.symptomKey === 'fatigue')!;
    expect(fatigue.occurrences).toBe(3);
    expect(fatigue.meanDaysSinceTx).toBeGreaterThanOrEqual(18);
    expect(fatigue.meanDaysSinceTx).toBeLessThanOrEqual(21);
    expect(patterns.find(p => p.symptomKey === 'fever')).toBeUndefined();
  });

  it('returns empty array when nothing meets the threshold', () => {
    expect(summarizePatterns([], 2)).toEqual([]);
  });
});
