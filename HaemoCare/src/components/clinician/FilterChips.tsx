import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';

export type FilterId = 'overdue' | 'recentUrgent' | 'hasReactions' | null;

export interface FilterChipsProps {
  active: FilterId;
  onChange: (next: FilterId) => void;
}

const CHIPS: Array<{ id: Exclude<FilterId, null>; key: TranslationKey }> = [
  { id: 'overdue', key: 'clinician.filter.overdue' as TranslationKey },
  { id: 'recentUrgent', key: 'clinician.filter.recentUrgent' as TranslationKey },
  { id: 'hasReactions', key: 'clinician.filter.hasReactions' as TranslationKey },
];

export default function FilterChips({ active, onChange }: FilterChipsProps) {
  const { t } = useLanguage();
  return (
    <View style={styles.row}>
      {CHIPS.map(chip => {
        const isActive = active === chip.id;
        return (
          <TouchableOpacity
            key={chip.id}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={() => onChange(isActive ? null : chip.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{t(chip.key)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.xs, flexWrap: 'wrap', paddingHorizontal: SPACING.md, marginVertical: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderLight ?? '#E4E4E4',
    backgroundColor: 'transparent',
  },
  chipActive: { backgroundColor: COLORS.primaryLight ?? '#E7F4F2', borderColor: COLORS.primary ?? '#0B6E6E' },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: COLORS.primary ?? '#0B6E6E' },
});
