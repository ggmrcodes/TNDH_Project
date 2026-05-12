import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, TYPOGRAPHY, RADIUS, SPACING } from '../../config/theme';
import { Outcome } from '../../types/database';
import { useLanguage } from '../../contexts/LanguageContext';

interface StatusBadgeProps {
  outcome: Outcome;
  large?: boolean;
}

const CONFIG = {
  normal: { bg: COLORS.statusNormalBg, color: COLORS.statusNormal, key: 'status.normal' as const },
  monitor: { bg: COLORS.statusMonitorBg, color: COLORS.statusMonitor, key: 'status.monitor' as const },
  urgent: { bg: COLORS.statusUrgentBg, color: COLORS.statusUrgent, key: 'status.urgent' as const },
};

export default function StatusBadge({ outcome, large }: StatusBadgeProps) {
  const { t } = useLanguage();
  const cfg = CONFIG[outcome];

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }, large && styles.large]}>
      <View style={[styles.dot, { backgroundColor: cfg.color }]} />
      <Text style={[
        large ? styles.labelLarge : styles.label,
        { color: cfg.color },
      ]}>
        {t(cfg.key)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm + 2,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
  },
  large: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: SPACING.xs + 2,
  },
  label: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
  },
  labelLarge: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
  },
});
