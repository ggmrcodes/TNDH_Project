import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, SafeAreaView,
  ActivityIndicator, RefreshControl, ScrollView, Modal, TextInput, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import { useHospitals } from '../../hooks/useHospitals';
import { usePendingClinicians } from '../../hooks/usePendingClinicians';
import LanguageToggle from '../../components/common/LanguageToggle';
import { TranslationKey } from '../../i18n';
import * as realClinicianService from '../../services/clinicianService';
import * as realHospitalService from '../../services/hospitalService';
import * as mockService from '../../mock/services';
import type { PendingClinician, Hospital } from '../../types/database';

type HospitalRegion = NonNullable<Hospital['region']>;
const REGIONS: HospitalRegion[] = ['north', 'northeast', 'central', 'south', 'east', 'west'];

function PendingRow({ clinician, hospitalLabel, onApprove }: {
  clinician: PendingClinician;
  hospitalLabel: string;
  onApprove: () => Promise<void>;
}) {
  const { t, language } = useLanguage();
  const [busy, setBusy] = useState(false);
  const date = (() => {
    try {
      return new Date(clinician.created_at).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch { return clinician.created_at; }
  })();
  return (
    <View style={styles.card}>
      <View style={styles.cardCol}>
        <Text style={styles.name}>{clinician.full_name?.trim() || '—'}</Text>
        <Text style={styles.meta}>
          {t('admin.approvals.licenseLabel' as TranslationKey)}: {clinician.license_number || '—'}
        </Text>
        <Text style={styles.meta}>{hospitalLabel}</Text>
        <Text style={styles.metaLight}>
          {t('admin.approvals.signedUpAt' as TranslationKey, { date })}
        </Text>
      </View>
      <TouchableOpacity
        onPress={async () => { setBusy(true); try { await onApprove(); } finally { setBusy(false); } }}
        disabled={busy}
        style={[styles.approveBtn, busy && styles.btnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={t('admin.approvals.approve' as TranslationKey)}
      >
        {busy
          ? <ActivityIndicator size="small" color={COLORS.white} />
          : <Text style={styles.approveText}>{t('admin.approvals.approve' as TranslationKey)}</Text>}
      </TouchableOpacity>
    </View>
  );
}

function HospitalRow({ hospital, onEdit, onToggleActive }: {
  hospital: Hospital;
  onEdit: () => void;
  onToggleActive: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const meta = [hospital.code, hospital.region].filter(Boolean).join(' · ') || '—';
  return (
    <View style={[styles.card, !hospital.is_active && styles.cardInactive]}>
      <View style={styles.cardCol}>
        <View style={styles.hospitalNameRow}>
          <Text style={styles.name} numberOfLines={1}>{hospital.name_th}</Text>
          {!hospital.is_active && (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>
                {t('admin.hospitals.inactive' as TranslationKey)}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.meta} numberOfLines={1}>{hospital.name_en}</Text>
        <Text style={styles.metaLight}>{meta}</Text>
      </View>
      <TouchableOpacity
        onPress={onEdit}
        style={styles.iconBtn}
        accessibilityRole="button"
        accessibilityLabel={t('admin.hospitals.edit' as TranslationKey)}
      >
        <Feather name="edit-2" size={18} color={COLORS.primary} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={async () => { setBusy(true); try { await onToggleActive(); } finally { setBusy(false); } }}
        disabled={busy}
        style={[styles.iconBtn, busy && styles.btnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={
          hospital.is_active
            ? t('admin.hospitals.deactivate' as TranslationKey)
            : t('admin.hospitals.reactivate' as TranslationKey)
        }
      >
        {busy ? (
          <ActivityIndicator size="small" color={COLORS.textSecondary} />
        ) : (
          <Feather
            name={hospital.is_active ? 'eye-off' : 'eye'}
            size={18}
            color={hospital.is_active ? COLORS.statusUrgent : COLORS.statusNormal}
          />
        )}
      </TouchableOpacity>
    </View>
  );
}

interface HospitalFormProps {
  initial: Hospital | null;
  onClose: () => void;
  onSaved: () => void;
  isMockMode: boolean;
}

function HospitalFormModal({ initial, onClose, onSaved, isMockMode }: HospitalFormProps) {
  const { t } = useLanguage();
  const [nameTh, setNameTh] = useState(initial?.name_th ?? '');
  const [nameEn, setNameEn] = useState(initial?.name_en ?? '');
  const [code, setCode] = useState(initial?.code ?? '');
  const [region, setRegion] = useState<HospitalRegion | null>(initial?.region ?? null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nameTh.trim() || !nameEn.trim()) {
      Alert.alert(
        t('admin.hospitals.nameRequiredTitle' as TranslationKey),
        t('admin.hospitals.nameRequiredBody' as TranslationKey),
      );
      return;
    }
    setSaving(true);
    try {
      const svc = isMockMode ? mockService : realHospitalService;
      const input = {
        name_th: nameTh.trim(),
        name_en: nameEn.trim(),
        code: code.trim() || null,
        region,
      };
      if (initial) {
        await svc.adminUpdateHospital(initial.id, input);
      } else {
        await svc.adminCreateHospital(input);
      }
      onSaved();
    } catch (e) {
      Alert.alert(t('common.error'), e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {initial
              ? t('admin.hospitals.editTitle' as TranslationKey)
              : t('admin.hospitals.addTitle' as TranslationKey)}
          </Text>

          <Text style={styles.label}>{t('admin.hospitals.nameTh' as TranslationKey)}</Text>
          <TextInput style={styles.input} value={nameTh} onChangeText={setNameTh} />

          <Text style={styles.label}>{t('admin.hospitals.nameEn' as TranslationKey)}</Text>
          <TextInput style={styles.input} value={nameEn} onChangeText={setNameEn} />

          <Text style={styles.label}>{t('admin.hospitals.code' as TranslationKey)}</Text>
          <TextInput style={styles.input} value={code} onChangeText={setCode} autoCapitalize="none" />

          <Text style={styles.label}>{t('admin.hospitals.region' as TranslationKey)}</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, region === null && styles.chipActive]}
              onPress={() => setRegion(null)}
            >
              <Text style={[styles.chipText, region === null && styles.chipTextActive]}>
                {t('admin.hospitals.regionNone' as TranslationKey)}
              </Text>
            </TouchableOpacity>
            {REGIONS.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, region === r && styles.chipActive]}
                onPress={() => setRegion(r)}
              >
                <Text style={[styles.chipText, region === r && styles.chipTextActive]}>
                  {t(`admin.hospitals.region.${r}` as TranslationKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancel} onPress={onClose} disabled={saving}>
              <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSave, saving && styles.btnDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color={COLORS.white} />
                : <Text style={styles.modalSaveText}>{t('common.save')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function AdminScreen() {
  const { t } = useLanguage();
  const { signOut, isMockMode } = useAuth();
  const { isMobile } = useResponsive();
  const { hospitals } = useHospitals();
  const { pending, count, loading, refresh: refreshPending } = usePendingClinicians();

  const [allHospitals, setAllHospitals] = useState<Hospital[]>([]);
  const [loadingHospitals, setLoadingHospitals] = useState(true);
  const [editing, setEditing] = useState<Hospital | 'new' | null>(null);

  const loadHospitals = useCallback(async () => {
    setLoadingHospitals(true);
    try {
      const svc = isMockMode ? mockService : realHospitalService;
      const list = await svc.adminListAllHospitals();
      setAllHospitals(list);
    } finally {
      setLoadingHospitals(false);
    }
  }, [isMockMode]);

  useEffect(() => { loadHospitals(); }, [loadHospitals]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshPending(), loadHospitals()]);
  }, [refreshPending, loadHospitals]);

  const hospitalLabelFor = useCallback((c: PendingClinician): string => {
    if (c.hospital_id) {
      const h = hospitals.find(x => x.id === c.hospital_id);
      if (h) return h.name_th;
    }
    return c.hospital_affiliation?.trim() || '—';
  }, [hospitals]);

  const handleApprove = useCallback(async (userId: string) => {
    const svc = isMockMode ? mockService : realClinicianService;
    await svc.approveClinician(userId);
    refreshPending();
  }, [isMockMode, refreshPending]);

  const handleToggleActive = useCallback(async (h: Hospital) => {
    const svc = isMockMode ? mockService : realHospitalService;
    await svc.adminSetHospitalActive(h.id, !h.is_active);
    loadHospitals();
  }, [isMockMode, loadHospitals]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>HaemoCare</Text>
        <View style={styles.topBarActions}>
          <TouchableOpacity onPress={signOut} style={styles.signOutBtn} accessibilityLabel={t('auth.logout')}>
            <Feather name="log-out" size={18} color={COLORS.statusUrgent} />
          </TouchableOpacity>
          <LanguageToggle />
        </View>
      </View>

      <View style={[styles.header, !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t('admin.title' as TranslationKey)}</Text>
          {count > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{count}</Text>
            </View>
          )}
        </View>
        <Text style={styles.subtitle}>{t('admin.subtitle' as TranslationKey)}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.listContent,
          !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', width: '100%' },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={(loading && pending.length > 0) || loadingHospitals}
            onRefresh={refreshAll}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Pending clinician approvals */}
        <Text style={styles.sectionTitle}>
          {t('admin.approvals.section' as TranslationKey)}
        </Text>
        {loading && pending.length === 0 ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginVertical: SPACING.md }} />
        ) : pending.length === 0 ? (
          <Text style={styles.empty}>{t('admin.approvals.empty' as TranslationKey)}</Text>
        ) : (
          pending.map((item) => (
            <PendingRow
              key={item.user_id}
              clinician={item}
              hospitalLabel={hospitalLabelFor(item)}
              onApprove={() => handleApprove(item.user_id)}
            />
          ))
        )}

        {/* Hospitals directory */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {t('admin.hospitals.section' as TranslationKey)}
          </Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setEditing('new')}
            accessibilityRole="button"
            accessibilityLabel={t('admin.hospitals.add' as TranslationKey)}
          >
            <Feather name="plus" size={16} color={COLORS.white} />
            <Text style={styles.addBtnText}>{t('admin.hospitals.add' as TranslationKey)}</Text>
          </TouchableOpacity>
        </View>
        {loadingHospitals && allHospitals.length === 0 ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginVertical: SPACING.md }} />
        ) : allHospitals.length === 0 ? (
          <Text style={styles.empty}>{t('admin.hospitals.empty' as TranslationKey)}</Text>
        ) : (
          allHospitals.map((h) => (
            <HospitalRow
              key={h.id}
              hospital={h}
              onEdit={() => setEditing(h)}
              onToggleActive={() => handleToggleActive(h)}
            />
          ))
        )}
      </ScrollView>

      {editing && (
        <HospitalFormModal
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadHospitals(); }}
          isMockMode={isMockMode}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingTop: 56, paddingBottom: SPACING.sm,
  },
  brand: { fontSize: 20, fontWeight: '800', color: COLORS.primary, letterSpacing: -0.3 },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  signOutBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.statusUrgentBg,
    borderWidth: 1, borderColor: COLORS.statusUrgent,
    justifyContent: 'center', alignItems: 'center',
  },
  header: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  title: { ...TYPOGRAPHY.h1, color: COLORS.text },
  badge: {
    minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 8,
    backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center',
  },
  badgeText: { color: COLORS.white, fontWeight: '800', fontSize: 13 },
  subtitle: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, marginTop: SPACING.xs },
  listContent: { padding: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.sm },
  sectionTitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: SPACING.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.md, backgroundColor: COLORS.primary,
    minHeight: 36,
  },
  addBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 13 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.cardBorder,
    padding: SPACING.md, ...SHADOWS.card,
  },
  cardInactive: { opacity: 0.55 },
  cardCol: { flex: 1, gap: 2 },
  hospitalNameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  inactiveBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: COLORS.borderLight, borderRadius: 6,
  },
  inactiveBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.textSecondary, letterSpacing: 0.5 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textSecondary },
  metaLight: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  approveBtn: {
    backgroundColor: COLORS.primary, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md, minWidth: 96, minHeight: 40, alignItems: 'center', justifyContent: 'center',
  },
  approveText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  empty: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 14, marginTop: SPACING.md },
  // ── HospitalFormModal styles ─────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    gap: SPACING.xs,
  },
  modalTitle: {
    fontSize: 18, fontWeight: '800', color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  label: {
    fontSize: 11, fontWeight: '700', color: COLORS.textSecondary,
    letterSpacing: 0.6, textTransform: 'uppercase',
    marginTop: SPACING.sm,
  },
  input: {
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm + 2, paddingVertical: SPACING.sm,
    fontSize: 15, color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: SPACING.xs },
  chip: {
    paddingHorizontal: SPACING.sm + 2, paddingVertical: SPACING.xs + 2,
    borderRadius: 999,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipActive: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: COLORS.primary, fontWeight: '700' },
  modalActions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    gap: SPACING.sm, marginTop: SPACING.md,
  },
  modalCancel: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, minHeight: 44, justifyContent: 'center' },
  modalCancelText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  modalSave: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md, minHeight: 44, minWidth: 100,
    alignItems: 'center', justifyContent: 'center',
  },
  modalSaveText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },
});
