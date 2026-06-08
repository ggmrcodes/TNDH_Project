import {
  groupEventsByDay,
  applyTimelineFilters,
  computeHbDelta,
  countHiddenNormalLogs,
  buildStripCells,
  buildMonthGrid,
  getEventsForLocalDay,
  countHiddenNormalLogsInMonth,
  findMostRecentActivityMonth,
  cellTintForMonthCell,
  type MonthCell,
} from '../careEventsGrouping';
import type { CareEvent } from '../careEventsTimeline';

const TODAY = new Date('2026-06-09T00:00:00.000Z');

function mkLog(
  iso: string,
  outcome: 'normal' | 'monitor' | 'urgent',
  symptoms: string[] = ['fatigue']
): CareEvent {
  return {
    id: 'log-' + iso + '-' + outcome,
    kind: 'symptom_log',
    date: iso,
    log: {
      id: 'log-' + iso,
      user_id: 'p1',
      transfusion_id: null,
      logged_at: iso,
      symptoms,
      severity_scores: Object.fromEntries(symptoms.map((s) => [s, 5])),
      outcome,
      notes: '',
      created_at: iso,
    },
  };
}

function mkTx(iso: string, pre: number | null, post: number | null): CareEvent {
  return {
    id: 'tx-' + iso,
    kind: 'transfusion',
    date: iso,
    transfusion: {
      id: 'tx-' + iso,
      user_id: 'p1',
      date: iso,
      hospital: 'Phra Mongkut',
      units_received: 2,
      reaction_noted: false,
      reaction_detail: '',
      notes: '',
      pre_hb_g_dl: pre ?? undefined,
      post_hb_g_dl: post ?? undefined,
      created_at: iso,
    },
  };
}

function mkAppt(iso: string): CareEvent {
  return {
    id: 'appt-' + iso,
    kind: 'appointment',
    date: iso,
    appointment: {
      id: 'appt-' + iso,
      user_id: 'p1',
      scheduled_date: iso,
      hospital: 'Phra Mongkut',
      notes: '',
      linked_transfusion_id: null,
      source: 'manual',
      external_id: null,
      external_source_name: null,
      created_at: iso,
    },
  };
}

describe('groupEventsByDay', () => {
  it('clusters multiple same-day events into one DayGroup with correct flags', () => {
    const events = [
      mkLog('2026-05-22T10:00:00Z', 'urgent'),
      mkLog('2026-05-22T11:00:00Z', 'monitor', ['skin_rash']),
      mkAppt('2026-05-22T14:00:00Z'),
      mkLog('2026-05-18T10:00:00Z', 'normal'),
    ];
    const groups = groupEventsByDay(events);
    expect(groups).toHaveLength(2);
    expect(groups[0].dayKey).toBe('2026-05-22');
    expect(groups[0].events).toHaveLength(3);
    expect(groups[0].hasAppointment).toBe(true);
    expect(groups[0].worstOutcome).toBe('urgent');
    expect(groups[0].symptomLogCount).toBe(2);
    expect(groups[0].normalLogCount).toBe(0);
    expect(groups[1].dayKey).toBe('2026-05-18');
    expect(groups[1].worstOutcome).toBe('normal');
    expect(groups[1].normalLogCount).toBe(1);
  });

  it('returns groups newest-first regardless of input order', () => {
    const groups = groupEventsByDay([
      mkLog('2026-05-14T10:00:00Z', 'normal'),
      mkLog('2026-06-04T10:00:00Z', 'urgent'),
      mkLog('2026-05-28T10:00:00Z', 'monitor'),
    ]);
    expect(groups.map((g) => g.dayKey)).toEqual([
      '2026-06-04',
      '2026-05-28',
      '2026-05-14',
    ]);
  });

  it('worstOutcome picks the most-severe even when input order differs', () => {
    const groups = groupEventsByDay([
      mkLog('2026-05-22T08:00:00Z', 'monitor'),
      mkLog('2026-05-22T20:00:00Z', 'urgent'),
      mkLog('2026-05-22T22:00:00Z', 'normal'),
    ]);
    expect(groups[0].worstOutcome).toBe('urgent');
    expect(groups[0].hasUrgentLog).toBe(true);
  });

  it('returns [] for empty input', () => {
    expect(groupEventsByDay([])).toEqual([]);
  });
});

