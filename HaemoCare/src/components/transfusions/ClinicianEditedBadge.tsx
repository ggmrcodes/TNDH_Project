// "Reviewed by Dr. X · 2 days ago" pill shown at the top of the patient
// view of a transfusion when `clinician_edited_at` is set by the trigger
// in 2026-06-09-clinician-edit-stamp.sql. Falls back to "by your care
// team" when the editor's display name can't be resolved (e.g. the
// clinician was unlinked after the edit).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import { relativeTime } from '../../utils/dateHelpers';

export interface ClinicianEditedBadgeProps {
  editedAt: string;
  /** Resolved display name of the clinician who edited, or null when
   * the clinician is no longer linked / can't be looked up. */
  clinicianName: string | null;
}

export default function ClinicianEditedBadge({
  editedAt,
  clinicianName,
}: ClinicianEditedBadgeProps) {
  const { t, language } = useLanguage();
  const ago = relativeTime(editedAt, language);
  const label = clinicianName
    ? t('transfusion.clinicianEdited.byNamed' as TranslationKey, {
        name: clinicianName,
        ago,
      })
    : t('transfusion.clinicianEdited.byUnknown' as TranslationKey, { ago });
  return (
    <View
      style={styles.badge}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <Feather name="check-circle" size={14} color={COLORS.primary} />
      <Text style={styles.text} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryMuted,
  },
  text: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.text,
    flex: 1,
    fontWeight: '500',
  },
});
