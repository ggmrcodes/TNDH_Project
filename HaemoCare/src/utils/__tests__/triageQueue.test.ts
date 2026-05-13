import { triageScore, sortTriageDescending, type TriageInput } from '../triageQueue';

const baseInput = (overrides: Partial<TriageInput> = {}): TriageInput => ({
  isOverdue: false,
  daysOverdue: 0,
  bumpTiers: 0,
  worstRecentOutcome: 'normal',
  daysSinceLastTransfusion: 30,
  hasReactionOnFile: false,
  ...overrides,
});

describe('triageScore', () => {
  it('returns the lowest score for a stable patient', () => {
    expect(triageScore(baseInput())).toBeLessThan(100);
  });

  it('ranks urgent recent symptom above tier-2 overdue', () => {
    const urgent = triageScore(baseInput({ worstRecentOutcome: 'urgent' }));
    const overdueT2 = triageScore(baseInput({ isOverdue: true, daysOverdue: 30, bumpTiers: 2 }));
    expect(urgent).toBeGreaterThan(overdueT2);
  });

  it('ranks tier-2 overdue above tier-1 overdue', () => {
    const t2 = triageScore(baseInput({ isOverdue: true, daysOverdue: 30, bumpTiers: 2 }));
    const t1 = triageScore(baseInput({ isOverdue: true, daysOverdue: 12, bumpTiers: 1 }));
    expect(t2).toBeGreaterThan(t1);
  });

  it('ranks tier-1 overdue above monitor-only', () => {
    const t1 = triageScore(baseInput({ isOverdue: true, daysOverdue: 12, bumpTiers: 1 }));
    const monitor = triageScore(baseInput({ worstRecentOutcome: 'monitor' }));
    expect(t1).toBeGreaterThan(monitor);
  });

  it('uses daysOverdue as a tiebreaker within tier-2', () => {
    const t2More = triageScore(baseInput({ isOverdue: true, daysOverdue: 40, bumpTiers: 2 }));
    const t2Less = triageScore(baseInput({ isOverdue: true, daysOverdue: 25, bumpTiers: 2 }));
    expect(t2More).toBeGreaterThan(t2Less);
  });
});

describe('sortTriageDescending', () => {
  it('returns highest-priority first', () => {
    type Row = { id: string; input: TriageInput };
    const rows: Row[] = [
      { id: 'stable', input: baseInput() },
      { id: 'urgent', input: baseInput({ worstRecentOutcome: 'urgent' }) },
      { id: 'tier1', input: baseInput({ isOverdue: true, daysOverdue: 10, bumpTiers: 1 }) },
      { id: 'tier2', input: baseInput({ isOverdue: true, daysOverdue: 30, bumpTiers: 2 }) },
      { id: 'monitor', input: baseInput({ worstRecentOutcome: 'monitor' }) },
    ];
    const sorted = sortTriageDescending(rows, r => r.input);
    expect(sorted.map(r => r.id)).toEqual(['urgent', 'tier2', 'tier1', 'monitor', 'stable']);
  });
});
