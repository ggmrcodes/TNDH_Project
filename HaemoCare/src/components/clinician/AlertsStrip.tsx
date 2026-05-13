import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import { relativeTime } from '../../utils/dateHelpers';
import type { CohortAlert, AlertKind } from '../../utils/cohortAlerts';

export interface AlertsStripProps {
  alerts: CohortAlert[];
  totalAlerts: number;
  selectedPatientId: string | null;
  onSelectPatient: (id: string) => void;
  language: 'th' | 'en';
}

const KIND_KEY: Record<AlertKind, TranslationKey> = {
  urgent_log: 'clinician.alerts.urgentLog' as TranslationKey,
  reaction_recorded: 'clinician.alerts.reactionRecorded' as TranslationKey,
  tier2_overdue: 'clinician.alerts.tier2Overdue' as TranslationKey,
  tier1_overdue_new: 'clinician.alerts.tier1OverdueNew' as TranslationKey,
};

export default function AlertsStrip({
  alerts,
  totalAlerts,
  selectedPatientId,
  onSelectPatient,
  language,
}: AlertsStripProps) {
  const { t } = useLanguage();
  const extra = Math.max(0, totalAlerts - alerts.length);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Feather name="bell" size={14} color={COLORS.textLight} />
        <Text style={styles.title}>
          {t('clinician.alerts.title' as TranslationKey).toUpperCase()}
        </Text>
      </View>

      {alerts.length === 0 ? (
        <Text style={styles.empty}>{t('clinician.alerts.empty' as TranslationKey)}</Text>
      ) : (
        <View>
          {alerts.map((a, idx) => {
            const isSelected = selectedPatientId === a.patientId;
            const dotColor =
              a.severity === 'red'
                ? COLORS.statusUrgent ?? '#DC3B3B'
                : COLORS.statusMonitor ?? '#E8933A';
            return (
              <TouchableOpacity
                key={`${a.patientId}::${a.kind}::${idx}`}
                onPress={() => onSelectPatient(a.patientId)}
                activeOpacity={0.7}
                style={[styles.row, isSelected && styles.rowSelected]}
              >
                <View style={[styles.dot, { backgroundColor: dotColor }]} />
                <View style={styles.col}>
                  <Text style={styles.kind} numberOfLines={1}>
                    {t(KIND_KEY[a.kind])}
                  </Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {a.patientDisplayName}
                  </Text>
                </View>
                <Text style={styles.time}>{relativeTime(a.signalAt, language)}</Text>
                <Feather name="chevron-right" size={16} color={COLORS.textLight} />
              </TouchableOpacity>
            );
          })}
          {extra > 0 && (
            <View style={styles.moreRow}>
              <Text style={styles.moreText}>
                {t('clinician.alerts.more' as TranslationKey, { count: extra })}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surfaceElevated ?? '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...TYPOGRAPHY.label, color: COLORS.textLight },
  empty: { ...TYPOGRAPHY.bodySmall, color: COLORS.textLight, fontStyle: 'italic' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  rowSelected: { backgroundColor: COLORS.primaryLight ?? '#E4F5F4' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  col: { flex: 1, gap: 2 },
  kind: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  name: { fontSize: 11, color: COLORS.textLight },
  time: { fontSize: 11, color: COLORS.textLight },
  moreRow: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  moreText: { fontSize: 11, color: COLORS.textLight, fontStyle: 'italic' },
});
