/**
 * Inline lab-trend sparkline for the patient passport.
 *
 * Renders one lab series (Hb / Hct / Ferritin) as a full-card-width strip:
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ Hb                          ↘  5.0 g/dL      │
 *   │ 12─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
 *   │     ●━━━━━●━━━━━●                            │
 *   │  5─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
 *   │ 9 Apr                  14 May · 3 readings   │
 *   └──────────────────────────────────────────────┘
 *
 * Width is measured via onLayout so the SVG can size to whatever the parent
 * gives it (no fixed pixel width prop required).
 *
 * Single-point edge case shows the value + a "need another measurement"
 * message instead of trying to draw a meaningless line.
 *
 * Pure SVG via react-native-svg (no new dep — matches LabTrendsChart.tsx).
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type LayoutChangeEvent } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { format } from 'date-fns';
import { th as thLocale, enUS } from 'date-fns/locale';
import type { LabPoint } from '../../utils/labTrendsData';
import { formatLabValue } from '../../utils/labTrendsData';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import { COLORS, TYPOGRAPHY } from '../../config/theme';

export interface LabSparklineProps {
  label: string;
  unit: string;
  /** Already-sorted-ascending series for this lab. */
  points: LabPoint[];
  /** Color of the line + data point dots. */
  color?: string;
  /** Card height (plot area sits inside; header + footer rows pad). */
  height?: number;
  /** Empty-state text shown when points.length < 1. */
  emptyMessage: string;
  /** Optional tap handler — wire to a future full-chart modal. */
  onPress?: () => void;
}

// Plot-area dimensions inside the card.
const PLOT_HEIGHT = 60;
const PAD_X = 24;        // leaves room for min/max labels on the left
const PAD_TOP = 8;
const PAD_BOTTOM = 8;
const TREND_THRESHOLD = 0.05; // ±5% to count as up/down vs flat

