/**
 * Pure data layer for the lab-trends graph.
 *
 * Sources Hb / Hct / Ferritin values from `transfusion.pre_labs` (the new
 * field introduced by docs/superpowers/specs/2026-05-17-pre-transfusion-labs-brief.md).
 *
 * Important: there is also a legacy `transfusion.pre_hb_g_dl` column used by
 * the pre-existing Hb-decay analytics (see `analytics/hbDecay.ts` and
 * `components/charts/HbTrendChart.tsx`). For this new lab-trends graph we
 * intentionally prefer `pre_labs.hb` over the legacy column — but if a
 * transfusion has only the legacy `pre_hb_g_dl` and no `pre_labs`, we fall
 * back so legacy data still appears on the trend. (Decision documented per
 * the brief; `pre_labs.hb` wins when both are present.)
 *
 * No React in this file — keep it pure and unit-testable.
 *
 * See docs/superpowers/specs/2026-05-17-lab-trends-graph-brief.md.
 */

import type { Transfusion } from '../types/database';

/** A single (date, value) point on a lab series. `value` is never null —
 * points with missing values are filtered out upstream. */
export interface LabPoint {
  /** Epoch milliseconds. Always finite. */
  ts: number;
  /** Lab value in its fixed unit (g/dL, %, or ng/mL). Always finite. */
  value: number;
}

export type LabWindow = '1mo' | '3mo' | '6mo' | '1y' | 'all';

export interface LabTrendsSeries {
  hb: LabPoint[];
  hct: LabPoint[];
  ferritin: LabPoint[];
  /** Transfusion event dates inside the window. Used for vertical-line
   * markers on the clinician chart. Sorted ascending. */
  transfusionMarkers: number[];
}

const DAYS = 24 * 60 * 60 * 1000;

const WINDOW_DAYS: Record<Exclude<LabWindow, 'all'>, number> = {
  '1mo': 30,
  '3mo': 90,
  '6mo': 180,
  '1y': 365,
};

/** Cutoff timestamp (epoch ms) for a window, relative to `now`. Returns
 * `-Infinity` for `'all'` so no filtering happens. */
export function windowCutoff(window: LabWindow, now: Date = new Date()): number {
  if (window === 'all') return -Infinity;
  return now.getTime() - WINDOW_DAYS[window] * DAYS;
}

/** Parse a Transfusion + return its preferred record timestamp for a lab
 * point. We use `pre_labs.recorded_at` if present (most accurate — when
 * the lab was drawn), otherwise fall back to `transfusion.date`. */
function pointTimestamp(tx: Transfusion): number | null {
  const iso = tx.pre_labs?.recorded_at ?? tx.date;
  const ts = new Date(iso).getTime();
  return Number.isFinite(ts) ? ts : null;
}

/** Read the Hb value preferring the new `pre_labs.hb` over the legacy
 * `pre_hb_g_dl` column. Returns `null` if neither is present or both are
 * non-numeric. */
function readHb(tx: Transfusion): number | null {
  const fromLabs = tx.pre_labs?.hb;
  if (fromLabs != null && Number.isFinite(fromLabs)) return fromLabs;
  if (tx.pre_hb_g_dl != null && Number.isFinite(tx.pre_hb_g_dl)) return tx.pre_hb_g_dl;
  return null;
}

function readHct(tx: Transfusion): number | null {
  const v = tx.pre_labs?.hct;
  return v != null && Number.isFinite(v) ? v : null;
}

function readFerritin(tx: Transfusion): number | null {
  const v = tx.pre_labs?.ferritin;
  return v != null && Number.isFinite(v) ? v : null;
}

/** Build per-series points + transfusion markers for the chart.
 *
 * - Input order is irrelevant; output is sorted ascending by ts within
 *   each series.
 * - Points whose value is null/undefined/NaN are dropped (per-series, so
 *   a transfusion with only Hb still contributes to Hb).
 * - The `window` filter applies to BOTH series points and transfusion
 *   markers (the marker is anchored on the transfusion's own `date`).
 * - Down-samples large inputs to `maxPoints` per series via uniform
 *   stride sampling, always preserving the first and last point. The
 *   clinician chart sets ~200; sparklines pass a larger number / Infinity.
 */
export function buildLabTrendsSeries(
  transfusions: Transfusion[],
  window: LabWindow = '6mo',
  opts: { now?: Date; maxPoints?: number } = {}
): LabTrendsSeries {
  const now = opts.now ?? new Date();
  const maxPoints = opts.maxPoints ?? Infinity;
  const cutoff = windowCutoff(window, now);

  const hb: LabPoint[] = [];
  const hct: LabPoint[] = [];
  const ferritin: LabPoint[] = [];
  const markers: number[] = [];

  for (const tx of transfusions) {
    const ts = pointTimestamp(tx);
    if (ts == null || ts < cutoff) {
      // Even if this transfusion is out of the window, skip it entirely.
      // The marker check below also requires the tx itself to fall inside.
    }

    // Transfusion-event marker — anchored on the transfusion's own `date`,
    // not the labs' recorded_at, because the marker represents the event.
    const txDateTs = new Date(tx.date).getTime();
    if (Number.isFinite(txDateTs) && txDateTs >= cutoff) {
      markers.push(txDateTs);
    }

    // Per-series points use the labs' recorded_at (or fall back to tx.date).
    if (ts == null || ts < cutoff) continue;

    const hbVal = readHb(tx);
    if (hbVal != null) hb.push({ ts, value: hbVal });

    const hctVal = readHct(tx);
    if (hctVal != null) hct.push({ ts, value: hctVal });

    const ferVal = readFerritin(tx);
    if (ferVal != null) ferritin.push({ ts, value: ferVal });
  }

  hb.sort((a, b) => a.ts - b.ts);
  hct.sort((a, b) => a.ts - b.ts);
  ferritin.sort((a, b) => a.ts - b.ts);
  markers.sort((a, b) => a - b);

  return {
    hb: downsample(hb, maxPoints),
    hct: downsample(hct, maxPoints),
    ferritin: downsample(ferritin, maxPoints),
    transfusionMarkers: markers,
  };
}

/** Uniform-stride downsampling. Always preserves first + last points.
 * For `n <= max` returns the input unchanged. */
export function downsample(points: LabPoint[], max: number): LabPoint[] {
  if (!Number.isFinite(max) || points.length <= max) return points;
  if (max < 2) return points.slice(0, Math.max(0, Math.floor(max)));

  const out: LabPoint[] = [];
  const stride = (points.length - 1) / (max - 1);
  for (let i = 0; i < max - 1; i++) {
    out.push(points[Math.floor(i * stride)]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Convenience: latest value of a series (already sorted ascending), or
 * `null` if empty. */
export function latestValue(series: LabPoint[]): LabPoint | null {
  if (series.length === 0) return null;
  return series[series.length - 1];
}
