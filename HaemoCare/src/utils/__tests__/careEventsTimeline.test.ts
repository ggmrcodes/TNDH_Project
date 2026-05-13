import { buildCareEventsTimeline } from '../careEventsTimeline';
import type { Transfusion, SymptomLog, Appointment } from '../../types/database';

const TODAY = new Date('2026-05-12T12:00:00Z');

const mkTx = (overrides: Partial<Transfusion> = {}): Transfusion => ({
  id: 'tx-default',
  user_id: 'u1',
  date: '2026-05-01T10:00:00Z',
  hospital: 'Hosp A',
  units_received: 2,
  reaction_noted: false,
  reaction_detail: '',
  notes: '',
  created_at: '2026-05-01T10:05:00Z',
  ...overrides,
});

const mkLog = (overrides: Partial<SymptomLog> = {}): SymptomLog => ({
  id: 'log-default',
  user_id: 'u1',
  transfusion_id: null,
  logged_at: '2026-05-02T08:00:00Z',
  symptoms: ['fatigue'],
  severity_scores: {},
  outcome: 'normal',
  notes: '',
  created_at: '2026-05-02T08:00:00Z',
  ...overrides,
});

const mkAppt = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: 'appt-default',
  user_id: 'u1',
  scheduled_date: '2026-05-03T09:00:00Z',
  hospital: 'Hosp B',
  notes: '',
  linked_transfusion_id: null,
  source: 'manual',
  external_id: null,
  external_source_name: null,
  created_at: '2026-05-03T09:00:00Z',
  ...overrides,
});

describe('buildCareEventsTimeline — empty', () => {
  it('returns empty events and zero total when all sources empty', () => {
    const result = buildCareEventsTimeline({
      transfusions: [],
      logs: [],
      appointments: [],
      today: TODAY,
    });
    expect(result.events).toEqual([]);
    expect(result.totalInWindow).toBe(0);
  });
});

