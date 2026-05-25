import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useHospitals } from '../../hooks/useHospitals';
import { TranslationKey } from '../../i18n';
import type { Hospital } from '../../types/database';

interface Props {
  value: string | null;
  onChange: (hospitalId: string | null) => void;
  placeholder?: string;
}

const REGION_KEYS: Record<NonNullable<Hospital['region']>, TranslationKey> = {
  north: 'hospital.region.north' as TranslationKey,
  northeast: 'hospital.region.northeast' as TranslationKey,
  central: 'hospital.region.central' as TranslationKey,
  south: 'hospital.region.south' as TranslationKey,
  east: 'hospital.region.east' as TranslationKey,
  west: 'hospital.region.west' as TranslationKey,
};

export default function HospitalPicker({ value, onChange, placeholder }: Props) {
  const { t } = useLanguage();
  const { hospitals, loading } = useHospitals();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = useMemo(() => hospitals.find(h => h.id === value) ?? null, [hospitals, value]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hospitals;
    return hospitals.filter(h =>
      h.name_th.toLowerCase().includes(q) ||
      h.name_en.toLowerCase().includes(q) ||
      (h.code ?? '').toLowerCase().includes(q)
    );
  }, [hospitals, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Hospital[]>();
    filtered.forEach(h => {
      const key = h.region ?? 'other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(h);
    });
    return map;
  }, [filtered]);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        style={styles.trigger}
      >
        <Feather name="map-pin" size={16} color={COLORS.textLight} />
        <Text style={[styles.triggerText, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.name_th : (placeholder ?? t('hospital.picker.title' as TranslationKey))}
        </Text>
        <Feather name="chevron-down" size={18} color={COLORS.textLight} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => { /* swallow */ }}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('hospital.picker.title' as TranslationKey)}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchWrap}>
              <Feather name="search" size={16} color={COLORS.textLight} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('hospital.picker.searchPlaceholder' as TranslationKey)}
                placeholderTextColor={COLORS.textLight}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <ScrollView style={styles.scroll}>
              {loading && <ActivityIndicator color={COLORS.primary} style={{ padding: SPACING.lg }} />}
              {!loading && filtered.length === 0 && (
                <Text style={styles.empty}>{t('hospital.picker.empty' as TranslationKey)}</Text>
              )}
              {!loading && Array.from(grouped.entries()).map(([region, items]) => (
                <View key={region}>
                  {region !== 'other' && (
                    <Text style={styles.groupLabel}>
                      {t(REGION_KEYS[region as keyof typeof REGION_KEYS])}
                    </Text>
                  )}
                  {items.map(h => {
                    const isSelected = h.id === value;
                    return (
                      <TouchableOpacity
                        key={h.id}
                        onPress={() => { onChange(h.id); setOpen(false); }}
                        style={[styles.row, isSelected && styles.rowSelected]}
                      >
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[styles.rowPrimary, isSelected && styles.rowSelectedText]}>
                            {h.name_th}
                          </Text>
                          <Text style={styles.rowSubtitle}>{h.name_en}</Text>
                        </View>
                        {isSelected && <Feather name="check" size={18} color={COLORS.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
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
    gap: SPACING.sm + 2,
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
    maxWidth: 480,
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
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    margin: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.background,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
  },
  scroll: {
    paddingBottom: SPACING.lg,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textLight,
    letterSpacing: 1.2,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  rowSelected: {
    backgroundColor: COLORS.primaryLight,
  },
  rowPrimary: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  rowSelectedText: {
    color: COLORS.primary,
  },
  rowSubtitle: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  empty: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.textSecondary,
    padding: SPACING.lg,
  },
});
