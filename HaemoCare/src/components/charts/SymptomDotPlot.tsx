import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { SymptomTimepoint } from '../../analytics';
import { COLORS, TYPOGRAPHY } from '../../config/theme';

interface Props {
  timepoints: SymptomTimepoint[];
  topSymptoms: string[]; // ordered list of symptom keys to render as rows
  labelMap?: Record<string, string>;
  width?: number;
  rowHeight?: number;
  xMaxDays?: number;
}

export default function SymptomDotPlot({
  timepoints,
  topSymptoms,
  labelMap = {},
  width = 320,
  rowHeight = 28,
  xMaxDays = 35,
}: Props) {
  if (topSymptoms.length === 0 || timepoints.length === 0) return null;

  const padL = 80;
  const padR = 10;
  const padT = 8;
  const padB = 22;
  const plotW = width - padL - padR;
  const height = padT + padB + topSymptoms.length * rowHeight;
  const plotH = height - padT - padB;

  const xScale = (days: number) => padL + Math.min(Math.max(days, 0), xMaxDays) / xMaxDays * plotW;
  const rowY = (i: number) => padT + rowHeight * i + rowHeight / 2;

  const dotColor = (severity: number) => {
    if (severity >= 7) return COLORS.accent;
    if (severity >= 4) return COLORS.primary;
    return COLORS.primaryMuted;
  };
  const dotRadius = (severity: number) => 2 + (severity / 10) * 4;

  // Pre-group timepoints per symptom for rendering order
  const byKey = new Map<string, SymptomTimepoint[]>();
  for (const tp of timepoints) {
    if (!topSymptoms.includes(tp.symptomKey)) continue;
    const arr = byKey.get(tp.symptomKey) ?? [];
    arr.push(tp);
    byKey.set(tp.symptomKey, arr);
  }

  return (
    <View>
      <Svg width={width} height={height}>
        {/* 72h post-tx guide rule */}
        <Line
          x1={xScale(3)}
          y1={padT}
          x2={xScale(3)}
          y2={padT + plotH}
          stroke={COLORS.statusMonitor}
          strokeWidth={1}
          strokeDasharray="2,4"
          opacity={0.5}
        />
        <SvgText
          x={xScale(3) + 3}
          y={padT + 9}
          fontSize={8}
          fontWeight="700"
          fill={COLORS.statusMonitor}
        >
          72h
        </SvgText>

        {/* Row rules + labels */}
        {topSymptoms.map((key, i) => (
          <React.Fragment key={key}>
            <Line
              x1={padL}
              y1={rowY(i)}
              x2={padL + plotW}
              y2={rowY(i)}
              stroke={COLORS.borderLight}
              strokeWidth={1}
            />
            <SvgText
              x={padL - 6}
              y={rowY(i) + 3}
              fontSize={9}
              fontWeight="700"
              fill={COLORS.textSecondary}
              textAnchor="end"
            >
              {(labelMap[key] ?? key).toUpperCase()}
            </SvgText>
          </React.Fragment>
        ))}

        {/* Dots per instance */}
        {topSymptoms.flatMap((key, i) =>
          (byKey.get(key) ?? []).map((tp, j) => (
            <Circle
              key={`${key}-${j}`}
              cx={xScale(tp.daysSinceTx)}
              cy={rowY(i)}
              r={dotRadius(tp.severity)}
              fill={dotColor(tp.severity)}
              opacity={0.85}
            />
          ))
        )}

        {/* X-axis tick labels */}
        {[0, 7, 14, 21, 28, 35].map(d => (
          <SvgText
            key={d}
            x={xScale(d)}
            y={padT + plotH + 14}
            fontSize={9}
            fill={COLORS.textLight}
            textAnchor="middle"
          >
            {d === 0 ? 'd0' : `d${d}`}
          </SvgText>
        ))}
      </Svg>
      <Text style={styles.caption}>Days since transfusion · dot size = severity</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { ...TYPOGRAPHY.caption, color: COLORS.textLight, marginTop: 4 },
});
