import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { SYMPTOM_CATALOG, CUSTOM_SYMPTOM_PREFIX, isCustomSymptom, getSymptomLabel } from '../../utils/clinicalThresholds';
import { useLanguage } from '../../contexts/LanguageContext';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';

interface SymptomChecklistProps {
  selected: string[];
  onToggle: (key: string) => void;
}

export default function SymptomChecklist({ selected, onToggle }: SymptomChecklistProps) {
  const { t } = useLanguage();
  const [customInput, setCustomInput] = useState('');

  const customSelected = selected.filter(isCustomSymptom);

  const addCustom = () => {
    const label = customInput.trim();
    if (!label) return;
    const key = `${CUSTOM_SYMPTOM_PREFIX}${label}`;
    if (!selected.includes(key)) onToggle(key);
    setCustomInput('');
  };

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
            <Text style={[styles.label, isSelected && styles.labelSelected]} numberOfLines={1}>
              {getSymptomLabel(symptom.key, t)}
            </Text>
          </TouchableOpacity>
        );
      })}

      {customSelected.map((key) => (
        <TouchableOpacity
          key={key}
          onPress={() => onToggle(key)}
          style={[styles.item, styles.itemSelected]}
          activeOpacity={0.7}
        >
          <Ionicons name="checkbox" size={24} color={COLORS.primary} />
          <Text style={[styles.label, styles.labelSelected]} numberOfLines={1}>
            {getSymptomLabel(key, t)}
          </Text>
        </TouchableOpacity>
      ))}

      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          value={customInput}
          onChangeText={setCustomInput}
          placeholder={t('symptoms.customPlaceholder')}
          placeholderTextColor={COLORS.textLight}
          returnKeyType="done"
          onSubmitEditing={addCustom}
          maxLength={60}
        />
        <TouchableOpacity
          onPress={addCustom}
          disabled={!customInput.trim()}
          style={[styles.addBtn, !customInput.trim() && styles.addBtnDisabled]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('symptoms.customAdd')}
        >
          <Feather name="plus" size={20} color={COLORS.white} />
        </TouchableOpacity>
      </View>
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
    flex: 1,
  },
  labelSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  addInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnDisabled: {
    opacity: 0.4,
  },
});
