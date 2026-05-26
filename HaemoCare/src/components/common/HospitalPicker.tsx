import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useHospitals, invalidateHospitalsCache } from '../../hooks/useHospitals';
import { TranslationKey } from '../../i18n';
import type { Hospital } from '../../types/database';
import { createOrGetHospital as realCreateOrGet } from '../../services/hospitalService';
import * as mockService from '../../mock/services';
import { useAuth } from '../../contexts/AuthContext';

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
  const { isMockMode } = useAuth();
  const { hospitals, loading } = useHospitals();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [otherMode, setOtherMode] = useState(false);
  const [otherText, setOtherText] = useState('');
  const [otherSubmitting, setOtherSubmitting] = useState(false);
  const [otherError, setOtherError] = useState('');

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

  const handleAddOther = useCallback(async () => {
    const name = otherText.trim();
    if (!name) return;
    setOtherSubmitting(true);
    setOtherError('');
    try {
      const svc = isMockMode ? mockService : { createOrGetHospital: realCreateOrGet };
      const id = await svc.createOrGetHospital(name);
      invalidateHospitalsCache();
      onChange(id);
      setOtherMode(false);
      setOpen(false);
    } catch {
      setOtherError(t('hospital.picker.otherError' as TranslationKey));
    } finally {
      setOtherSubmitting(false);
    }
  }, [otherText, isMockMode, onChange, t]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setOtherMode(false);
    setOtherText('');
    setOtherError('');
  }, []);

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

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <Pressable style={styles.sheet} onPress={() => { /* swallow */ }}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{t('hospital.picker.title' as TranslationKey)}</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={8}>
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {otherMode ? (
              <View style={styles.otherPanel}>
                <Text style={styles.otherLabel}>{t('hospital.picker.otherLabel' as TranslationKey)}</Text>
                <TextInput
                  value={otherText}
                  onChangeText={(v) => { setOtherText(v); if (otherError) setOtherError(''); }}
                  autoFocus
                  style={styles.otherInput}
                  placeholder={t('hospital.picker.otherLabel' as TranslationKey)}
                  placeholderTextColor={COLORS.textLight}
                  editable={!otherSubmitting}
                />
                {otherError ? <Text style={styles.otherErrorText}>{otherError}</Text> : null}
                <View style={styles.otherActions}>
                  <TouchableOpacity onPress={() => setOtherMode(false)} style={styles.otherBackBtn}>
                    <Text style={styles.otherBackText}>{t('hospital.picker.otherBack' as TranslationKey)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleAddOther}
                    disabled={!otherText.trim() || otherSubmitting}
                    style={[styles.otherAddBtn, (!otherText.trim() || otherSubmitting) && styles.otherBtnDisabled]}
                  >
                    {otherSubmitting
                      ? <ActivityIndicator size="small" color={COLORS.white} />
                      : <Text style={styles.otherAddText}>{t('hospital.picker.otherAdd' as TranslationKey)}</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
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
                          {t(REGION_KEYS[region as keyof typeof REGION_KEYS]) || region}
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
                  {!otherMode && (
                    <TouchableOpacity
                      onPress={() => { setOtherMode(true); setOtherText(''); setOtherError(''); }}
                      style={styles.otherRow}
                    >
                      <Feather name="plus" size={16} color={COLORS.primary} />
                      <Text style={styles.otherRowText}>{t('hospital.picker.other' as TranslationKey)}</Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
              </>
            )}
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
  otherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  otherRowText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
  otherPanel: { padding: SPACING.lg, gap: SPACING.sm },
  otherLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, letterSpacing: 0.5 },
  otherInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  otherErrorText: { fontSize: 12, color: COLORS.statusUrgent, fontWeight: '600' },
  otherActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm, marginTop: SPACING.xs },
  otherBackBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.md },
  otherBackText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  otherAddBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otherAddText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  otherBtnDisabled: { opacity: 0.5 },
});
