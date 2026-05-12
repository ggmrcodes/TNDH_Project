import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Line, Circle, Text as SvgText } from 'react-native-svg';
import { Transfusion } from '../../types/database';
import { HbDecayResult } from '../../analytics';
import { COLORS, TYPOGRAPHY } from '../../config/theme';

interface Props {
  transfusions: Transfusion[];
  decay: HbDecayResult;
  threshold?: number;
  width?: number;
  height?: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export default function HbTrendChart({
  transfusions,
  decay,
  threshold = 7.0,
  width = 320,
  height = 190,
}: Props) {
  const points = transfusions
    .filter(t => t.post_hb_g_dl != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map(t => ({ ts: new Date(t.date).getTime(), hb: t.post_hb_g_dl as number }));

  if (points.length < 2) return null;

  // Time range: first point → projected threshold date (or 45d after latest if no projection)
  const latest = points[points.length - 1];
  const projectedTs =
    decay.projectedThresholdDate != null
      ? new Date(decay.projectedThresholdDate).getTime()
      : latest.ts + 45 * MS_PER_DAY;
  const xMin = points[0].ts;
  const xMax = Math.max(projectedTs, latest.ts + 7 * MS_PER_DAY);

  const yMin = 5.0;
  const yMax = 11.5;

  // Padding for axes
  const padL = 34;
  const padR = 10;
  const padT = 14;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const xScale = (ts: number) => padL + ((ts - xMin) / (xMax - xMin)) * plotW;
  const yScale = (hb: number) => padT + (1 - (hb - yMin) / (yMax - yMin)) * plotH;

  const linePoints = points.map(p => `${xScale(p.ts)},${yScale(p.hb)}`).join(' ');

  // Projection segment: latest point → threshold crossing (or edge)
  let projectionTarget: { ts: number; hb: number } | null = null;
  if (decay.decayRatePerDay != null && decay.decayRatePerDay > 0) {
    const endHb = Math.max(
      threshold,
      latest.hb - decay.decayRatePerDay * ((xMax - latest.ts) / MS_PER_DAY)
    );
    // If decay carries past xMax before hitting threshold, clamp to xMax
    const daysToCross = (latest.hb - threshold) / decay.decayRatePerDay;
    const crossTs = latest.ts + daysToCross * MS_PER_DAY;
    if (crossTs <= xMax) {
      projectionTarget = { ts: crossTs, hb: threshold };
    } else {
      projectionTarget = { ts: xMax, hb: endHb };
    }
  }

  // Build date tick labels (first, latest tx, projection target)
  const tickTimes: Array<{ ts: number; label: string }> = [
    { ts: xMin, label: shortDate(xMin) },
    { ts: latest.ts, label: shortDate(latest.ts) },
  ];
  if (projectionTarget) tickTimes.push({ ts: projectionTarget.ts, label: shortDate(projectionTarget.ts) });

  return (
    <View>
      <Svg width={width} height={height}>
        {/* y-axis baseline + threshold guide */}
        <Line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={COLORS.borderLight} strokeWidth={1} />
        <Line
          x1={padL}
          y1={padT + plotH}
          x2={padL + plotW}
          y2={padT + plotH}
          stroke={COLORS.borderLight}
          strokeWidth={1}
        />
        {/* Threshold dotted line */}
        <Line
          x1={padL}
          y1={yScale(threshold)}
          x2={padL + plotW}
          y2={yScale(threshold)}
          stroke={COLORS.accent}
          strokeWidth={1}
          strokeDasharray="3,4"
        />
        <SvgText
          x={padL + plotW - 2}
          y={yScale(threshold) - 3}
          fontSize={9}
          fontWeight="700"
          fill={COLORS.accent}
          textAnchor="end"
        >
          {`${threshold.toFixed(1)} g/dL`}
        </SvgText>

        {/* y ticks */}
        {[6, 8, 10].map(v => (
          <SvgText
            key={v}
            x={padL - 5}
            y={yScale(v) + 3}
            fontSize={9}
            fill={COLORS.textLight}
            textAnchor="end"
          >
            {v.toString()}
          </SvgText>
        ))}

        {/* Projection dashed segment */}
        {projectionTarget && (
          <Line
            x1={xScale(latest.ts)}
            y1={yScale(latest.hb)}
            x2={xScale(projectionTarget.ts)}
            y2={yScale(projectionTarget.hb)}
            stroke={COLORS.primary}
            strokeWidth={1.5}
            strokeDasharray="4,4"
            opacity={0.6}
          />
        )}

        {/* Historical line */}
        <Polyline
          points={linePoints}
          stroke={COLORS.primary}
          strokeWidth={2}
          fill="none"
          strokeLinejoin="round"
        />

        {/* Data markers */}
        {points.map((p, i) => (
          <Circle
            key={i}
            cx={xScale(p.ts)}
            cy={yScale(p.hb)}
            r={3.5}
            fill={COLORS.surface}
            stroke={COLORS.primary}
            strokeWidth={2}
          />
        ))}

        {/* Projection target marker */}
        {projectionTarget && (
          <Circle
            cx={xScale(projectionTarget.ts)}
            cy={yScale(projectionTarget.hb)}
            r={3}
            fill={COLORS.accent}
          />
        )}

        {/* x-axis date ticks */}
        {tickTimes.map((tk, i) => (
          <SvgText
            key={i}
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
      <View style={styles.legend}>
        <LegendItem color={COLORS.primary} label="Post-Hb" solid />
        <LegendItem color={COLORS.primary} label="Projection" dashed />
        <LegendItem color={COLORS.accent} label="Threshold" dashed />
      </View>
    </View>
  );
}

function LegendItem({ color, label, solid, dashed }: { color: string; label: string; solid?: boolean; dashed?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: solid ? color : 'transparent', borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function shortDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 12, marginTop: 6, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 14, height: 2, borderWidth: 1 },
  legendLabel: { ...TYPOGRAPHY.caption, color: COLORS.textLight },
});