describe('buildCareEventsTimeline — appointment past-only filter', () => {
  it('excludes future appointments', () => {
    const future = mkAppt({ id: 'fut', scheduled_date: '2026-06-01T09:00:00Z' });
    const result = buildCareEventsTimeline({
      transfusions: [],
      logs: [],
      appointments: [future],
      today: TODAY,
    });
    expect(result.events).toHaveLength(0);
    expect(result.totalInWindow).toBe(0);
  });

  it('includes past appointments inside window', () => {
    const past = mkAppt({ id: 'past', scheduled_date: '2026-05-03T09:00:00Z' });
    const result = buildCareEventsTimeline({
      transfusions: [],
      logs: [],
      appointments: [past],
      today: TODAY,
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe('appt-past');
    expect(result.events[0].kind).toBe('appointment');
  });
});

describe('buildCareEventsTimeline — 60-day window cutoff', () => {
  it('excludes events older than the default 60-day window', () => {
    // 70 days before today
    const ancient = mkTx({ id: 'old', date: '2026-03-03T10:00:00Z' });
    const recent = mkTx({ id: 'new', date: '2026-05-01T10:00:00Z' });
    const result = buildCareEventsTimeline({
      transfusions: [ancient, recent],
      logs: [],
      appointments: [],
      today: TODAY,
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe('tx-new');
    expect(result.totalInWindow).toBe(1);
  });

  it('respects a custom windowDays argument', () => {
    const tx20 = mkTx({ id: 'within', date: '2026-04-29T10:00:00Z' }); // 13 days ago
    const tx40 = mkTx({ id: 'outside', date: '2026-04-02T10:00:00Z' }); // 40 days ago
    const result = buildCareEventsTimeline({
      transfusions: [tx20, tx40],
      logs: [],
      appointments: [],
      today: TODAY,
      windowDays: 30,
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe('tx-within');
  });

  it('includes an event exactly at calendar-day-aligned windowStart (60 days before today, 00:00 UTC)', () => {
    // TODAY = 2026-05-12T12:00:00Z → startOfUtcDay = 2026-05-12T00:00:00Z
    // windowStart = 2026-05-12T00:00:00Z - 60 days = 2026-03-13T00:00:00Z
    const onBoundary = mkTx({ id: 'boundary', date: '2026-03-13T00:00:00Z' });
    const result = buildCareEventsTimeline({
      transfusions: [onBoundary],
      logs: [],
      appointments: [],
      today: TODAY,
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe('tx-boundary');
    expect(result.totalInWindow).toBe(1);
  });
});

describe('buildCareEventsTimeline — sorting', () => {
  it('sorts mixed-kind events by date descending', () => {
    const tx = mkTx({ id: 'a', date: '2026-05-05T10:00:00Z' });
    const log = mkLog({ id: 'b', logged_at: '2026-05-08T10:00:00Z' });
    const appt = mkAppt({ id: 'c', scheduled_date: '2026-05-02T10:00:00Z' });

    const result = buildCareEventsTimeline({
      transfusions: [tx],
      logs: [log],
      appointments: [appt],
      today: TODAY,
    });

    expect(result.events.map((e) => e.id)).toEqual(['log-b', 'tx-a', 'appt-c']);
  });

  it('breaks ties by source order: tx, log, appt', () => {
    const sameDate = '2026-05-05T10:00:00Z';
    const tx = mkTx({ id: 'a', date: sameDate });
    const log = mkLog({ id: 'b', logged_at: sameDate });
    const appt = mkAppt({ id: 'c', scheduled_date: sameDate });

    const result = buildCareEventsTimeline({
      transfusions: [tx],
      logs: [log],
      appointments: [appt],
      today: TODAY,
    });

    expect(result.events.map((e) => e.kind)).toEqual([
      'transfusion',
      'symptom_log',
      'appointment',
    ]);
  });
});

describe('buildCareEventsTimeline — truncation', () => {
  it('truncates to default maxEvents=25 and reports totalInWindow accurately', () => {
    const logs: SymptomLog[] = [];
    for (let i = 0; i < 30; i++) {
      // 30 logs all within the last 30 days
      const day = String(i + 1).padStart(2, '0');
      logs.push(
        mkLog({
          id: `l${i}`,
          logged_at: `2026-04-${day}T10:00:00Z`,
        })
      );
    }
    const result = buildCareEventsTimeline({
      transfusions: [],
      logs,
      appointments: [],
      today: TODAY,
    });
    expect(result.events).toHaveLength(25);
    expect(result.totalInWindow).toBe(30);
  });

  it('respects a custom maxEvents argument', () => {
    const logs: SymptomLog[] = [];
    for (let i = 1; i <= 10; i++) {
      const day = String(i).padStart(2, '0');
      logs.push(mkLog({ id: `l${i}`, logged_at: `2026-05-${day}T10:00:00Z` }));
    }
    const result = buildCareEventsTimeline({
      transfusions: [],
      logs,
      appointments: [],
      today: TODAY,
      maxEvents: 3,
    });
    expect(result.events).toHaveLength(3);
    expect(result.totalInWindow).toBe(10);
  });
});

describe('buildCareEventsTimeline — id prefixes & payloads', () => {
  it('prefixes ids and attaches source row to event', () => {
    const tx = mkTx({ id: 't1' });
    const log = mkLog({ id: 'l1' });
    const appt = mkAppt({ id: 'a1' });
    const result = buildCareEventsTimeline({
      transfusions: [tx],
      logs: [log],
      appointments: [appt],
      today: TODAY,
    });
    const ids = result.events.map((e) => e.id);
    expect(ids).toContain('tx-t1');
    expect(ids).toContain('log-l1');
    expect(ids).toContain('appt-a1');

    const txEvent = result.events.find((e) => e.id === 'tx-t1');
    const logEvent = result.events.find((e) => e.id === 'log-l1');
    const apptEvent = result.events.find((e) => e.id === 'appt-a1');
    expect(txEvent?.transfusion).toBe(tx);
    expect(logEvent?.log).toBe(log);
    expect(apptEvent?.appointment).toBe(appt);
  });
});
