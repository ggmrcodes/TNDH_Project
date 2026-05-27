import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SymptomLog } from '../../types/database';
import { useLanguage } from '../../contexts/LanguageContext';
import { formatDateTime } from '../../utils/dateHelpers';
import { getSymptomLabel, URINE_COLOR_HEX, isHematuriaColor } from '../../utils/clinicalThresholds';
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
          <View style={styles.dateRow}>
            <Text style={styles.date}>{formatDateTime(log.logged_at, language)}</Text>
            {log.edited_at ? (
              <Text style={styles.editedTag}>{t('symptom.edited')}</Text>
            ) : null}
          </View>
          <StatusBadge outcome={log.outcome} />
        </View>
        <View style={styles.symptoms}>
          {symptoms.slice(0, 4).map((s) => (
            <Text key={s} style={styles.symptomText}>
              {getSymptomLabel(s, t)}
              {log.severity_scores[s] ? ` (${log.severity_scores[s]}/10)` : ''}
            </Text>
          ))}
          {symptoms.length > 4 && (
            <Text style={styles.moreText}>+{symptoms.length - 4} more</Text>
          )}
          {log.urine_color ? (
            <View style={styles.urineRow}>
              <View
                style={[
                  styles.urineSwatch,
                  { backgroundColor: URINE_COLOR_HEX[log.urine_color] },
                ]}
              />
              <Text
                style={[
                  styles.symptomText,
                  isHematuriaColor(log.urine_color) && styles.urineDanger,
                ]}
              >
                {t('symptom.urineColor.label')}: {t(`symptom.urineColor.${log.urine_color}` as TranslationKey)}
              </Text>
            </View>
          ) : null}
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
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  date: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  editedTag: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textLight,
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
  urineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  urineSwatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  urineDanger: {
    color: COLORS.statusUrgent,
    fontWeight: '600',
  },
  chevron: {
    position: 'absolute',
    right: SPACING.md,
    top: '50%',
  },
});
