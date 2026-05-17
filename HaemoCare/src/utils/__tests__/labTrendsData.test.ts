import {
  buildLabTrendsSeries,
  downsample,
  latestValue,
  windowCutoff,
  type LabPoint,
} from '../labTrendsData';
import type { Transfusion, PreTransfusionLabs } from '../../types/database';

const NOW = new Date('2026-05-17T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function tx(overrides: Partial<Transfusion>): Transfusion {
  return {
    id: overrides.id ?? 'tx-1',
    user_id: 'patient-1',
    date: overrides.date ?? '2026-05-01T08:00:00Z',
    hospital: 'Test Hospital',
    units_received: 1,
    reaction_noted: false,
    reaction_detail: '',
    notes: '',
    created_at: '2026-05-01T08:00:00Z',
    ...overrides,
  };
}

function labs(overrides: Partial<PreTransfusionLabs>): PreTransfusionLabs {
  return {
    hb: 9.5,
    hct: 30,
    ferritin: 50,
    recorded_at: '2026-05-01T08:00:00Z',
    recorded_by_user_id: 'patient-1',
    verified_by_clinician_id: null,
    lab_slip_photo_url: null,
    source: 'manual',
    ...overrides,
  };
}

describe('windowCutoff', () => {
  it('returns -Infinity for "all"', () => {
    expect(windowCutoff('all', NOW)).toBe(-Infinity);
  });

  it('returns now minus 30 days for "1mo"', () => {
    expect(windowCutoff('1mo', NOW)).toBe(NOW.getTime() - 30 * DAY);
  });

  it('returns now minus 180 days for "6mo"', () => {
    expect(windowCutoff('6mo', NOW)).toBe(NOW.getTime() - 180 * DAY);
  });
});

describe('buildLabTrendsSeries — window filtering', () => {
  it('drops points outside the window', () => {
    const transfusions: Transfusion[] = [
      tx({
        id: 'old',
        date: '2025-01-01T08:00:00Z', // way outside 6mo
        pre_labs: labs({ hb: 8, recorded_at: '2025-01-01T08:00:00Z' }),
      }),
      tx({
        id: 'recent',
        date: '2026-04-15T08:00:00Z',
        pre_labs: labs({ hb: 10, recorded_at: '2026-04-15T08:00:00Z' }),
      }),
    ];
    const result = buildLabTrendsSeries(transfusions, '6mo', { now: NOW });
    expect(result.hb).toHaveLength(1);
    expect(result.hb[0].value).toBe(10);
  });

  it('keeps everything when window is "all"', () => {
    const transfusions: Transfusion[] = [
      tx({ id: 'a', date: '2020-01-01T08:00:00Z', pre_labs: labs({ hb: 7, recorded_at: '2020-01-01T08:00:00Z' }) }),
      tx({ id: 'b', date: '2026-04-15T08:00:00Z', pre_labs: labs({ hb: 9, recorded_at: '2026-04-15T08:00:00Z' }) }),
    ];
    const result = buildLabTrendsSeries(transfusions, 'all', { now: NOW });
    expect(result.hb).toHaveLength(2);
  });

  it('filters markers using the window too', () => {
    const transfusions: Transfusion[] = [
      tx({ id: 'old', date: '2025-01-01T08:00:00Z' }),
      tx({ id: 'recent', date: '2026-04-15T08:00:00Z' }),
    ];
    const result = buildLabTrendsSeries(transfusions, '6mo', { now: NOW });
    expect(result.transfusionMarkers).toHaveLength(1);
    expect(result.transfusionMarkers[0]).toBe(new Date('2026-04-15T08:00:00Z').getTime());
  });
});

describe('buildLabTrendsSeries — missing values', () => {
  it('drops points with null hb but keeps hct/ferritin for the same tx', () => {
    const transfusions: Transfusion[] = [
      tx({
        id: 'a',
        date: '2026-04-15T08:00:00Z',
        pre_labs: labs({ hb: null, hct: 32, ferritin: 60, recorded_at: '2026-04-15T08:00:00Z' }),
      }),
    ];
    const result = buildLabTrendsSeries(transfusions, '6mo', { now: NOW });
    expect(result.hb).toHaveLength(0);
    expect(result.hct).toHaveLength(1);
    expect(result.ferritin).toHaveLength(1);
  });

  it('does NOT draw "0" for null values', () => {
    const transfusions: Transfusion[] = [
      tx({
        id: 'a',
        date: '2026-04-15T08:00:00Z',
        pre_labs: labs({ hb: null, hct: null, ferritin: null, recorded_at: '2026-04-15T08:00:00Z' }),
      }),
    ];
    const result = buildLabTrendsSeries(transfusions, '6mo', { now: NOW });
    expect(result.hb).toHaveLength(0);
    expect(result.hct).toHaveLength(0);
    expect(result.ferritin).toHaveLength(0);
  });

  it('handles transfusions with no pre_labs at all (only legacy pre_hb_g_dl)', () => {
    const transfusions: Transfusion[] = [
      tx({ id: 'legacy', date: '2026-04-15T08:00:00Z', pre_hb_g_dl: 8.5 }),
    ];
    const result = buildLabTrendsSeries(transfusions, '6mo', { now: NOW });
    // Legacy fallback: hb comes through.
    expect(result.hb).toEqual([{ ts: new Date('2026-04-15T08:00:00Z').getTime(), value: 8.5 }]);
    // hct/ferritin have no legacy source.
    expect(result.hct).toHaveLength(0);
    expect(result.ferritin).toHaveLength(0);
  });

  it('prefers pre_labs.hb over legacy pre_hb_g_dl when both are set', () => {
    const transfusions: Transfusion[] = [
      tx({
        id: 'both',
        date: '2026-04-15T08:00:00Z',
        pre_hb_g_dl: 7.0,
        pre_labs: labs({ hb: 9.2, recorded_at: '2026-04-15T08:00:00Z' }),
      }),
    ];
    const result = buildLabTrendsSeries(transfusions, '6mo', { now: NOW });
    expect(result.hb[0].value).toBe(9.2);
  });
});

