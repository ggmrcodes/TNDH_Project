import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, Modal, Pressable, Switch, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, SHADOWS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useHospitals } from '../../hooks/useHospitals';
import HospitalPicker from '../../components/common/HospitalPicker';
import { TranslationKey } from '../../i18n';
import * as realService from '../../services/patientService';
import * as mockService from '../../mock/services';
import type { CliniciansAtHospital } from '../../services/patientService';

export default function PatientFindClinicianScreen() {
  const navigation = useNavigation();
  const { t } = useLanguage();
  const { user, isMockMode } = useAuth();
  const { hospitals } = useHospitals();
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [clinicians, setClinicians] = useState<CliniciansAtHospital[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<CliniciansAtHospital | null>(null);
  const [shareFullName, setShareFullName] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const selectedHospital = useMemo(
    () => hospitals.find(h => h.id === hospitalId) ?? null,
    [hospitals, hospitalId]
  );

  useEffect(() => {
    if (!hospitalId) {
      setClinicians([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const svc = isMockMode ? mockService : realService;
        const data = await svc.getCliniciansAtHospital(hospitalId);
        if (!cancelled) setClinicians(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hospitalId, isMockMode]);

  const handleSubmit = async () => {
    if (!confirmTarget || !user?.id) return;
    setError('');
    setSubmitting(true);
    try {
      const svc = isMockMode ? mockService : realService;
      await svc.requestClinicianLink(confirmTarget.user_id, user.id, shareFullName);
      setSuccess(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg === 'ALREADY_ACTIVE') {
        setError(t('patient.findClinician.alreadyConnected' as TranslationKey));
      } else if (msg === 'ALREADY_PENDING') {
        setError(t('patient.findClinician.alreadyPending' as TranslationKey));
      } else {
        setError(t('patient.findClinician.error' as TranslationKey));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const closeConfirm = () => {
    setConfirmTarget(null);
    setShareFullName(true);
    setSuccess(false);
    setError('');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>{t('patient.findClinician.step1Title' as TranslationKey)}</Text>
        <HospitalPicker value={hospitalId} onChange={setHospitalId} />

        {hospitalId && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>
              {t('patient.findClinician.step2Title' as TranslationKey)}
            </Text>
            {loading ? (
              <ActivityIndicator color={COLORS.primary} style={{ paddingVertical: SPACING.lg }} />
            ) : clinicians.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>{t('patient.findClinician.empty' as TranslationKey)}</Text>
              </View>
            ) : (
              clinicians.map(c => (
                <TouchableOpacity
                  key={c.user_id}
                  onPress={() => setConfirmTarget(c)}
                  style={styles.clinicianRow}
                >
                  <View style={styles.avatar}>
                    <Feather name="user" size={18} color={COLORS.primary} />
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.clinicianName}>{c.full_name || 'Clinician'}</Text>
                    <Text style={styles.clinicianHospital}>{selectedHospital?.name_th ?? ''}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={COLORS.textLight} />
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={!!confirmTarget} transparent animationType="fade" onRequestClose={closeConfirm}>
        <Pressable style={styles.backdrop} onPress={closeConfirm}>
          <Pressable style={styles.card} onPress={() => { /* swallow */ }}>
            <View style={styles.header}>
              <Text style={styles.title}>{t('patient.findClinician.confirmTitle' as TranslationKey)}</Text>
              <TouchableOpacity onPress={closeConfirm} hitSlop={8}>
                <Feather name="x" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {success ? (
              <View style={styles.successWrap}>
                <View style={styles.successIcon}>
                  <Feather name="check" size={22} color={COLORS.statusNormal} />
                </View>
                <Text style={styles.successText}>
                  {t('patient.findClinician.success' as TranslationKey, { name: confirmTarget?.full_name ?? '' })}
                </Text>
                <TouchableOpacity onPress={() => { closeConfirm(); navigation.goBack(); }} style={styles.primaryBtn}>
                  <Text style={styles.primaryText}>{t('clinician.linkPatient.close' as TranslationKey)}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.targetCard}>
                  <Text style={styles.targetName}>{confirmTarget?.full_name}</Text>
                  <Text style={styles.targetHospital}>{selectedHospital?.name_th}</Text>
                </View>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleLabelCol}>
                    <Text style={styles.toggleLabel}>{t('patient.linkRequest.shareFullNameLabel' as TranslationKey)}</Text>
                    <Text style={styles.toggleHelp}>{t('patient.linkRequest.shareFullNameHelp' as TranslationKey)}</Text>
                  </View>
                  <Switch
                    value={shareFullName}
                    onValueChange={setShareFullName}
                    trackColor={{ false: COLORS.borderLight, true: COLORS.primaryMuted }}
                    thumbColor={shareFullName ? COLORS.primary : COLORS.surface}
                  />
                </View>
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={submitting}
                  style={[styles.primaryBtn, submitting && styles.btnDisabled]}
                >
                  {submitting ? <ActivityIndicator color={COLORS.white} /> : (
                    <Text style={styles.primaryText}>{t('patient.findClinician.confirmSubmit' as TranslationKey)}</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  sectionLabel: { ...TYPOGRAPHY.label, color: COLORS.textLight, marginBottom: SPACING.sm },
  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    ...SHADOWS.card,
  },
  emptyText: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },
  clinicianRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    ...SHADOWS.card,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  col: { flex: 1, gap: 2 },
  clinicianName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  clinicianHospital: { fontSize: 12, color: COLORS.textSecondary },
  backdrop: {
    flex: 1, backgroundColor: COLORS.overlay,
    justifyContent: 'center', alignItems: 'center', padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    width: '100%', maxWidth: 420, gap: SPACING.md,
    ...(SHADOWS.elevated as object),
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  targetCard: {
    backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md,
    padding: SPACING.md, alignItems: 'center',
  },
  targetName: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  targetHospital: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  toggleLabelCol: { flex: 1, gap: 2 },
  toggleLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  toggleHelp: { fontSize: 11, color: COLORS.textSecondary, lineHeight: 15 },
  errorText: { fontSize: 12, color: COLORS.statusUrgent, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    minHeight: 44, justifyContent: 'center',
  },
  primaryText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  btnDisabled: { opacity: 0.5 },
  successWrap: { alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm },
  successIcon: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.statusNormalBg,
    justifyContent: 'center', alignItems: 'center',
  },
  successText: { fontSize: 14, color: COLORS.text, textAlign: 'center', lineHeight: 20 },
});
