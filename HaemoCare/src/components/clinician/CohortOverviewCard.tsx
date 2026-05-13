import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import OverdueSparkline from './OverdueSparkline';
import type { DailyOverdueCount } from '../../utils/cohortHistory';

export interface CohortOverviewCardProps {
  overdueCount: number;
  monitorCount: number;
  stableCount: number;
  cohortSize: number;
  urgentLogs7d: number;
  transfusions7d: number;
  overdueHistory: DailyOverdueCount[];
  isWide?: boolean;
}

export default function CohortOverviewCard({
  overdueCount,
  monitorCount,
  stableCount,
  cohortSize,
  urgentLogs7d,
  transfusions7d,
  overdueHistory,
  isWide = false,
}: CohortOverviewCardProps) {
  const { t } = useLanguage();

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <BigStat
          label={t('clinician.cohort.overdue' as TranslationKey)}
          value={overdueCount}
          color={COLORS.statusUrgent ?? '#DC3B3B'}
        />
        <BigStat
          label={t('clinician.cohort.monitor' as TranslationKey)}
          value={monitorCount}
          color={COLORS.statusMonitor ?? '#E8933A'}
        />
        <BigStat
          label={t('clinician.cohort.stable' as TranslationKey)}
          value={stableCount}
          color={COLORS.statusNormal ?? '#0EA572'}
        />
      </View>

      <View style={styles.bottomRow}>
        <SmallStat
          label={t('clinician.cohort.size' as TranslationKey)}
          value={cohortSize}
        />
        <SmallStat
          label={t('clinician.cohort.urgentLogs7d' as TranslationKey)}
          value={urgentLogs7d}
        />
        <SmallStat
          label={t('clinician.cohort.transfusions7d' as TranslationKey)}
          value={transfusions7d}
        />
      </View>

      <View style={styles.sparkSection}>
        <Text style={styles.sectionLabel}>
          {t('clinician.cohort.sparkline.label' as TranslationKey).toUpperCase()}
        </Text>
        <OverdueSparkline data={overdueHistory} width={isWide ? 320 : 260} />
      </View>
    </View>
  );
}

function BigStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.bigValue, { color }]}>{value}</Text>
      <Text style={styles.bigLabel}>{label}</Text>
    </View>
  );
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.smallValue}>{value}</Text>
      <Text style={styles.smallLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surfaceElevated ?? '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  topRow: { flexDirection: 'row', gap: SPACING.sm },
  bottomRow: { flexDirection: 'row', gap: SPACING.sm },
  stat: { flex: 1, alignItems: 'flex-start', gap: 2 },
  bigValue: { ...TYPOGRAPHY.statNumber },
  bigLabel: { ...TYPOGRAPHY.caption, color: COLORS.textLight, textTransform: 'uppercase' },
  smallValue: { ...TYPOGRAPHY.body, color: COLORS.text },
  smallLabel: { ...TYPOGRAPHY.caption, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.3 },
  sparkSection: { gap: SPACING.xs },
  sectionLabel: { ...TYPOGRAPHY.label, color: COLORS.textLight },
});