describe('buildLabTrendsSeries — ordering', () => {
  it('sorts each series ascending by timestamp regardless of input order', () => {
    const transfusions: Transfusion[] = [
      tx({ id: 'c', date: '2026-05-10T08:00:00Z', pre_labs: labs({ hb: 11, recorded_at: '2026-05-10T08:00:00Z' }) }),
      tx({ id: 'a', date: '2026-03-01T08:00:00Z', pre_labs: labs({ hb: 8,  recorded_at: '2026-03-01T08:00:00Z' }) }),
      tx({ id: 'b', date: '2026-04-15T08:00:00Z', pre_labs: labs({ hb: 9,  recorded_at: '2026-04-15T08:00:00Z' }) }),
    ];
    const result = buildLabTrendsSeries(transfusions, '6mo', { now: NOW });
    expect(result.hb.map(p => p.value)).toEqual([8, 9, 11]);
    expect(result.transfusionMarkers).toEqual([
      new Date('2026-03-01T08:00:00Z').getTime(),
      new Date('2026-04-15T08:00:00Z').getTime(),
      new Date('2026-05-10T08:00:00Z').getTime(),
    ]);
  });
});

describe('buildLabTrendsSeries — transfusion-marker extraction', () => {
  it('emits one marker per transfusion inside the window', () => {
    const transfusions: Transfusion[] = [
      tx({ id: 'a', date: '2026-04-01T08:00:00Z' }),
      tx({ id: 'b', date: '2026-04-15T08:00:00Z' }),
      tx({ id: 'c', date: '2026-05-01T08:00:00Z' }),
    ];
    const result = buildLabTrendsSeries(transfusions, '6mo', { now: NOW });
    expect(result.transfusionMarkers).toHaveLength(3);
  });

  it('emits a marker even when the transfusion has no lab values', () => {
    const transfusions: Transfusion[] = [
      tx({ id: 'a', date: '2026-04-15T08:00:00Z' }), // no pre_labs, no legacy
    ];
    const result = buildLabTrendsSeries(transfusions, '6mo', { now: NOW });
    expect(result.transfusionMarkers).toHaveLength(1);
    expect(result.hb).toHaveLength(0);
  });
});

describe('buildLabTrendsSeries — empty input', () => {
  it('returns empty series + markers for empty input', () => {
    const result = buildLabTrendsSeries([], '6mo', { now: NOW });
    expect(result.hb).toEqual([]);
    expect(result.hct).toEqual([]);
    expect(result.ferritin).toEqual([]);
    expect(result.transfusionMarkers).toEqual([]);
  });
});

describe('buildLabTrendsSeries — downsampling', () => {
  it('downsamples series above maxPoints while keeping first and last', () => {
    // 500 transfusions over the last 500 days, all inside 'all' window.
    const transfusions: Transfusion[] = [];
    for (let i = 0; i < 500; i++) {
      const dateMs = NOW.getTime() - (500 - i) * DAY;
      const iso = new Date(dateMs).toISOString();
      transfusions.push(tx({
        id: `tx-${i}`,
        date: iso,
        pre_labs: labs({ hb: 8 + (i % 5) * 0.1, recorded_at: iso }),
      }));
    }
    const result = buildLabTrendsSeries(transfusions, 'all', { now: NOW, maxPoints: 200 });
    expect(result.hb).toHaveLength(200);
    // First and last preserved.
    expect(result.hb[0].ts).toBe(transfusions[0].pre_labs!.recorded_at ? new Date(transfusions[0].pre_labs!.recorded_at).getTime() : 0);
    expect(result.hb[199].ts).toBe(new Date(transfusions[499].pre_labs!.recorded_at).getTime());
  });

  it('leaves small series untouched', () => {
    const transfusions: Transfusion[] = [
      tx({ id: 'a', date: '2026-04-01T08:00:00Z', pre_labs: labs({ hb: 8, recorded_at: '2026-04-01T08:00:00Z' }) }),
      tx({ id: 'b', date: '2026-05-01T08:00:00Z', pre_labs: labs({ hb: 9, recorded_at: '2026-05-01T08:00:00Z' }) }),
    ];
    const result = buildLabTrendsSeries(transfusions, '6mo', { now: NOW, maxPoints: 200 });
    expect(result.hb).toHaveLength(2);
  });
});

describe('downsample helper', () => {
  it('returns input unchanged when within limit', () => {
    const pts: LabPoint[] = [{ ts: 1, value: 1 }, { ts: 2, value: 2 }];
    expect(downsample(pts, 5)).toBe(pts);
  });

  it('always includes first and last when reducing', () => {
    const pts: LabPoint[] = Array.from({ length: 10 }, (_, i) => ({ ts: i, value: i }));
    const out = downsample(pts, 3);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ ts: 0, value: 0 });
    expect(out[out.length - 1]).toEqual({ ts: 9, value: 9 });
  });
});

describe('latestValue', () => {
  it('returns null for empty series', () => {
    expect(latestValue([])).toBeNull();
  });

  it('returns the last entry of a sorted series', () => {
    const series: LabPoint[] = [{ ts: 1, value: 10 }, { ts: 2, value: 11 }];
    expect(latestValue(series)).toEqual({ ts: 2, value: 11 });
  });
});