describe('applyTimelineFilters', () => {
  const events = [
    mkLog('2026-06-04T10:00:00Z', 'urgent'),
    mkLog('2026-05-29T10:00:00Z', 'normal'),
    mkLog('2026-05-14T10:00:00Z', 'normal'),
    mkTx('2026-04-14T10:00:00Z', 7, 11),
  ];

  it('drops events outside windowDays', () => {
    const out = applyTimelineFilters(
      events,
      { showNormals: true, urgentOnly: false, windowDays: 30 },
      TODAY
    );
    expect(out.find((e) => e.kind === 'transfusion')).toBeUndefined();
    expect(out).toHaveLength(3);
  });

  it('keeps events inside the window when windowDays is large enough', () => {
    const out = applyTimelineFilters(
      events,
      { showNormals: true, urgentOnly: false, windowDays: 90 },
      TODAY
    );
    expect(out).toHaveLength(4);
  });

  it('showNormals=false hides normal-outcome symptom logs (but keeps TX/appt)', () => {
    const out = applyTimelineFilters(
      [...events, mkAppt('2026-05-22T14:00:00Z')],
      { showNormals: false, urgentOnly: false, windowDays: 60 },
      TODAY
    );
    expect(
      out.find((e) => e.kind === 'symptom_log' && e.log?.outcome === 'normal')
    ).toBeUndefined();
    expect(out.find((e) => e.kind === 'appointment')).toBeDefined();
  });

  it('urgentOnly=true keeps only urgent symptom logs, drops TX + appts', () => {
    const out = applyTimelineFilters(
      [...events, mkAppt('2026-05-22T14:00:00Z')],
      { showNormals: true, urgentOnly: true, windowDays: 60 },
      TODAY
    );
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('symptom_log');
    expect(out[0].log?.outcome).toBe('urgent');
  });
});

describe('computeHbDelta', () => {
  it('returns null when either value is missing', () => {
    expect(computeHbDelta({ pre_hb_g_dl: undefined, post_hb_g_dl: 10 })).toBeNull();
    expect(computeHbDelta({ pre_hb_g_dl: 7, post_hb_g_dl: undefined })).toBeNull();
    expect(computeHbDelta({ pre_hb_g_dl: undefined, post_hb_g_dl: undefined })).toBeNull();
  });

  it('rounds delta to one decimal place', () => {
    expect(computeHbDelta({ pre_hb_g_dl: 7.0, post_hb_g_dl: 10.0 })).toEqual({
      pre: 7.0,
      post: 10.0,
      delta: 3.0,
    });
    expect(computeHbDelta({ pre_hb_g_dl: 7.23, post_hb_g_dl: 10.07 })?.delta).toBe(2.8);
  });

  it('supports negative deltas (rare — sampling error)', () => {
    expect(computeHbDelta({ pre_hb_g_dl: 10, post_hb_g_dl: 9 })?.delta).toBe(-1);
  });
});

describe('countHiddenNormalLogs', () => {
  it('returns zero when both filters allow normals', () => {
    expect(
      countHiddenNormalLogs(
        [mkLog('2026-06-04T10:00:00Z', 'normal')],
        { showNormals: true, urgentOnly: false, windowDays: 30 },
        TODAY
      )
    ).toBe(0);
  });

  it('counts in-window normal logs when showNormals=false', () => {
    const events = [
      mkLog('2026-06-04T10:00:00Z', 'normal'),
      mkLog('2026-05-29T10:00:00Z', 'normal'),
      mkLog('2026-05-14T10:00:00Z', 'normal'),
      mkLog('2026-04-14T10:00:00Z', 'normal'),
      mkLog('2026-06-04T11:00:00Z', 'urgent'),
    ];
    expect(
      countHiddenNormalLogs(
        events,
        { showNormals: false, urgentOnly: false, windowDays: 30 },
        TODAY
      )
    ).toBe(3);
  });

  it('counts hidden normals when urgentOnly=true (everything non-urgent is hidden)', () => {
    expect(
      countHiddenNormalLogs(
        [
          mkLog('2026-06-04T10:00:00Z', 'normal'),
          mkLog('2026-06-04T11:00:00Z', 'monitor'),
        ],
        { showNormals: true, urgentOnly: true, windowDays: 30 },
        TODAY
      )
    ).toBe(1);
  });
});

