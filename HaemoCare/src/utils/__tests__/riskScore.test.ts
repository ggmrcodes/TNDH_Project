import { computeRiskScore, RiskInput } from '../riskScore';

const baseInput = (overrides: Partial<RiskInput> = {}): RiskInput => ({
  bumpTiers: 0,
  worstRecentOutcome: 'normal',
  hasReactionOnFile: false,
  hbDaysUntilThreshold: null,
  ...overrides,
});

describe('computeRiskScore — zero input', () => {
  it('returns 0 / low when all inputs are benign', () => {
    expect(computeRiskScore(baseInput())).toEqual({ score: 0, level: 'low' });
  });
});

describe('computeRiskScore — individual components', () => {
  it('adds 3 for bumpTiers = 2', () => {
    expect(computeRiskScore(baseInput({ bumpTiers: 2 }))).toEqual({
      score: 3,
      level: 'med',
    });
  });

  it('adds 2 for bumpTiers = 1', () => {
    expect(computeRiskScore(baseInput({ bumpTiers: 1 }))).toEqual({
      score: 2,
      level: 'low',
    });
  });

  it('adds 3 for worstRecentOutcome = urgent', () => {
    expect(computeRiskScore(baseInput({ worstRecentOutcome: 'urgent' }))).toEqual({
      score: 3,
      level: 'med',
    });
  });

  it('adds 1 for worstRecentOutcome = monitor', () => {
    expect(computeRiskScore(baseInput({ worstRecentOutcome: 'monitor' }))).toEqual({
      score: 1,
      level: 'low',
    });
  });

  it('adds 2 for hasReactionOnFile = true', () => {
    expect(computeRiskScore(baseInput({ hasReactionOnFile: true }))).toEqual({
      score: 2,
      level: 'low',
    });
  });

  it('adds 3 when hbDaysUntilThreshold <= 0', () => {
    expect(computeRiskScore(baseInput({ hbDaysUntilThreshold: 0 }))).toEqual({
      score: 3,
      level: 'med',
    });
    expect(computeRiskScore(baseInput({ hbDaysUntilThreshold: -5 }))).toEqual({
      score: 3,
      level: 'med',
    });
  });

  it('adds 2 when hbDaysUntilThreshold in (0, 14]', () => {
    expect(computeRiskScore(baseInput({ hbDaysUntilThreshold: 14 }))).toEqual({
      score: 2,
      level: 'low',
    });
    expect(computeRiskScore(baseInput({ hbDaysUntilThreshold: 1 }))).toEqual({
      score: 2,
      level: 'low',
    });
  });

  it('adds 0 when hbDaysUntilThreshold > 14', () => {
    expect(computeRiskScore(baseInput({ hbDaysUntilThreshold: 15 }))).toEqual({
      score: 0,
      level: 'low',
    });
  });

  it('adds 0 when hbDaysUntilThreshold is null', () => {
    expect(computeRiskScore(baseInput({ hbDaysUntilThreshold: null }))).toEqual({
      score: 0,
      level: 'low',
    });
  });
});

describe('computeRiskScore — cap at 10', () => {
  it('max-everything inputs cap at 10/high', () => {
    const result = computeRiskScore({
      bumpTiers: 2,             // +3
      worstRecentOutcome: 'urgent', // +3
      hasReactionOnFile: true,  // +2
      hbDaysUntilThreshold: 0,  // +3
    });
    // Raw sum = 11; cap to 10.
    expect(result).toEqual({ score: 10, level: 'high' });
  });

  it('still caps when sum would exceed 10 by other combinations', () => {
    const result = computeRiskScore({
      bumpTiers: 2,             // +3
      worstRecentOutcome: 'urgent', // +3
      hasReactionOnFile: true,  // +2
      hbDaysUntilThreshold: -100, // +3
    });
    expect(result.score).toBe(10);
    expect(result.level).toBe('high');
  });
});

describe('computeRiskScore — level thresholds', () => {
  it('score 2 → low', () => {
    expect(computeRiskScore(baseInput({ bumpTiers: 1 })).level).toBe('low');
  });

  it('score 3 → med (lower threshold)', () => {
    expect(computeRiskScore(baseInput({ bumpTiers: 2 })).level).toBe('med');
  });

  it('score 5 → med (upper end)', () => {
    // 2 (bump=1) + 3 (urgent outcome) = 5
    const result = computeRiskScore(
      baseInput({ bumpTiers: 1, worstRecentOutcome: 'urgent' })
    );
    expect(result.score).toBe(5);
    expect(result.level).toBe('med');
  });

  it('score 6 → high (lower threshold)', () => {
    // 3 (bump=2) + 3 (urgent) = 6
    const result = computeRiskScore(
      baseInput({ bumpTiers: 2, worstRecentOutcome: 'urgent' })
    );
    expect(result.score).toBe(6);
    expect(result.level).toBe('high');
  });

  it('score 10 → high', () => {
    expect(
      computeRiskScore({
        bumpTiers: 2,
        worstRecentOutcome: 'urgent',
        hasReactionOnFile: true,
        hbDaysUntilThreshold: 0,
      }).level
    ).toBe('high');
  });
});
