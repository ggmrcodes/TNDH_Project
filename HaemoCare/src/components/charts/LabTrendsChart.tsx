/**
 * Full interactive lab-trends chart for the clinician patient drill-down.
 *
 * - Three toggleable series (Hb / Hct / Ferritin)
 * - Time-window toggle: 1mo / 3mo / 6mo / 1y / all (persisted via SecureStore)
 * - Transfusion-date vertical markers on the x-axis
 * - Tap a point to see exact value + ISO date in a tooltip
 * - Custom SVG (no new dep — react-native-svg is already in the tree)
 *
 * Reference-range bands intentionally NOT drawn — tied to deferred
 * threshold-flagging decision in the pre-transfusion-labs brief.
 *
 * Performance: assumes the caller passed a downsampled series (the
 * recommended cap is ~200 points). See `buildLabTrendsSeries`.
 *
 * Each lab series has its own y-scale because units are different
 * (g/dL vs % vs ng/mL). To keep the chart visually meaningful, we
 * normalize each visible series independently into the plot area and
 * show the active y-axis for whichever series the user *most recently
 * tapped* (otherwise: first active series).
 *
 * See docs/superpowers/specs/2026-05-17-lab-trends-graph-brief.md.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Svg, { Polyline, Line, Circle, Text as SvgText, Rect } from 'react-native-svg';
import * as SecureStore from 'expo-secure-store';
import type { LabPoint, LabWindow } from '../../utils/labTrendsData';
import { buildLabTrendsSeries } from '../../utils/labTrendsData';
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
}

type SeriesKey = 'hb' | 'hct' | 'ferritin';

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
}: LabTrendsChartProps) {
  const [window, setWindow] = useState<LabWindow>('6mo');
  const [active, setActive] = useState<Record<SeriesKey, boolean>>({
    hb: true,
    hct: true,
    ferritin: true,
  });
  // Last-tapped series determines which y-axis is shown.
  const [focusedSeries, setFocusedSeries] = useState<SeriesKey>('hb');
  const [tooltip, setTooltip] = useState<{ series: SeriesKey; point: LabPoint } | null>(null);

  // Restore persisted window choice (per user, but we use a single key
  // because SecureStore is already user-scoped via supabase auth state).
  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(WINDOW_STORAGE_KEY).then(val => {
      if (cancelled) return;
      if (val && (ALL_WINDOWS as string[]).includes(val)) {
        setWindow(val as LabWindow);
      }
    }).catch(() => {
      // SecureStore may not exist on web — non-fatal, default to '6mo'.
    });
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

  const visibleSeries: Array<{ key: SeriesKey; points: LabPoint[] }> = (
    ['hb', 'hct', 'ferritin'] as SeriesKey[]
  )
    .filter(k => active[k])
    .map(k => ({ key: k, points: series[k] }));

  const totalPoints = visibleSeries.reduce((sum, s) => sum + s.points.length, 0);
  const hasAnyPoints = totalPoints > 0;
  const hasAnyMarkers = series.transfusionMarkers.length > 0;

  // Plot geometry.
  const padL = 38;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const height = 220;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  // X-domain: spans all visible points + all markers in this window. If
  // no points but we have markers, still show the marker timeline.
  const xs: number[] = [];
  for (const s of visibleSeries) for (const p of s.points) xs.push(p.ts);
  for (const m of series.transfusionMarkers) xs.push(m);
  const xMin = xs.length > 0 ? Math.min(...xs) : 0;
  const xMax = xs.length > 0 ? Math.max(...xs) : 1;
  const xRange = xMax - xMin || 1;
  const xScale = (ts: number) => padL + ((ts - xMin) / xRange) * plotW;

  // Each series gets its own y-scale (different units). We still need
  // to draw them in the same plot box.
  const yDomain = (k: SeriesKey): { min: number; max: number } => {
    const pts = series[k];
    if (pts.length === 0) return { min: 0, max: 1 };
    const values = pts.map(p => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      // Flat series — pad a bit so the line isn't on the axis.
      const pad = Math.max(1, Math.abs(min) * 0.1);
      return { min: min - pad, max: max + pad };
    }
    // Small margin top/bottom (5%).
    const margin = (max - min) * 0.05;
    return { min: min - margin, max: max + margin };
  };

  const yScaleFor = (k: SeriesKey) => {
    const { min, max } = yDomain(k);
    const range = max - min || 1;
    return (v: number) => padT + (1 - (v - min) / range) * plotH;
  };

  // Y-axis ticks for the focused series.
  const focusedDomain = yDomain(focusedSeries);
  const focusedTicks = niceTicks(focusedDomain.min, focusedDomain.max, 4);

  // X-axis ticks: choose 3-4 representative dates across the range.
  const xTicks = useMemo(() => {
    if (xs.length === 0) return [];
    const count = 4;
    const out: Array<{ ts: number; label: string }> = [];
    for (let i = 0; i < count; i++) {
      const ts = xMin + (i / (count - 1)) * xRange;
      out.push({ ts, label: shortDate(ts) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xMin, xMax]);

  const toggleSeries = (k: SeriesKey) => {
    setActive(prev => ({ ...prev, [k]: !prev[k] }));
    setFocusedSeries(k);
  };

  const onPointTap = (k: SeriesKey, p: LabPoint) => {
    setFocusedSeries(k);
    setTooltip({ series: k, point: p });
  };

  if (!hasAnyPoints && !hasAnyMarkers) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{labels.empty}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Window selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.windowRow}
      >
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

      {/* SVG plot */}
      <View>
        <Svg width={width} height={height}>
          {/* Plot axes */}
          <Line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={COLORS.borderLight} strokeWidth={1} />
          <Line
            x1={padL}
            y1={padT + plotH}
            x2={padL + plotW}
            y2={padT + plotH}
            stroke={COLORS.borderLight}
            strokeWidth={1}
          />

          {/* Y-axis ticks (focused series) */}
          {focusedTicks.map((t, i) => {
            const y = yScaleFor(focusedSeries)(t);
            return (
              <React.Fragment key={`yt-${i}`}>
                <Line x1={padL - 3} y1={y} x2={padL} y2={y} stroke={COLORS.borderLight} strokeWidth={1} />
                <SvgText
                  x={padL - 5}
                  y={y + 3}
                  fontSize={9}
                  fill={COLORS.textLight}
                  textAnchor="end"
                >
                  {formatTick(t)}
                </SvgText>
              </React.Fragment>
            );
          })}

          {/* Transfusion markers — vertical lines at the bottom 20% of plot */}
          {series.transfusionMarkers.map((m, i) => {
            const x = xScale(m);
            return (
              <Line
                key={`tm-${i}`}
                x1={x}
                y1={padT + plotH * 0.78}
                x2={x}
                y2={padT + plotH}
                stroke={COLORS.textLight}
                strokeWidth={1}
                strokeDasharray="2,3"
                opacity={0.5}
              />
            );
          })}

          {/* Series lines */}
          {visibleSeries.map(s => {
            if (s.points.length === 0) return null;
            const ys = yScaleFor(s.key);
            const linePts = s.points.map(p => `${xScale(p.ts)},${ys(p.value)}`).join(' ');
            return (
              <Polyline
                key={`line-${s.key}`}
                points={linePts}
                stroke={SERIES_COLORS[s.key]}
                strokeWidth={1.75}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}

          {/* Series points — wrapped in a slightly larger transparent rect
              for easier tap targets. */}
          {visibleSeries.map(s => {
            const ys = yScaleFor(s.key);
            return s.points.map((p, i) => {
              const cx = xScale(p.ts);
              const cy = ys(p.value);
              const isFocused = tooltip?.series === s.key && tooltip?.point.ts === p.ts;
              return (
                <React.Fragment key={`pt-${s.key}-${i}`}>
                  {/* Tap target */}
                  <Rect
                    x={cx - 8}
                    y={cy - 8}
                    width={16}
                    height={16}
                    fill="transparent"
                    onPress={() => onPointTap(s.key, p)}
                  />
                  <Circle
                    cx={cx}
                    cy={cy}
                    r={isFocused ? 4 : 2.5}
                    fill={COLORS.surface}
                    stroke={SERIES_COLORS[s.key]}
                    strokeWidth={isFocused ? 2.5 : 1.5}
                  />
                </React.Fragment>
              );
            });
          })}

          {/* X-axis date ticks */}
          {xTicks.map((tk, i) => (
            <SvgText
              key={`xt-${i}`}
              x={xScale(tk.ts)}
              y={padT + plotH + 14}
              fontSize={9}
              fill={COLORS.textLight}
              textAnchor="middle"
            >
              {tk.label}
            </SvgText>
          ))}
        </Svg>

        {/* Tooltip overlay (positioned just below the chart for readability) */}
        {tooltip && (
          <View style={styles.tooltip}>
            <View style={[styles.tooltipDot, { backgroundColor: SERIES_COLORS[tooltip.series] }]} />
            <Text style={styles.tooltipLabel}>
              {labels[tooltip.series]}
            </Text>
            <Text style={styles.tooltipValue}>
              {formatTick(tooltip.point.value)}
            </Text>
            <Text style={styles.tooltipDate}>
              {new Date(tooltip.point.ts).toISOString().slice(0, 10)}
            </Text>
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

      {/* Legend / series toggles */}
      <View style={styles.legendRow}>
        {(['hb', 'hct', 'ferritin'] as SeriesKey[]).map(k => {
          const isActive = active[k];
          return (
            <TouchableOpacity
              key={k}
              style={[styles.legendChip, !isActive && styles.legendChipInactive]}
              onPress={() => toggleSeries(k)}
              activeOpacity={0.7}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isActive }}
              accessibilityLabel={labels[k]}
            >
              <View style={[styles.legendSwatch, { backgroundColor: SERIES_COLORS[k], opacity: isActive ? 1 : 0.3 }]} />
              <Text style={[styles.legendLabel, !isActive && styles.legendLabelInactive]}>
                {labels[k]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {hasAnyMarkers && (
        <Text style={styles.markerHint}>{labels.markerHint}</Text>
      )}
    </View>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function shortDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatTick(v: number): string {
  if (Math.abs(v) >= 100) return Math.round(v).toString();
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(1);
}

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
  container: {
    gap: SPACING.sm,
  },
  empty: {
    padding: SPACING.md,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
  },
  emptyText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textLight, textAlign: 'center' },
  windowRow: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  windowChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  windowChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    ...SHADOWS.card,
  },
  windowChipText: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  windowChipTextActive: { color: COLORS.white },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  legendChipInactive: { opacity: 0.6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, fontWeight: '600', color: COLORS.text },
  legendLabelInactive: { color: COLORS.textLight, textDecorationLine: 'line-through' },
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
});