describe('buildStripCells', () => {
  it('returns windowDays cells, oldest first, with isToday on the last', () => {
    const cells = buildStripCells([], TODAY, 30);
    expect(cells).toHaveLength(30);
    expect(cells[cells.length - 1].isToday).toBe(true);
    expect(cells[0].isToday).toBe(false);
  });

  it('paints transfusion + outcome on the right cells; urgent wins on multi-log days', () => {
    const cells = buildStripCells(
      [
        mkTx('2026-06-04T10:00:00Z', 7, 10),
        mkLog('2026-05-30T10:00:00Z', 'urgent'),
        mkLog('2026-05-30T11:00:00Z', 'monitor'),
        mkLog('2026-05-28T10:00:00Z', 'monitor'),
      ],
      TODAY,
      30
    );
    const map = Object.fromEntries(cells.map((c) => [c.dayKey, c]));
    expect(map['2026-06-04'].hasTransfusion).toBe(true);
    expect(map['2026-05-30'].worstOutcome).toBe('urgent');
    expect(map['2026-05-28'].worstOutcome).toBe('monitor');
  });

  it('ignores events outside the window', () => {
    const cells = buildStripCells(
      [mkLog('2026-01-01T10:00:00Z', 'urgent')],
      TODAY,
      30
    );
    expect(cells.every((c) => c.worstOutcome == null)).toBe(true);
  });
});

describe('buildMonthGrid', () => {
  // Use noon local time to dodge timezone edge cases that would flip the
  // local date for events logged near midnight UTC.
  const VIEW_MONTH = new Date(2026, 5, 1, 12, 0, 0); // June 2026 local
  const TODAY_LOCAL = new Date(2026, 5, 9, 12, 0, 0); // June 9 2026 local

  function mkLogLocal(
    yyyy: number,
    mm: number,
    dd: number,
    outcome: 'normal' | 'monitor' | 'urgent',
    symptoms: string[] = ['fatigue']
  ): CareEvent {
    const d = new Date(yyyy, mm - 1, dd, 12, 0, 0);
    const iso = d.toISOString();
    return {
      id: `log-${yyyy}-${mm}-${dd}-${outcome}`,
      kind: 'symptom_log',
      date: iso,
      log: {
        id: `log-${yyyy}-${mm}-${dd}`,
        user_id: 'p1',
        transfusion_id: null,
        logged_at: iso,
        symptoms,
        severity_scores: Object.fromEntries(symptoms.map((s) => [s, 5])),
        outcome,
        notes: '',
        created_at: iso,
      },
    };
  }

  function mkTxLocal(yyyy: number, mm: number, dd: number, reaction = false): CareEvent {
    const d = new Date(yyyy, mm - 1, dd, 12, 0, 0);
    const iso = d.toISOString();
    return {
      id: `tx-${yyyy}-${mm}-${dd}`,
      kind: 'transfusion',
      date: iso,
      transfusion: {
        id: `tx-${yyyy}-${mm}-${dd}`,
        user_id: 'p1',
        date: iso,
        hospital: 'PMK',
        units_received: 2,
        reaction_noted: reaction,
        reaction_detail: '',
        notes: '',
        pre_hb_g_dl: 7,
        post_hb_g_dl: 10,
        created_at: iso,
      },
    };
  }

  it('returns exactly 42 cells (6 weeks × 7 days)', () => {
    const grid = buildMonthGrid(VIEW_MONTH, TODAY_LOCAL, []);
    expect(grid).toHaveLength(42);
  });

  it('marks isToday on exactly one cell (the local today)', () => {
    const grid = buildMonthGrid(VIEW_MONTH, TODAY_LOCAL, []);
    const todays = grid.filter((c) => c.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0].dayNumber).toBe(9);
    expect(todays[0].inViewMonth).toBe(true);
  });

  it('marks inViewMonth false for spillover days from the prev/next month', () => {
    const grid = buildMonthGrid(VIEW_MONTH, TODAY_LOCAL, []);
    const inMonth = grid.filter((c) => c.inViewMonth);
    expect(inMonth).toHaveLength(30); // June has 30 days
    expect(grid.filter((c) => !c.inViewMonth).length).toBe(12);
  });

  it('paints transfusion + outcomes on the right local-date cells', () => {
    // June 2026 Sun-first grid spans May 31 → July 11. Use spillover days
    // that actually sit inside that span.
    const grid = buildMonthGrid(
      VIEW_MONTH,
      TODAY_LOCAL,
      [
        mkTxLocal(2026, 6, 4),
        mkLogLocal(2026, 5, 31, 'urgent'),
        mkLogLocal(2026, 5, 31, 'monitor'),
        mkLogLocal(2026, 7, 1, 'normal'),
      ]
    );
    const byKey = Object.fromEntries(grid.map((c) => [c.dayKey, c]));
    expect(byKey['2026-06-04'].hasTransfusion).toBe(true);
    expect(byKey['2026-06-04'].outcomes.size).toBe(0);
    expect(byKey['2026-05-31'].outcomes.has('urgent')).toBe(true);
    expect(byKey['2026-05-31'].outcomes.has('monitor')).toBe(true);
    expect(byKey['2026-05-31'].inViewMonth).toBe(false);
    expect(byKey['2026-07-01'].outcomes.has('normal')).toBe(true);
    expect(byKey['2026-07-01'].inViewMonth).toBe(false);
  });

  it('hasReaction flips true when a transfusion has reaction_noted', () => {
    const grid = buildMonthGrid(
      VIEW_MONTH,
      TODAY_LOCAL,
      [mkTxLocal(2026, 6, 4, true)]
    );
    expect(grid.find((c) => c.dayKey === '2026-06-04')?.hasReaction).toBe(true);
  });

  it('weekStartsOn=1 (Monday) puts Monday in column 0', () => {
    // June 1 2026 is a Monday — perfect anchor.
    const grid = buildMonthGrid(VIEW_MONTH, TODAY_LOCAL, [], 1);
    expect(grid[0].dayNumber).toBe(1);
    expect(grid[0].inViewMonth).toBe(true);
  });

  it('weekStartsOn=0 (Sunday) puts the Sunday before the 1st in column 0', () => {
    // June 1 2026 is a Monday, so Sunday May 31 leads the grid.
    const grid = buildMonthGrid(VIEW_MONTH, TODAY_LOCAL, [], 0);
    expect(grid[0].dayNumber).toBe(31);
    expect(grid[0].inViewMonth).toBe(false);
    expect(grid[1].dayNumber).toBe(1);
    expect(grid[1].inViewMonth).toBe(true);
  });
});

