import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import type { PrimaryDiagnosis } from '../../types/database';

interface Props {
  value: PrimaryDiagnosis | null;
  onChange: (next: PrimaryDiagnosis | null) => void;
}

const OPTIONS: PrimaryDiagnosis[] = ['thalassemia', 'hemophilia', 'other'];

export default function DiagnosisPicker({ value, onChange }: Props) {
  const { t } = useLanguage();
  return (
    <View style={styles.row}>
      {OPTIONS.map((opt) => {
        const selected = value === opt;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onChange(selected ? null : opt)}
            activeOpacity={0.7}
            style={[styles.chip, selected && styles.chipSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {t(`profile.diagnosis.${opt}` as TranslationKey)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  labelSelected: {
    color: COLORS.white,
  },
});
