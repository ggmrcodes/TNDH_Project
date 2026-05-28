import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThresholdResult, getSymptomLabel } from '../../utils/clinicalThresholds';
import { useLanguage } from '../../contexts/LanguageContext';
import StatusBadge from '../common/StatusBadge';
import Card from '../common/Card';
import { TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';
import { TranslationKey } from '../../i18n';
import { outcomeColors } from '../../utils/statusColors';

interface OutcomeDisplayProps {
  result: ThresholdResult;
}

const ICONS = {
  normal: 'checkmark-circle' as const,
  monitor: 'alert-circle' as const,
  urgent: 'warning' as const,
};

export default function OutcomeDisplay({ result }: OutcomeDisplayProps) {
  const { t } = useLanguage();
  const isUrgent = result.outcome === 'urgent';
  const { fg: iconColor, bg } = outcomeColors(result.outcome);

  return (
    <Card style={[styles.card, { backgroundColor: bg }]}>
      <Ionicons
        name={ICONS[result.outcome]}
        size={isUrgent ? 64 : 48}
        color={iconColor}
        style={styles.icon}
      />
      <StatusBadge outcome={result.outcome} large />
      <Text style={[
        styles.message,
        isUrgent && styles.urgentMessage,
        { color: iconColor },
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