describe('getEventsForLocalDay', () => {
  it('returns events whose local date matches the key', () => {
    const iso = new Date(2026, 5, 4, 14, 0, 0).toISOString();
    const tx: CareEvent = {
      id: 'tx-x',
      kind: 'transfusion',
      date: iso,
      transfusion: {
        id: 'tx-x',
        user_id: 'p1',
        date: iso,
        hospital: 'PMK',
        units_received: 2,
        reaction_noted: false,
        reaction_detail: '',
        notes: '',
        created_at: iso,
      },
    };
    expect(getEventsForLocalDay([tx], '2026-06-04')).toHaveLength(1);
    expect(getEventsForLocalDay([tx], '2026-06-03')).toHaveLength(0);
  });
});

describe('countHiddenNormalLogsInMonth', () => {
  function mkLogLocalMonthly(
    yyyy: number,
    mm: number,
    dd: number,
    outcome: 'normal' | 'monitor' | 'urgent'
  ): CareEvent {
    const d = new Date(yyyy, mm - 1, dd, 12, 0, 0);
    const iso = d.toISOString();
    return {
      id: `log-${yyyy}-${mm}-${dd}-${outcome}`,
      kind: 'symptom_log',
      date: iso,
      log: {
        id: `log-${yyyy}-${mm}-${dd}`,
        user_id: 'p1',
        transfusion_id: null,
        logged_at: iso,
        symptoms: ['fatigue'],
        severity_scores: { fatigue: 4 },
        outcome,
        notes: '',
        created_at: iso,
      },
    };
  }

  const VIEW = new Date(2026, 5, 1, 12, 0, 0);

  it('returns zero when normals are visible', () => {
    expect(
      countHiddenNormalLogsInMonth(
        [mkLogLocalMonthly(2026, 6, 4, 'normal')],
        VIEW,
        { showNormals: true, urgentOnly: false }
      )
    ).toBe(0);
  });

  it('counts only in-month normals when showNormals=false', () => {
    expect(
      countHiddenNormalLogsInMonth(
        [
          mkLogLocalMonthly(2026, 6, 4, 'normal'),
          mkLogLocalMonthly(2026, 6, 14, 'normal'),
          mkLogLocalMonthly(2026, 5, 22, 'normal'), // out of view
          mkLogLocalMonthly(2026, 6, 10, 'urgent'),
        ],
        VIEW,
        { showNormals: false, urgentOnly: false }
      )
    ).toBe(2);
  });

  it('counts normals in-month when urgentOnly hides everything else', () => {
    expect(
      countHiddenNormalLogsInMonth(
        [
          mkLogLocalMonthly(2026, 6, 4, 'normal'),
          mkLogLocalMonthly(2026, 6, 14, 'monitor'),
        ],
        VIEW,
        { showNormals: true, urgentOnly: true }
      )
    ).toBe(1);
  });
});

