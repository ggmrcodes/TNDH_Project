import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import type { ThalassemiaSubtype } from '../../types/database';

interface Props {
  value: ThalassemiaSubtype | null;
  onChange: (next: ThalassemiaSubtype | null) => void;
}

const SUBTYPES: ThalassemiaSubtype[] = [
  'alpha_silent_carrier',
  'alpha_trait',
  'hb_h_disease',
  'alpha_major_hb_barts',
  'beta_minor',
  'beta_intermedia',
  'beta_major_cooleys',
  'hb_e_beta_thal',
  'delta_beta_thal',
  'hb_lepore_syndrome',
];

const SUBTYPE_EN_LABELS: Record<ThalassemiaSubtype, string> = {
  alpha_silent_carrier: 'α-thal silent carrier',
  alpha_trait: 'α-thal trait',
  hb_h_disease: 'Hb H disease',
  alpha_major_hb_barts: "α-thal major / Hb Bart's",
  beta_minor: 'β-thal minor / trait',
  beta_intermedia: 'β-thal intermedia',
  beta_major_cooleys: "β-thal major / Cooley's",
  hb_e_beta_thal: 'Hb E/β-thal',
  delta_beta_thal: 'δβ-thal',
  hb_lepore_syndrome: 'Hb Lepore syndrome',
};

export default function ThalassemiaSubtypePicker({ value, onChange }: Props) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);

  const currentLabel = value ? t(`profile.subtype.${value}` as TranslationKey) : null;

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        style={styles.trigger}
        accessibilityRole="button"
        accessibilityLabel={t('profile.subtype.label' as TranslationKey)}
      >
        <Text style={[styles.triggerText, !currentLabel && styles.placeholder]} numberOfLines={1}>
          {currentLabel ?? t('profile.subtype.label' as TranslationKey)}
        </Text>
        <Feather name="chevron-down" size={18} color={COLORS.textLight} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => { /* swallow */ }}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('profile.subtype.label' as TranslationKey)}</Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.scroll}>
              {SUBTYPES.map((s) => {
                const selected = value === s;
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => { onChange(s); setOpen(false); }}
                    style={[styles.row, selected && styles.rowSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>
                        {t(`profile.subtype.${s}` as TranslationKey)}
                      </Text>
                      {language === 'th' && SUBTYPE_EN_LABELS[s] && (
                        <Text style={styles.rowSubtitle}>
                          {SUBTYPE_EN_LABELS[s]}
                        </Text>
                      )}
                    </View>
                    {selected && <Feather name="check" size={18} color={COLORS.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    backgroundColor: COLORS.white,
    minHeight: 50,
  },
  triggerText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  placeholder: {
    color: COLORS.textLight,
    fontWeight: '400',
  },
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  sheet: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.lg,
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    ...(SHADOWS.elevated as object),
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  scroll: {
    paddingVertical: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  rowSelected: {
    backgroundColor: COLORS.primaryLight,
  },
  rowLabel: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
  },
  rowLabelSelected: {
    fontWeight: '700',
    color: COLORS.primary,
  },
  rowSubtitle: {
    fontSize: 11,
    color: COLORS.textLight,
  },
});
