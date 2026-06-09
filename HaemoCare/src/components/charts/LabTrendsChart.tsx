/**
 * Lab-trends for the clinician patient drill-down.
 *
 * Hb / Hct / Ferritin each render as their OWN stacked chart with a real
 * y-axis in real units (g/dL, %, ng/mL) — no normalization, no overlay, no
 * series toggle. The three plots share one aligned x-axis (time) and a single
 * window selector so a clinician can read the same date vertically across all
 * three. Per-plot: transfusion-date markers + tap-a-point tooltip.
 *
 * Custom SVG (no new dep — react-native-svg is already in the tree).
 * Reference-range bands intentionally NOT drawn (deferred threshold decision).
 * Performance: caller passes a downsampled series (cap ~200 pts/series).
 *
 * See docs/superpowers/specs/2026-05-17-lab-trends-graph-brief.md.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Svg, { Polyline, Line, Circle, Text as SvgText, Rect } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import type { LabPoint, LabWindow } from '../../utils/labTrendsData';
import { buildLabTrendsSeries, formatLabValue } from '../../utils/labTrendsData';
import { shortDayMonth } from '../../utils/dateHelpers';
import type { Transfusion } from '../../types/database';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../config/theme';

export interface LabTrendsChartProps {
  transfusions: Transfusion[];
  /** Labels are passed in so the parent can localize. Keys are stable. */
  labels: {
    title: string;
    hb: string;          // "Hemoglobin (g/dL)"
    hct: string;         // "Hematocrit (%)"
    ferritin: string;    // "Ferritin (ng/mL)"
    empty: string;       // "No lab data yet — add pre-transfusion labs to start tracking"
    windows: {
      '1mo': string;
      '3mo': string;
      '6mo': string;
      '1y': string;
      all: string;
    };
    markerHint: string;  // "| transfusion"
  };
  /** Container width hint. Defaults to ~340 (mobile card width). */
  width?: number;
  /** Cap on points per series (down-sampled in `buildLabTrendsSeries`). */
  maxPoints?: number;
  /** When set, the Hb subplot renders a dashed red horizontal line at
   * this value + a right-edge severity chip. The y-axis auto-extends
   * to include this value when no data point reaches it. */
  hbFloor?: number;
  /** Same shape, ferritin ceiling (amber). */
  ferritinCeiling?: number;
  /** Tapping the gear icon in the chart header fires this. Caller is
   * expected to open ThresholdEditSheet. When undefined, the gear icon
   * is suppressed (used for patient-side embeddings). */
  onEditThresholds?: () => void;
}

type SeriesKey = 'hb' | 'hct' | 'ferritin';

const SERIES_ORDER: SeriesKey[] = ['hb', 'hct', 'ferritin'];

const SERIES_COLORS: Record<SeriesKey, string> = {
  hb:       COLORS.primary,        // teal — primary brand series
  hct:      COLORS.accent,         // coral — secondary
  ferritin: COLORS.statusNormal,   // green — distinct from the other two
};

const WINDOW_STORAGE_KEY = 'haemocare.labTrends.window.v1';
const ALL_WINDOWS: LabWindow[] = ['1mo', '3mo', '6mo', '1y', 'all'];