describe('findMostRecentActivityMonth', () => {
  const TODAY_LOCAL = new Date(2026, 5, 9, 12, 0, 0); // 2026-06-09 local

  function mkEv(yyyy: number, mm: number, dd: number): CareEvent {
    const iso = new Date(yyyy, mm - 1, dd, 12, 0, 0).toISOString();
    return {
      id: `ev-${yyyy}-${mm}-${dd}`,
      kind: 'symptom_log',
      date: iso,
      log: {
        id: `log-${yyyy}-${mm}-${dd}`,
        user_id: 'p1',
        transfusion_id: null,
        logged_at: iso,
        symptoms: ['fatigue'],
        severity_scores: { fatigue: 5 },
        outcome: 'urgent',
        notes: '',
        created_at: iso,
      },
    };
  }

  it('returns today when there is no activity at all', () => {
    expect(findMostRecentActivityMonth([], TODAY_LOCAL)).toEqual(TODAY_LOCAL);
  });

  it('returns today when this month has any activity', () => {
    const res = findMostRecentActivityMonth(
      [mkEv(2026, 6, 4), mkEv(2026, 5, 30)],
      TODAY_LOCAL
    );
    expect(res).toEqual(TODAY_LOCAL);
  });

  it('returns the latest event date when this month has no activity', () => {
    const res = findMostRecentActivityMonth(
      [mkEv(2026, 5, 30), mkEv(2026, 5, 14), mkEv(2026, 4, 12)],
      TODAY_LOCAL
    );
    expect(res.getFullYear()).toBe(2026);
    expect(res.getMonth()).toBe(4); // May
    expect(res.getDate()).toBe(30);
  });

  it('does not assume input order — finds the latest regardless of position', () => {
    const res = findMostRecentActivityMonth(
      [mkEv(2026, 1, 10), mkEv(2026, 5, 30), mkEv(2026, 3, 20)],
      TODAY_LOCAL
    );
    expect(res.getMonth()).toBe(4); // May
  });
});

describe('cellTintForMonthCell', () => {
  function mkCell(partial: Partial<MonthCell>): MonthCell {
    return {
      dayKey: '2026-06-04',
      date: new Date(2026, 5, 4).toISOString(),
      dayNumber: 4,
      inViewMonth: true,
      isToday: false,
      hasTransfusion: false,
      hasAppointment: false,
      hasReaction: false,
      outcomes: new Set(),
      eventCount: 0,
      ...partial,
    };
  }

  it('returns null for an empty day', () => {
    expect(cellTintForMonthCell(mkCell({}))).toBeNull();
  });

  it('returns null for appointment-only (no severity, no TX) — corner glyph carries it', () => {
    expect(cellTintForMonthCell(mkCell({ hasAppointment: true }))).toBeNull();
  });

  it('urgent beats monitor beats TX beats normal', () => {
    expect(
      cellTintForMonthCell(
        mkCell({
          outcomes: new Set(['urgent', 'monitor', 'normal']),
          hasTransfusion: true,
        })
      )
    ).toBe('urgent');
    expect(
      cellTintForMonthCell(
        mkCell({
          outcomes: new Set(['monitor', 'normal']),
          hasTransfusion: true,
        })
      )
    ).toBe('monitor');
    expect(
      cellTintForMonthCell(
        mkCell({ outcomes: new Set(['normal']), hasTransfusion: true })
      )
    ).toBe('tx');
    expect(
      cellTintForMonthCell(mkCell({ outcomes: new Set(['normal']) }))
    ).toBe('normal');
  });
});
