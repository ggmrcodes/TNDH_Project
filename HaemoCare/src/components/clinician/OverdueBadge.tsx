import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SPACING } from '../../config/theme';
import { riskColors } from '../../utils/statusColors';

export interface OverdueBadgeProps {
  daysOverdue: number;
  tier: 1 | 2;
}

export default function OverdueBadge({ daysOverdue, tier }: OverdueBadgeProps) {
  const { bg, fg } = riskColors(tier === 2 ? 'high' : 'med');
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
