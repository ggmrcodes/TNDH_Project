import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SymptomLog } from '../../types/database';
import { useLanguage } from '../../contexts/LanguageContext';
import StatusBadge from '../common/StatusBadge';
import Card from '../common/Card';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';
import { getSymptomLabel } from '../../utils/clinicalThresholds';

interface SymptomSummaryProps {
  logs: SymptomLog[];
}

export default function SymptomSummary({ logs }: SymptomSummaryProps) {
  const { t } = useLanguage();

  const normalCount = logs.filter(l => l.outcome === 'normal').length;
  const monitorCount = logs.filter(l => l.outcome === 'monitor').length;
  const urgentCount = logs.filter(l => l.outcome === 'urgent').length;

  const allSymptoms = new Map<string, number>();
  logs.forEach(log => {
    Object.entries(log.severity_scores).forEach(([key, value]) => {
      const current = allSymptoms.get(key) || 0;
      if (value > current) allSymptoms.set(key, value);
    });
  });

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{t('appointments.symptomSummary')}</Text>

      <View style={styles.countsRow}>
        <View style={[styles.countBox, { backgroundColor: COLORS.statusNormalBg }]}>
          <Text style={[styles.countNum, { color: COLORS.statusNormal }]}>{normalCount}</Text>
          <Text style={styles.countLabel}>{t('status.normal')}</Text>
        </View>
        <View style={[styles.countBox, { backgroundColor: COLORS.statusMonitorBg }]}>
          <Text style={[styles.countNum, { color: COLORS.statusMonitor }]}>{monitorCount}</Text>
          <Text style={styles.countLabel}>{t('status.monitor')}</Text>
        </View>
        <View style={[styles.countBox, { backgroundColor: COLORS.statusUrgentBg }]}>
          <Text style={[styles.countNum, { color: COLORS.statusUrgent }]}>{urgentCount}</Text>
          <Text style={styles.countLabel}>{t('status.urgent')}</Text>
        </View>
      </View>

      {allSymptoms.size > 0 && (
        <>
          <Text style={styles.subtitle}>{t('appointments.flaggedSymptoms')}</Text>
          {Array.from(allSymptoms.entries()).map(([key, maxSeverity]) => (
            <View key={key} style={styles.symptomRow}>
              <Text style={styles.symptomName}>{getSymptomLabel(key, t)}</Text>
              <Text style={styles.symptomSeverity}>max {maxSeverity}/10</Text>
            </View>
          ))}
        </>
      )}

      <Text style={styles.totalText}>
        {t('appointments.totalLogs')}: {logs.length}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {},
  title: {
    ...TYPOGRAPHY.h3,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  countsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  countBox: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  countNum: {
    fontSize: 24,
    fontWeight: '700',
  },
  countLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING.md,
  },
  symptomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  symptomName: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.text,
  },
  symptomSeverity: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  totalText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textLight,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
});
