/**
 * Small inline sparkline for a single lab series (Hb / Hct / Ferritin).
 *
 * Used inside the patient passport. No axes, no legend — just a tiny line
 * with the latest value labeled to the right. Tap-to-expand is wired by
 * the parent (passing `onPress`).
 *
 * Pure SVG via react-native-svg (no new dep — matches HbTrendChart.tsx).
 * See docs/superpowers/specs/2026-05-17-lab-trends-graph-brief.md.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import type { LabPoint } from '../../utils/labTrendsData';
import { COLORS, TYPOGRAPHY } from '../../config/theme';

export interface LabSparklineProps {
  label: string;
  unit: string;
  /** Already-sorted-ascending series for this lab. */
  points: LabPoint[];
  /** Color of the line + last-value dot. */
  color?: string;
  /** Inline width; defaults to a small reasonable size for cards. */
  width?: number;
  height?: number;
  /** Empty-state text shown when points.length < 2. */
  emptyMessage: string;
  /** Optional tap handler to expand into full chart. */
  onPress?: () => void;
}

export default function LabSparkline({
  label,
  unit,
  points,
  color = COLORS.primary,
  width = 110,
  height = 36,
  emptyMessage,
  onPress,
}: LabSparklineProps) {
  const Container: React.ElementType = onPress ? TouchableOpacity : View;

  if (points.length < 2) {
    return (
      <Container
        style={styles.card}
        {...(onPress ? { onPress, activeOpacity: 0.7, accessibilityRole: 'button' } : {})}
      >
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.empty}>{emptyMessage}</Text>
      </Container>
    );
  }

  const padX = 2;
  const padY = 4;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const xs = points.map(p => p.ts);
  const ys = points.map(p => p.value);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  // Avoid zero-range collapse (flat series).
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const xScale = (ts: number) => padX + ((ts - xMin) / xRange) * plotW;
  const yScale = (v: number) => padY + (1 - (v - yMin) / yRange) * plotH;

  const linePoints = points.map(p => `${xScale(p.ts)},${yScale(p.value)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <Container
      style={styles.card}
      {...(onPress ? { onPress, activeOpacity: 0.7, accessibilityRole: 'button' } : {})}
    >
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {formatValue(last.value)}
          <Text style={styles.unit}> {unit}</Text>
        </Text>
      </View>
      <Svg width={width} height={height}>
        <Polyline
          points={linePoints}
          stroke={color}
          strokeWidth={1.5}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={xScale(last.ts)} cy={yScale(last.value)} r={2.5} fill={color} />
      </Svg>
    </Container>
  );
}

function formatValue(v: number): string {
  // One decimal for Hb/Hct (small numbers); integer for ferritin-scale numbers.
  if (Math.abs(v) >= 100) return Math.round(v).toString();
  return v.toFixed(1);
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { ...TYPOGRAPHY.caption, color: COLORS.textLight, letterSpacing: 0.5 },
  value: { fontSize: 15, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  unit: { fontSize: 10, fontWeight: '600', color: COLORS.textLight },
  empty: { ...TYPOGRAPHY.caption, color: COLORS.textLight, fontStyle: 'italic', marginTop: 4 },
});