export default function LabTrendsChart({
  transfusions,
  labels,
  width = 340,
  maxPoints = 200,
  hbFloor,
  ferritinCeiling,
  onEditThresholds,
}: LabTrendsChartProps) {
  const [window, setWindow] = useState<LabWindow>('6mo');

  // Restore persisted window choice (SecureStore is user-scoped via auth state).
  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(WINDOW_STORAGE_KEY).then(val => {
      if (cancelled) return;
      if (val && (ALL_WINDOWS as string[]).includes(val)) setWindow(val as LabWindow);
    }).catch(() => { /* SecureStore absent on web — default to '6mo' */ });
    return () => { cancelled = true; };
  }, []);

  const persistWindow = useCallback((w: LabWindow) => {
    setWindow(w);
    SecureStore.setItemAsync(WINDOW_STORAGE_KEY, w).catch(() => { /* non-fatal */ });
  }, []);

  const series = useMemo(
    () => buildLabTrendsSeries(transfusions, window, { maxPoints }),
    [transfusions, window, maxPoints]
  );

  // Shared x-domain across ALL metrics + markers so the three stacked plots
  // line up in time.
  const xs: number[] = [];
  for (const k of SERIES_ORDER) for (const p of series[k]) xs.push(p.ts);
  for (const m of series.transfusionMarkers) xs.push(m);
  const xMin = xs.length > 0 ? Math.min(...xs) : 0;
  const xMax = xs.length > 0 ? Math.max(...xs) : 1;

  const hasAnyPoints = SERIES_ORDER.some(k => series[k].length > 0);
  const hasAnyMarkers = series.transfusionMarkers.length > 0;

  if (!hasAnyPoints && !hasAnyMarkers) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{labels.empty}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Window selector — shared across all three plots */}
      <View style={styles.headerRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.windowRow}>
          {ALL_WINDOWS.map(w => (
            <TouchableOpacity
              key={w}
              style={[styles.windowChip, window === w && styles.windowChipActive]}
              onPress={() => persistWindow(w)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: window === w }}
            >
              <Text style={[styles.windowChipText, window === w && styles.windowChipTextActive]}>
                {labels.windows[w]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {onEditThresholds && (
          <TouchableOpacity
            onPress={onEditThresholds}
            style={styles.thresholdBtn}
            hitSlop={6}
            accessibilityRole="button"
          >
            <Feather name="sliders" size={14} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {SERIES_ORDER.map(k => {
        let threshold: MetricPlotProps['threshold'] = undefined;
        if (k === 'hb' && hbFloor !== undefined) {
          threshold = {
            value: hbFloor,
            label: hbFloor.toFixed(1),
            lineColor: COLORS.statusUrgent,
            chipBgColor: COLORS.statusUrgentBg,
            chipTextColor: COLORS.statusUrgentText,
          };
        } else if (k === 'ferritin' && ferritinCeiling !== undefined) {
          threshold = {
            value: ferritinCeiling,
            label: String(Math.round(ferritinCeiling)),
            lineColor: COLORS.statusMonitor,
            chipBgColor: COLORS.statusMonitorBg,
            chipTextColor: COLORS.statusMonitorText,
          };
        }
        return (
          <MetricPlot
            key={k}
            label={labels[k]}
            color={SERIES_COLORS[k]}
            points={series[k]}
            markers={series.transfusionMarkers}
            xMin={xMin}
            xMax={xMax}
            width={width}
            emptyText={labels.empty}
            threshold={threshold}
          />
        );
      })}

      {hasAnyMarkers && <Text style={styles.markerHint}>{labels.markerHint}</Text>}
    </View>
  );
}

// ── Single-metric plot (its own real y-axis) ───────────────────────────────

interface MetricPlotProps {
  label: string;
  color: string;
  points: LabPoint[];
  markers: number[];
  xMin: number;
  xMax: number;
  width: number;
  emptyText: string;
  threshold?: {
    value: number;
    /** Pre-formatted chip label (e.g., '7.0'). */
    label: string;
    lineColor: string;
    chipBgColor: string;
    chipTextColor: string;
  };
}

function MetricPlot({ label, color, points, markers, xMin, xMax, width, emptyText, threshold }: MetricPlotProps) {
  const [tooltip, setTooltip] = useState<LabPoint | null>(null);

  const padL = 40;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  const height = 150;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xRange = xMax - xMin || 1;
  const xScale = (ts: number) => padL + ((ts - xMin) / xRange) * plotW;

  // Real y-domain from this metric's own values (5% margin; pad a flat series).
  const { yMin, yMax } = useMemo(() => {
    const values = points.map(p => p.value);
    const candidates: number[] = [...values];
    if (threshold !== undefined) candidates.push(threshold.value);
    if (candidates.length === 0) return { yMin: 0, yMax: 1 };
    const lo = Math.min(...candidates);
    const hi = Math.max(...candidates);
    if (lo === hi) {
      const pad = Math.max(1, Math.abs(lo) * 0.1);
      return { yMin: lo - pad, yMax: hi + pad };
    }
    const margin = (hi - lo) * 0.05;
    return { yMin: lo - margin, yMax: hi + margin };
  }, [points, threshold?.value]);

  const yRange = yMax - yMin || 1;
  const yScale = (v: number) => padT + (1 - (v - yMin) / yRange) * plotH;
  const yTicks = niceTicks(yMin, yMax, 4);
  const xTicks = useMemo(() => {
    const count = 4;
    const out: Array<{ ts: number; label: string }> = [];
    for (let i = 0; i < count; i++) {
      const ts = xMin + (i / (count - 1)) * xRange;
      out.push({ ts, label: shortDayMonth(ts) });
    }
    return out;
  }, [xMin, xRange]);

  const linePts = points.map(p => `${xScale(p.ts)},${yScale(p.value)}`).join(' ');

  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      {points.length === 0 ? (
        <Text style={styles.metricNoData}>{emptyText}</Text>
      ) : (
        <View>
          <Svg width={width} height={height}>
            {/* axes */}
            <Line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={COLORS.borderLight} strokeWidth={1} />
            <Line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke={COLORS.borderLight} strokeWidth={1} />

            {/* real y-axis ticks */}
            {yTicks.map((t, i) => {
              const y = yScale(t);
              return (
                <React.Fragment key={`yt-${i}`}>
                  <Line x1={padL - 3} y1={y} x2={padL} y2={y} stroke={COLORS.borderLight} strokeWidth={1} />
                  <SvgText x={padL - 5} y={y + 3} fontSize={9} fill={COLORS.textLight} textAnchor="end">
                    {formatLabValue(t)}
                  </SvgText>
                </React.Fragment>
              );
            })}

            {/* threshold line + chip */}
            {threshold !== undefined && (() => {
              const ty = yScale(threshold.value);
              const chipW = 36;
              const chipH = 14;
              const chipX = padL + plotW - chipW;
              const chipY = ty - chipH / 2;
              return (
                <>
                  <Line
                    x1={padL}
                    x2={padL + plotW - chipW - 2}
                    y1={ty}
                    y2={ty}
                    stroke={threshold.lineColor}
                    strokeWidth={1.5}
                    strokeDasharray="4,3"
                  />
                  <Rect
                    x={chipX}
                    y={chipY}
                    width={chipW}
                    height={chipH}
                    rx={4}
                    ry={4}
                    fill={threshold.chipBgColor}
                  />
                  <SvgText
                    x={chipX + chipW / 2}
                    y={ty + 4}
                    fontSize={9}
                    fontWeight="700"
                    fill={threshold.chipTextColor}
                    textAnchor="middle"
                  >
                    {threshold.label}
                  </SvgText>
                </>
              );
            })()}

            {/* transfusion markers */}
            {markers.map((m, i) => {
              const x = xScale(m);
              return (
                <Line
                  key={`tm-${i}`}
                  x1={x} y1={padT + plotH * 0.78} x2={x} y2={padT + plotH}
                  stroke={COLORS.textLight} strokeWidth={1} strokeDasharray="2,3" opacity={0.5}
                />
              );
            })}

            {/* line */}
            <Polyline points={linePts} stroke={color} strokeWidth={1.75} fill="none" strokeLinejoin="round" strokeLinecap="round" />

            {/* points + tap targets */}
            {points.map((p, i) => {
              const cx = xScale(p.ts);
              const cy = yScale(p.value);
              const isFocused = tooltip?.ts === p.ts;
              return (
                <React.Fragment key={`pt-${i}`}>
                  <Rect x={cx - 8} y={cy - 8} width={16} height={16} fill="transparent" onPress={() => setTooltip(p)} />
                  <Circle cx={cx} cy={cy} r={isFocused ? 4 : 2.5} fill={COLORS.surface} stroke={color} strokeWidth={isFocused ? 2.5 : 1.5} />
                </React.Fragment>
              );
            })}

            {/* x-axis date ticks */}
            {xTicks.map((tk, i) => (
              <SvgText key={`xt-${i}`} x={xScale(tk.ts)} y={padT + plotH + 14} fontSize={9} fill={COLORS.textLight} textAnchor="middle">
                {tk.label}
              </SvgText>
            ))}
          </Svg>

          {tooltip && (
            <View style={styles.tooltip}>
              <View style={[styles.tooltipDot, { backgroundColor: color }]} />
              <Text style={styles.tooltipLabel}>{label}</Text>
              <Text style={styles.tooltipValue}>{formatLabValue(tooltip.value)}</Text>
              <Text style={styles.tooltipDate}>{new Date(tooltip.ts).toISOString().slice(0, 10)}</Text>
              <TouchableOpacity
                onPress={() => setTooltip(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss tooltip"
              >
                <Text style={styles.tooltipClose}>×</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Generate ~`count` "nice" round ticks between min and max. */
function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const range = max - min;
  const step = niceStep(range / Math.max(1, count - 1));
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max; v += step) {
    out.push(Number(v.toFixed(4)));
    if (out.length > 8) break; // safety
  }
  if (out.length === 0) out.push(min);
  return out;
}

function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  const norm = raw / base;
  let nice: number;
  if (norm < 1.5) nice = 1;
  else if (norm < 3) nice = 2;
  else if (norm < 7) nice = 5;
  else nice = 10;
  return nice * base;
}

const styles = StyleSheet.create({
  container: { gap: SPACING.sm },
  empty: {
    padding: SPACING.md,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
  },
  emptyText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textLight, textAlign: 'center' },
  windowRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  windowChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  windowChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, ...SHADOWS.card },
  windowChipText: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  windowChipTextActive: { color: COLORS.white },
  metric: { gap: SPACING.xs },
  metricLabel: { ...TYPOGRAPHY.caption, fontWeight: '700', color: COLORS.textSecondary },
  metricNoData: { ...TYPOGRAPHY.caption, color: COLORS.textLight, fontStyle: 'italic', paddingVertical: SPACING.sm },
  tooltip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginTop: 4,
    ...SHADOWS.card,
  },
  tooltipDot: { width: 8, height: 8, borderRadius: 4 },
  tooltipLabel: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary, flex: 1 },
  tooltipValue: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  tooltipDate: { fontSize: 10, color: COLORS.textLight },
  tooltipClose: { fontSize: 16, fontWeight: '700', color: COLORS.textLight, paddingHorizontal: 4 },
  markerHint: { ...TYPOGRAPHY.caption, color: COLORS.textLight, fontStyle: 'italic' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  thresholdBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.sm,
  },
});
