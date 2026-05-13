import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';

export type SortKey = 'triage' | 'name' | 'recentActivity' | 'daysOverdue';

export interface QueueSortSelectorProps {
  value: SortKey;
  onChange: (next: SortKey) => void;
}

const OPTIONS: Array<{ id: SortKey; key: TranslationKey }> = [
  { id: 'triage', key: 'clinician.sort.triage' as TranslationKey },
  { id: 'name', key: 'clinician.sort.name' as TranslationKey },
  { id: 'recentActivity', key: 'clinician.sort.recentActivity' as TranslationKey },
  { id: 'daysOverdue', key: 'clinician.sort.daysOverdue' as TranslationKey },
];

export default function QueueSortSelector({ value, onChange }: QueueSortSelectorProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  const currentOption = OPTIONS.find(o => o.id === value) ?? OPTIONS[0];
  const currentLabel = t(currentOption.key);
  const sortLabel = t('clinician.sort.label' as TranslationKey);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        style={styles.chip}
      >
        <Text style={styles.chipText}>{`${sortLabel}: ${currentLabel}`}</Text>
        <Feather name="chevron-down" size={14} color={COLORS.text} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.menu} onPress={() => { /* swallow */ }}>
            {OPTIONS.map(opt => {
              const isSelected = opt.id === value;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                  activeOpacity={0.7}
                  style={styles.menuItem}
                >
                  <Text style={[styles.menuItemText, isSelected && styles.menuItemTextSelected]}>
                    {t(opt.key)}
                  </Text>
                  {isSelected && (
                    <Feather name="check" size={16} color={COLORS.primary ?? '#0B6E6E'} />
                  )}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderLight ?? '#EEEAE5',
    backgroundColor: COLORS.surface ?? '#FFFFFF',
    alignSelf: 'flex-start',
  },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay ?? 'rgba(27, 35, 51, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  menu: {
    backgroundColor: COLORS.surface ?? '#FFFFFF',
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.xs,
    minWidth: 220,
    ...SHADOWS.elevated,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  menuItemText: { fontSize: 14, color: COLORS.text },
  menuItemTextSelected: { fontWeight: '700', color: COLORS.primary ?? '#0B6E6E' },
});
