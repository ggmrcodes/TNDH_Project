import {
  groupEventsByDay,
  applyTimelineFilters,
  computeHbDelta,
  countHiddenNormalLogs,
  buildStripCells,
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
