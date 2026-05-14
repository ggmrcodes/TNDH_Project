import { computeCohortAlerts, AlertSlice } from '../cohortAlerts';

const TODAY = new Date('2026-05-12T12:00:00Z');

const slice = (overrides: Partial<AlertSlice> = {}): AlertSlice => ({
  patientId: 'p1',
  patientDisplayName: 'Patient One',
  bumpTiers: 0,
  daysOverdue: 0,
  isOverdue: false,
  hasReactionOnFile: false,
  latestTxDate: null,
  mostRecentUrgentLogAt: null,
  ...overrides,
});

describe('computeCohortAlerts — empty input', () => {
  it('returns empty alerts and total=0 for empty cohort', () => {
    const result = computeCohortAlerts([], TODAY);
    expect(result.alerts).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('returns empty alerts when no slice meets any trigger', () => {
    const result = computeCohortAlerts(
      [slice(), slice({ patientId: 'p2' })],
      TODAY
    );
    expect(result.alerts).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('computeCohortAlerts — individual triggers', () => {
  it('fires urgent_log when most recent urgent log is within 7 days', () => {
    const result = computeCohortAlerts(
      [
        slice({
          patientId: 'p1',
          mostRecentUrgentLogAt: '2026-05-10T08:00:00Z', // 2 days ago
        }),
      ],
      TODAY
    );
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toEqual(
      expect.objectContaining({
        patientId: 'p1',
        kind: 'urgent_log',
        severity: 'red',
        signalAt: '2026-05-10T08:00:00Z',
      })
    );
  });

  it('does NOT fire urgent_log when log is older than 7 days', () => {
    const result = computeCohortAlerts(
      [
        slice({
          mostRecentUrgentLogAt: '2026-05-04T08:00:00Z', // 8 days ago
        }),
      ],
      TODAY
    );
    expect(result.alerts).toHaveLength(0);
  });

  it('fires urgent_log when log is exactly 6 calendar days ago (last day of 7-day window)', () => {
    const result = computeCohortAlerts(
      [
        slice({
          patientId: 'p6d',
          mostRecentUrgentLogAt: '2026-05-06T08:00:00Z', // 6 calendar days ago
        }),
      ],
      TODAY
    );
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toEqual(
      expect.objectContaining({
        patientId: 'p6d',
        kind: 'urgent_log',
      })
    );
  });

  it('does NOT fire urgent_log when log is exactly 7 calendar days ago (just outside window)', () => {
    const result = computeCohortAlerts(
      [
        slice({
          patientId: 'p7d',
          mostRecentUrgentLogAt: '2026-05-05T08:00:00Z', // 7 calendar days ago
        }),
      ],
      TODAY
    );
    expect(result.alerts).toHaveLength(0);
  });

  it('does NOT fire urgent_log for a future-dated log (daysSince < 0 excluded)', () => {
    const result = computeCohortAlerts(
      [
        slice({
          patientId: 'pfuture',
          mostRecentUrgentLogAt: '2026-05-13T08:00:00Z', // tomorrow
        }),
      ],
      TODAY
    );
    expect(result.alerts).toHaveLength(0);
  });

  it('fires reaction_recorded when reaction on file + latest tx within 30 days', () => {
    const result = computeCohortAlerts(
      [
        slice({
          patientId: 'p2',
          hasReactionOnFile: true,
          latestTxDate: '2026-05-01T10:00:00Z', // 11 days ago
        }),
      ],
      TODAY
    );
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toEqual(
      expect.objectContaining({
        patientId: 'p2',
        kind: 'reaction_recorded',
        severity: 'red',
        signalAt: '2026-05-01T10:00:00Z',
      })
    );
  });

  it('does NOT fire reaction_recorded if tx is older than 30 days', () => {
    const result = computeCohortAlerts(
      [
        slice({
          hasReactionOnFile: true,
          latestTxDate: '2026-04-01T10:00:00Z', // 41 days ago
        }),
      ],
      TODAY
    );
    expect(result.alerts).toHaveLength(0);
  });

  it('fires reaction_recorded when tx is exactly 29 calendar days ago (last day of 30-day window)', () => {
    const result = computeCohortAlerts(
      [
        slice({
          patientId: 'p29d',
          hasReactionOnFile: true,
          latestTxDate: '2026-04-13T10:00:00Z', // 29 calendar days ago
        }),
      ],
      TODAY
    );
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toEqual(
      expect.objectContaining({
        patientId: 'p29d',
        kind: 'reaction_recorded',
      })
    );
  });

  it('does NOT fire reaction_recorded when tx is exactly 30 calendar days ago (just outside window)', () => {
    const result = computeCohortAlerts(
      [
        slice({
          patientId: 'p30d',
          hasReactionOnFile: true,
          latestTxDate: '2026-04-12T10:00:00Z', // 30 calendar days ago
        }),
      ],
      TODAY
    );
    expect(result.alerts).toHaveLength(0);
  });

  it('does NOT fire reaction_recorded when no reaction on file', () => {
    const result = computeCohortAlerts(
      [
        slice({
          hasReactionOnFile: false,
          latestTxDate: '2026-05-01T10:00:00Z',
        }),
      ],
      TODAY
    );
    expect(result.alerts).toHaveLength(0);
  });

  it('fires tier2_overdue when bumpTiers === 2', () => {
    const result = computeCohortAlerts(
      [
        slice({
          patientId: 'p3',
          bumpTiers: 2,
          daysOverdue: 30,
          isOverdue: true,
        }),
      ],
      TODAY
    );
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toEqual(
      expect.objectContaining({
        patientId: 'p3',
        kind: 'tier2_overdue',
        severity: 'red',
      })
    );
  });

  it('fires tier1_overdue_new (amber) when bumpTiers===1 && daysOverdue <= 3', () => {
    const result = computeCohortAlerts(
      [
        slice({
          patientId: 'p4',
          bumpTiers: 1,
          daysOverdue: 2,
          isOverdue: true,
        }),
      ],
      TODAY
    );
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toEqual(
      expect.objectContaining({
        patientId: 'p4',
        kind: 'tier1_overdue_new',
        severity: 'amber',
      })
    );
  });

  it('does NOT fire tier1_overdue_new when daysOverdue > 3', () => {
    const result = computeCohortAlerts(
      [
        slice({
          bumpTiers: 1,
          daysOverdue: 5,
          isOverdue: true,
        }),
      ],
      TODAY
    );
    expect(result.alerts).toHaveLength(0);
  });
});

describe('computeCohortAlerts — dedupe per (patient, kind)', () => {
  it('only emits one alert per (patientId, kind) even if multiple slices match', () => {
    // Two slices for the same patient triggering same kind shouldn't happen
    // in practice — but the dedupe path must still hold within a single slice's
    // multiple triggers (different kinds OK, same kind keeps newest).
    const result = computeCohortAlerts(
      [
        slice({
          patientId: 'pdupe',
          mostRecentUrgentLogAt: '2026-05-09T08:00:00Z',
        }),
        slice({
          patientId: 'pdupe',
          mostRecentUrgentLogAt: '2026-05-11T08:00:00Z', // newer
        }),
      ],
      TODAY
    );
    const urgentLogs = result.alerts.filter((a) => a.kind === 'urgent_log');
    expect(urgentLogs).toHaveLength(1);
    // Newest signalAt wins
    expect(urgentLogs[0].signalAt).toBe('2026-05-11T08:00:00Z');
  });

  it('allows multiple different kinds for the same patient', () => {
    const result = computeCohortAlerts(
      [
        slice({
          patientId: 'pmulti',
          mostRecentUrgentLogAt: '2026-05-11T08:00:00Z',
          hasReactionOnFile: true,
          latestTxDate: '2026-05-10T10:00:00Z',
          bumpTiers: 2,
          daysOverdue: 22,
          isOverdue: true,
        }),
      ],
      TODAY
    );
    const kinds = result.alerts.map((a) => a.kind).sort();
    expect(kinds).toEqual(['reaction_recorded', 'tier2_overdue', 'urgent_log']);
  });

  it('keeps distinct kinds when same patientId appears across multiple slices', () => {
    // Same patient appears twice — one slice carries an urgent log, the other
    // carries a tier2 overdue signal. Dedupe only collapses (patientId, kind),
    // so both alerts must survive.
    const result = computeCohortAlerts(
      [
        slice({
          patientId: 'pcross',
          mostRecentUrgentLogAt: '2026-05-11T08:00:00Z',
        }),
        slice({
          patientId: 'pcross',
          bumpTiers: 2,
          daysOverdue: 22,
          isOverdue: true,
        }),
      ],
      TODAY
    );
    const kinds = result.alerts
      .filter((a) => a.patientId === 'pcross')
      .map((a) => a.kind)
      .sort();
    expect(kinds).toEqual(['tier2_overdue', 'urgent_log']);
  });
});

describe('computeCohortAlerts — sorting', () => {
  it('places red severity before amber', () => {
    const result = computeCohortAlerts(
      [
        slice({
          patientId: 'amber1',
          bumpTiers: 1,
          daysOverdue: 1,
          isOverdue: true,
        }),
        slice({
          patientId: 'red1',
          bumpTiers: 2,
          daysOverdue: 22,
          isOverdue: true,
        }),
      ],
      TODAY
    );
    expect(result.alerts).toHaveLength(2);
    expect(result.alerts[0].severity).toBe('red');
    expect(result.alerts[1].severity).toBe('amber');
  });

  it('sorts by signalAt descending within the same severity bucket', () => {
    const result = computeCohortAlerts(
      [
        slice({
          patientId: 'older',
          mostRecentUrgentLogAt: '2026-05-07T10:00:00Z',
        }),
        slice({
          patientId: 'newer',
          mostRecentUrgentLogAt: '2026-05-11T10:00:00Z',
        }),
        slice({
          patientId: 'middle',
          mostRecentUrgentLogAt: '2026-05-09T10:00:00Z',
        }),
      ],
      TODAY
    );
    expect(result.alerts.map((a) => a.patientId)).toEqual([
      'newer',
      'middle',
      'older',
    ]);
  });
});

describe('computeCohortAlerts — truncation', () => {
  it('returns at most 5 alerts in `alerts` and the full count in `total`', () => {
    const slices: AlertSlice[] = [];
    for (let i = 0; i < 8; i++) {
      slices.push(
        slice({
          patientId: `p${i}`,
          mostRecentUrgentLogAt: `2026-05-1${i}T10:00:00Z`.replace('-15', '-15'),
          // Spread dates across last week
        })
      );
    }
    // Rewrite with explicit dates, all strictly within the 7-day window
    // (days 0..6, i.e. May 6..May 12 with TODAY = May 12).
    const explicit: AlertSlice[] = [
      slice({ patientId: 'p1', mostRecentUrgentLogAt: '2026-05-06T10:00:00Z' }),
      slice({ patientId: 'p2', mostRecentUrgentLogAt: '2026-05-06T11:00:00Z' }),
      slice({ patientId: 'p3', mostRecentUrgentLogAt: '2026-05-07T10:00:00Z' }),
      slice({ patientId: 'p4', mostRecentUrgentLogAt: '2026-05-08T10:00:00Z' }),
      slice({ patientId: 'p5', mostRecentUrgentLogAt: '2026-05-09T10:00:00Z' }),
      slice({ patientId: 'p6', mostRecentUrgentLogAt: '2026-05-10T10:00:00Z' }),
      slice({ patientId: 'p7', mostRecentUrgentLogAt: '2026-05-11T10:00:00Z' }),
      slice({ patientId: 'p8', mostRecentUrgentLogAt: '2026-05-12T10:00:00Z' }),
    ];
    const result = computeCohortAlerts(explicit, TODAY);
    expect(result.total).toBe(8);
    expect(result.alerts).toHaveLength(5);
    // Newest 5 in descending order
    expect(result.alerts.map((a) => a.patientId)).toEqual([
      'p8',
      'p7',
      'p6',
      'p5',
      'p4',
    ]);
  });
});
