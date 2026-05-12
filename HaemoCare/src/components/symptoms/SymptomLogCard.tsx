import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SymptomLog } from '../../types/database';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatDateTime } from '../../utils/dateHelpers';
import StatusBadge from '../common/StatusBadge';
import Card from '../common/Card';
import { COLORS, TYPOGRAPHY, SPACING } from '../../config/theme';
import { TranslationKey } from '../../i18n';

interface SymptomLogCardProps {
  log: SymptomLog;
  onPress?: () => void;
}

export default function SymptomLogCard({ log, onPress }: SymptomLogCardProps) {
  const { t, language } = useLanguage();
  const symptoms = (log.symptoms as string[]);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} disabled={!onPress}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.date}>{formatDateTime(log.logged_at, language)}</Text>
          <StatusBadge outcome={log.outcome} />
        </View>
        <View style={styles.symptoms}>
          {symptoms.slice(0, 4).map((s) => (
            <Text key={s} style={styles.symptomText}>
              {t(`symptom.${s}` as TranslationKey)}
              {log.severity_scores[s] ? ` (${log.severity_scores[s]}/10)` : ''}
            </Text>
          ))}
          {symptoms.length > 4 && (
            <Text style={styles.moreText}>+{symptoms.length - 4} more</Text>
          )}
        </View>
        {onPress && (
          <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} style={styles.chevron} />
        )}
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  date: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  symptoms: {
    gap: SPACING.xs,
  },
  symptomText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.text,
  },
  moreText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textLight,
  },
  chevron: {
    position: 'absolute',
    right: SPACING.md,
    top: '50%',
  },
});
