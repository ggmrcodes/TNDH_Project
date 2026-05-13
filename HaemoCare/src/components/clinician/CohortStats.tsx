import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';

export interface CohortStatsProps {
  overdueCount: number;
  monitorCount: number;
  stableCount: number;
}

export default function CohortStats({ overdueCount, monitorCount, stableCount }: CohortStatsProps) {
  const { t } = useLanguage();
  return (
    <View style={styles.container}>
      <Stat label={t('clinician.cohort.overdue' as TranslationKey)} value={overdueCount} color={COLORS.statusUrgent ?? '#DC3B3B'} />
      <Stat label={t('clinician.cohort.monitor' as TranslationKey)} value={monitorCount} color={COLORS.statusMonitor ?? '#E8933A'} />
      <Stat label={t('clinician.cohort.stable' as TranslationKey)} value={stableCount} color={COLORS.statusNormal ?? '#0EA572'} />
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.surfaceElevated ?? '#FFFFFF',
    borderRadius: 14,
  },
  stat: { flex: 1, alignItems: 'flex-start', gap: 2 },
  value: { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 11, color: COLORS.textLight, textTransform: 'uppercase' },
});
