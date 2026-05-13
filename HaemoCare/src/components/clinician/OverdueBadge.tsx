import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../config/theme';

export interface OverdueBadgeProps {
  daysOverdue: number;
  tier: 1 | 2;
}

export default function OverdueBadge({ daysOverdue, tier }: OverdueBadgeProps) {
  const bg = tier === 2 ? (COLORS.statusUrgentBg ?? '#FEF2F2') : (COLORS.statusMonitorBg ?? '#FEF3E7');
  const fg = tier === 2 ? (COLORS.statusUrgent ?? '#DC3B3B') : (COLORS.statusMonitor ?? '#E8933A');
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: fg }]}>
      <Text style={[styles.text, { color: fg }]}>{`${daysOverdue}d overdue`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '700' },
});
