import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { COLORS } from '../../config/theme';
import type { DailyOverdueCount } from '../../utils/cohortHistory';

export interface OverdueSparklineProps {
  data: DailyOverdueCount[];
  width?: number;
  height?: number;
}

const PAD_Y = 4;

export default function OverdueSparkline({
  data,
  width = 260,
  height = 36,
}: OverdueSparklineProps) {
  if (!data || data.length === 0) {
    return <View style={[styles.wrap, { width, height }]} />;
  }

  const stroke = COLORS.primary ?? '#0B6E6E';
  const innerH = Math.max(1, height - PAD_Y * 2);
  const n = data.length;
  const maxV = Math.max(0, ...data.map(d => d.count));
  const xStep = n > 1 ? width / (n - 1) : 0;

  // y returns the screen y-coordinate for a value.
  const y = (v: number): number => {
    if (maxV === 0) return height - PAD_Y; // flat line at bottom
    const norm = v / maxV; // 0..1
    return PAD_Y + (1 - norm) * innerH;
  };

  const points = data.map((d, i) => {
    const x = n === 1 ? width / 2 : i * xStep;
    return { x, y: y(d.count) };
  });

  const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height}>
        <Polyline
          points={polylinePoints}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p, i) => {
          const isLast = i === points.length - 1;
          return (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={isLast ? 3 : 2.5}
              fill={isLast ? stroke : '#FFFFFF'}
              stroke={stroke}
              strokeWidth={1.5}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'flex-start' },
});
