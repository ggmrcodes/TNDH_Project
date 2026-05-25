import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import type { PrimaryDiagnosis, ThalassemiaSubtype } from '../../types/database';

interface Props {
  diagnosis: PrimaryDiagnosis | null;
  subtype: ThalassemiaSubtype | null;
}

export default function DiagnosisChip({ diagnosis, subtype }: Props) {
  const { t } = useLanguage();

  // Render rules (per spec section 1.4):
  //   both null → nothing
  //   'other' → nothing (no informative content)
  //   thalassemia or hemophilia, no subtype → top-level diagnosis chip
  //   thalassemia with subtype → subtype chip
  if (!diagnosis || diagnosis === 'other') return null;

  const label =
    diagnosis === 'thalassemia' && subtype
      ? t(`profile.subtype.${subtype}` as TranslationKey)
      : t(`profile.diagnosis.${diagnosis}` as TranslationKey);

  return (
    <View style={styles.chip}>
      <Feather name="activity" size={11} color={COLORS.primary} />
      <Text style={styles.text} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryMuted,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: -0.1,
  },
});
