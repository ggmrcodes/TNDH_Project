import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, SHADOWS } from '../../config/theme';
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
      {/* Section header — matches patient info-card pattern (icon-tinted square + label) */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconBg}>
          <Feather name="users" size={14} color={COLORS.primary} />
        </View>
        <Text style={styles.sectionLabel}>
          {t('clinician.dashboard.cohortOverview' as TranslationKey).toUpperCase()}
        </Text>
      </View>

      {/* Primary status stats — color-coded by triage tier */}
      <View style={styles.statRow}>
        <StatusStat
          label={t('clinician.cohort.overdue' as TranslationKey)}
          value={overdueCount}
          color={COLORS.statusUrgent}
          bgColor={COLORS.statusUrgentBg}
        />
        <StatusStat
          label={t('clinician.cohort.monitor' as TranslationKey)}
          value={monitorCount}
          color={COLORS.statusMonitor}
          bgColor={COLORS.statusMonitorBg}
        />
        <StatusStat
          label={t('clinician.cohort.stable' as TranslationKey)}
          value={stableCount}
          color={COLORS.statusNormal}
          bgColor={COLORS.statusNormalBg}
        />
      </View>

      <View style={styles.divider} />

      {/* Secondary stats — 7-day activity snapshot */}
      <Text style={styles.subSectionLabel}>{t('clinician.dashboard.last7days' as TranslationKey).toUpperCase()}</Text>
      <View style={styles.miniStatRow}>
        <MiniStat
          icon="users"
          label={t('clinician.cohort.size' as TranslationKey)}
          value={cohortSize}
        />
        <MiniStat
          icon="alert-triangle"
          label={t('clinician.cohort.urgentLogs7d' as TranslationKey)}
          value={urgentLogs7d}
          tint={urgentLogs7d > 0 ? COLORS.statusUrgent : undefined}
        />
        <MiniStat
          icon="droplet"
          label={t('clinician.cohort.transfusions7d' as TranslationKey)}
          value={transfusions7d}
        />
      </View>

      <View style={styles.divider} />

      {/* Sparkline */}
      <Text style={styles.subSectionLabel}>
        {t('clinician.cohort.sparkline.label' as TranslationKey).toUpperCase()}
      </Text>
      <View style={styles.sparkWrap}>
        <OverdueSparkline data={overdueHistory} width={isWide ? 320 : 260} />
      </View>
    </View>
  );
}

function StatusStat({ label, value, color, bgColor }: { label: string; value: number; color: string; bgColor: string }) {
  return (
    <View style={[styles.statusStat, { backgroundColor: bgColor, borderColor: color }]}>
      <Text style={[styles.statusValue, { color }]}>{value}</Text>
      <Text style={[styles.statusLabel, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function MiniStat({ icon, label, value, tint }: { icon: keyof typeof Feather.glyphMap; label: string; value: number; tint?: string }) {
  const color = tint ?? COLORS.textSecondary;
  return (
    <View style={styles.miniStat}>
      <Feather name={icon} size={14} color={color} />
      <Text style={[styles.miniValue, tint ? { color: tint } : undefined]}>{value}</Text>
      <Text style={styles.miniLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surfaceElevated ?? '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.md,
    marginHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.card,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIconBg: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  sectionLabel: { ...TYPOGRAPHY.label, color: COLORS.textLight },
  subSectionLabel: { ...TYPOGRAPHY.caption, color: COLORS.textLight, fontWeight: '700', letterSpacing: 0.6 },
  statRow: { flexDirection: 'row', gap: SPACING.sm },
  statusStat: {
    flex: 1, borderRadius: RADIUS.md, paddingVertical: 10, paddingHorizontal: 8,
    borderWidth: 1.5, alignItems: 'center', gap: 2,
  },
  statusValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  statusLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  divider: { height: 1, backgroundColor: COLORS.borderLight },
  miniStatRow: { flexDirection: 'row', gap: SPACING.sm },
  miniStat: { flex: 1, alignItems: 'center', gap: 4 },
  miniValue: { ...TYPOGRAPHY.statNumber, fontSize: 18, color: COLORS.text },
  miniLabel: { ...TYPOGRAPHY.caption, color: COLORS.textLight, letterSpacing: 0.3 },
  sparkWrap: { alignItems: 'center' },
});
