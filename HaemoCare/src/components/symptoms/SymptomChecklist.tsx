import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SYMPTOM_CATALOG } from '../../utils/clinicalThresholds';
import { useLanguage } from '../../contexts/LanguageContext';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';
import { TranslationKey } from '../../i18n';

interface SymptomChecklistProps {
  selected: string[];
  onToggle: (key: string) => void;
}

export default function SymptomChecklist({ selected, onToggle }: SymptomChecklistProps) {
  const { t } = useLanguage();

  return (
    <View style={styles.container}>
      {SYMPTOM_CATALOG.map((symptom) => {
        const isSelected = selected.includes(symptom.key);
        return (
          <TouchableOpacity
            key={symptom.key}
            onPress={() => onToggle(symptom.key)}
            style={[styles.item, isSelected && styles.itemSelected]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isSelected ? 'checkbox' : 'square-outline'}
              size={24}
              color={isSelected ? COLORS.primary : COLORS.textLight}
            />
            <Text style={[styles.label, isSelected && styles.labelSelected]}>
              {t(symptom.labelKey as TranslationKey)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  itemSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  label: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    marginLeft: SPACING.md,
  },
  labelSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
});
