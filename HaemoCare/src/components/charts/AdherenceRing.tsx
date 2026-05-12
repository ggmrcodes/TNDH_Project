import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { COLORS, TYPOGRAPHY } from '../../config/theme';

interface Props {
  percent: number;         // 0..100
  streakDays?: number;     // optional context line under the ring
  size?: number;
  strokeWidth?: number;
}

export default function AdherenceRing({ percent, streakDays, size = 104, strokeWidth = 10 }: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference * (1 - clamped / 100);

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Defs>
            <SvgLinearGradient id="adherenceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={COLORS.primaryGradientStart} />
              <Stop offset="100%" stopColor={COLORS.primaryGradientEnd} />
            </SvgLinearGradient>
          </Defs>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={COLORS.borderLight}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="url(#adherenceGrad)"
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <View style={styles.center}>
          <Text style={styles.percent}>{clamped}</Text>
          <Text style={styles.percentUnit}>%</Text>
        </View>
      </View>
      {streakDays !== undefined && streakDays > 0 && (
        <Text style={styles.streak}>{streakDays}-day streak</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  center: { flexDirection: 'row', alignItems: 'baseline' },
  percent: { fontSize: 26, fontWeight: '800', color: COLORS.text, letterSpacing: -1 },
  percentUnit: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginLeft: 1 },
  streak: { ...TYPOGRAPHY.caption, color: COLORS.textLight },
});
