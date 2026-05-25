import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';

interface Props {
  onPress: () => void;
  compact?: boolean;
}

export default function AddPatientButton({ onPress, compact = false }: Props) {
  const { t } = useLanguage();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.btn, compact && styles.btnCompact]}
      accessibilityRole="button"
      accessibilityLabel={t('clinician.linkPatient.addButton' as TranslationKey)}
    >
      <Feather name="plus" size={compact ? 14 : 16} color={COLORS.primary} />
      <Text style={[styles.label, compact && styles.labelCompact]}>
        {t('clinician.linkPatient.addButton' as TranslationKey)}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryMuted,
    alignSelf: 'flex-start',
  },
  btnCompact: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: -0.2,
  },
  labelCompact: {
    fontSize: 12,
  },
});