export default function LabSparkline({
  label,
  unit,
  points,
  color = COLORS.primary,
  height = 130,
  emptyMessage,
  onPress,
}: LabSparklineProps) {
  const { t, language } = useLanguage();
  const [plotWidth, setPlotWidth] = useState(0);
  const Container: React.ElementType = onPress ? TouchableOpacity : View;
  const containerProps = onPress
    ? { onPress, activeOpacity: 0.7, accessibilityRole: 'button' as const }
    : {};

  // Zero data → just the label + empty hint.
  if (points.length === 0) {
    return (
      <Container style={[styles.card, { minHeight: height }]} {...containerProps}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.empty}>{emptyMessage}</Text>
      </Container>
    );
  }

  const last = points[points.length - 1];
  const first = points[0];

  // Single data point → show value but skip the chart (line of 1 is undefined).
  if (points.length === 1) {
    return (
      <Container style={[styles.card, { minHeight: height }]} {...containerProps}>
        <View style={styles.headerRow}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value} numberOfLines={1}>
            {formatLabValue(last.value)}
            <Text style={styles.unit}> {unit}</Text>
          </Text>
        </View>
        <View style={styles.singlePointRow}>
          <Feather name="info" size={12} color={COLORS.textLight} />
          <Text style={styles.empty}>
            {t('labTrends.sparkline.singlePoint' as TranslationKey)}
          </Text>
        </View>
        <Text style={styles.footerText}>
          {formatDateShort(last.ts, language)}
        </Text>
      </Container>
    );
  }

  // ── 2+ point case: compute scales + trend ──
  const xs = points.map(p => p.ts);
  const ys = points.map(p => p.value);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  // Add 10% headroom so the line doesn't touch the top/bottom dashed gridlines.
  const yPadding = (yMax - yMin) * 0.1 || Math.abs(yMax) * 0.1 || 1;
  const yLo = yMin - yPadding;
  const yHi = yMax + yPadding;
  const yRange = yHi - yLo || 1;

  const usableW = Math.max(0, plotWidth - PAD_X);
  const usableH = PLOT_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const xScale = (ts: number) => PAD_X + ((ts - xMin) / xRange) * usableW;
  const yScale = (v: number) => PAD_TOP + (1 - (v - yLo) / yRange) * usableH;

  const linePoints = points.map(p => `${xScale(p.ts)},${yScale(p.value)}`).join(' ');

  // Trend direction: first vs last as a percentage of the first.
  const delta = (last.value - first.value) / (Math.abs(first.value) || 1);
  let trendIcon: 'trending-up' | 'trending-down' | 'minus';
  let trendLabel: string;
  if (delta > TREND_THRESHOLD) {
    trendIcon = 'trending-up';
    trendLabel = t('labTrends.trend.up' as TranslationKey);
  } else if (delta < -TREND_THRESHOLD) {
    trendIcon = 'trending-down';
    trendLabel = t('labTrends.trend.down' as TranslationKey);
  } else {
    trendIcon = 'minus';
    trendLabel = t('labTrends.trend.flat' as TranslationKey);
  }

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - plotWidth) > 1) setPlotWidth(w);
  };

  return (
    <Container style={[styles.card, { minHeight: height }]} {...containerProps}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.valueRow}>
          <Feather
            name={trendIcon}
            size={14}
            color={COLORS.textSecondary}
            accessibilityLabel={trendLabel}
          />
          <Text style={styles.value} numberOfLines={1}>
            {formatLabValue(last.value)}
            <Text style={styles.unit}> {unit}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.plotArea} onLayout={onLayout}>
        {plotWidth > 0 && (
          <Svg width={plotWidth} height={PLOT_HEIGHT}>
            {/* Top + bottom dashed gridlines with their numeric labels */}
            <Line
              x1={PAD_X} y1={PAD_TOP}
              x2={plotWidth} y2={PAD_TOP}
              stroke={COLORS.borderLight} strokeWidth={1} strokeDasharray="3,3"
            />
            <Line
              x1={PAD_X} y1={PLOT_HEIGHT - PAD_BOTTOM}
              x2={plotWidth} y2={PLOT_HEIGHT - PAD_BOTTOM}
              stroke={COLORS.borderLight} strokeWidth={1} strokeDasharray="3,3"
            />
            <SvgText
              x={PAD_X - 4} y={PAD_TOP + 4}
              fontSize="9" fill={COLORS.textLight} textAnchor="end"
            >
              {formatLabValue(yMax)}
            </SvgText>
            <SvgText
              x={PAD_X - 4} y={PLOT_HEIGHT - PAD_BOTTOM + 4}
              fontSize="9" fill={COLORS.textLight} textAnchor="end"
            >
              {formatLabValue(yMin)}
            </SvgText>

            {/* Trend line + a dot for every measurement so the user can see
                density at a glance (no longer just the last one). */}
            <Polyline
              points={linePoints}
              stroke={color}
              strokeWidth={2}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.map(p => (
              <Circle
                key={p.ts}
                cx={xScale(p.ts)}
                cy={yScale(p.value)}
                r={3}
                fill={color}
              />
            ))}
          </Svg>
        )}
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerText} numberOfLines={1}>
          {t('labTrends.sparkline.dateRange' as TranslationKey, {
            start: formatDateShort(first.ts, language),
            end: formatDateShort(last.ts, language),
          })}
        </Text>
        <Text style={styles.footerText}>
          {t('labTrends.sparkline.readings' as TranslationKey, { count: points.length })}
        </Text>
      </View>
    </Container>
  );
}

function formatDateShort(ts: number, language: 'th' | 'en'): string {
  const locale = language === 'th' ? thLocale : enUS;
  return format(new Date(ts), 'd MMM', { locale });
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  label: { ...TYPOGRAPHY.caption, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 0.5 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { fontSize: 16, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  unit: { fontSize: 11, fontWeight: '600', color: COLORS.textLight },
  plotArea: { width: '100%', height: PLOT_HEIGHT },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  footerText: { ...TYPOGRAPHY.caption, color: COLORS.textLight },
  singlePointRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  empty: { ...TYPOGRAPHY.caption, color: COLORS.textLight, fontStyle: 'italic' },
});
