import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThresholdResult, getSymptomLabel } from '../../utils/clinicalThresholds';
import { useLanguage } from '../../contexts/LanguageContext';
import StatusBadge from '../common/StatusBadge';
import Card from '../common/Card';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';
import { TranslationKey } from '../../i18n';

interface OutcomeDisplayProps {
  result: ThresholdResult;
}

const ICONS = {
  normal: 'checkmark-circle' as const,
  monitor: 'alert-circle' as const,
  urgent: 'warning' as const,
};

const BG_COLORS = {
  normal: COLORS.statusNormalBg,
  monitor: COLORS.statusMonitorBg,
  urgent: COLORS.statusUrgentBg,
};

const ICON_COLORS = {
  normal: COLORS.statusNormal,
  monitor: COLORS.statusMonitor,
  urgent: COLORS.statusUrgent,
};

export default function OutcomeDisplay({ result }: OutcomeDisplayProps) {
  const { t } = useLanguage();
  const isUrgent = result.outcome === 'urgent';

  return (
    <Card style={[styles.card, { backgroundColor: BG_COLORS[result.outcome] }]}>
      <Ionicons
        name={ICONS[result.outcome]}
        size={isUrgent ? 64 : 48}
        color={ICON_COLORS[result.outcome]}
        style={styles.icon}
      />
      <StatusBadge outcome={result.outcome} large />
      <Text style={[
        styles.message,
        isUrgent && styles.urgentMessage,
        { color: ICON_COLORS[result.outcome] },
      ]}>
        {t(`status.${result.outcome}.message` as TranslationKey)}
      </Text>
      {result.triggeringSymptoms.length > 0 && (
        <View style={styles.triggers}>
          {result.triggeringSymptoms.map((s) => (
            <View key={s} style={styles.triggerChip}>
              <Text style={styles.triggerText}>
                {getSymptomLabel(s, t)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  icon: {
    marginBottom: SPACING.md,
  },
  message: {
    ...TYPOGRAPHY.body,
    textAlign: 'center',
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    lineHeight: 24,
  },
  urgentMessage: {
    ...TYPOGRAPHY.h3,
    fontWeight: '700',
    lineHeight: 28,
  },
  triggers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
  },
  triggerChip: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm + 2,
    borderRadius: RADIUS.full,
  },
  triggerText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
  },
});
