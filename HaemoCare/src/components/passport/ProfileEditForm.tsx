import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Profile } from '../../types/database';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../common/Button';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';
import {
  MAX_INTERVAL_WEEKS,
  MIN_INTERVAL_WEEKS,
  clampWeeks,
  daysToWeeks,
  weeksToDays,
} from '../../utils/visitInterval';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import DiagnosisPicker from './DiagnosisPicker';
import ThalassemiaSubtypePicker from './ThalassemiaSubtypePicker';
import HospitalPicker from '../common/HospitalPicker';
import type { PrimaryDiagnosis, ThalassemiaSubtype } from '../../types/database';
import { TranslationKey } from '../../i18n';
import { CliniciansAtHospital } from '../../services/patientService';
import * as realService from '../../services/patientService';
import * as mockService from '../../mock/services';

interface ProfileEditFormProps {
  profile?: Profile | null;
  onSubmit: (data: Partial<Profile>) => void;
  isLoading?: boolean;
  submitLabel?: string;
  /**
   * Signup-only: when provided, renders an optional "Connect your doctor"
   * section. Called AFTER onSubmit resolves successfully. Receives the
   * selection if both hospital + clinician are picked, otherwise null.
   */
  onDoctorSelection?: (info: { hospitalId: string; clinicianUserId: string } | null) => Promise<void>;
  /**
   * Edit-profile-only: extra content rendered inside the form's own
   * ScrollView, above the Save button. Lets callers (e.g. EditProfileScreen)
   * surface things like the connected-clinicians list without breaking the
   * scroll/keyboard behavior the form already owns.
   */
  afterForm?: React.ReactNode;
}

const BLOOD_TYPES = ['A', 'B', 'AB', 'O'] as const;
const RH_FACTORS = ['+', '-'] as const;

export default function ProfileEditForm({ profile, onSubmit, isLoading, submitLabel, onDoctorSelection, afterForm }: ProfileEditFormProps) {
  const { t } = useLanguage();
  const { isMockMode } = useAuth();
  const { isMobile } = useResponsive();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [bloodType, setBloodType] = useState(profile?.blood_type || '');
  const [rhFactor, setRhFactor] = useState(profile?.rh_factor || '');
  const [antibodies, setAntibodies] = useState<string[]>(profile?.antibodies || []);
  const [newAntibody, setNewAntibody] = useState('');
  const [knownReactions, setKnownReactions] = useState(profile?.known_reactions || '');
  const [medications, setMedications] = useState(profile?.medications || '');
  // Visit cadence is stored in days in the DB but presented in weeks in the UI —
  // testers think in weeks ("every 4 weeks"), not days. Helpers in
  // utils/visitInterval handle the boundary conversion + rounding/clamping.
  const [intervalWeeks, setIntervalWeeks] = useState<number>(() =>
    daysToWeeks(profile?.recommended_visit_interval_days ?? null)
  );
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState<PrimaryDiagnosis | null>(
    profile?.primary_diagnosis ?? null
  );
  const [thalassemiaSubtype, setThalassemiaSubtype] = useState<ThalassemiaSubtype | null>(
    profile?.thalassemia_subtype ?? null
  );

  // Doctor section state (only active when onDoctorSelection prop is provided)
  const [hospitalId, setHospitalId] = useState<string | null>(null);
  const [selectedClinicianUserId, setSelectedClinicianUserId] = useState<string | null>(null);
  const [clinicians, setClinicians] = useState<CliniciansAtHospital[]>([]);
  const [cliniciansLoading, setCliniciansLoading] = useState(false);

  useEffect(() => {
    if (!onDoctorSelection || !hospitalId) {
      setClinicians([]);
      setSelectedClinicianUserId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setCliniciansLoading(true);
      try {
        const svc = isMockMode ? mockService : realService;
        const list = await svc.getCliniciansAtHospital(hospitalId);
        if (!cancelled) setClinicians(list);
      } finally {
        if (!cancelled) setCliniciansLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hospitalId, onDoctorSelection, isMockMode]);

  const handleDiagnosisChange = (next: PrimaryDiagnosis | null) => {
    setPrimaryDiagnosis(next);
    // Clear subtype if diagnosis is not thalassemia
    if (next !== 'thalassemia') {
      setThalassemiaSubtype(null);
    }
  };

  const addAntibody = () => {
    const trimmed = newAntibody.trim();
    if (trimmed && !antibodies.includes(trimmed)) {
      setAntibodies([...antibodies, trimmed]);
      setNewAntibody('');
    }
  };

  const removeAntibody = (index: number) => {
    setAntibodies(antibodies.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    onSubmit({
      full_name: fullName.trim(),
      blood_type: bloodType as Profile['blood_type'],
      rh_factor: rhFactor as Profile['rh_factor'],
      antibodies,
      known_reactions: knownReactions.trim(),
      medications: medications.trim(),
      recommended_visit_interval_days: weeksToDays(intervalWeeks),
      primary_diagnosis: primaryDiagnosis,
      thalassemia_subtype: thalassemiaSubtype,
    });
    // New: optional doctor selection callback
    if (onDoctorSelection) {
      if (hospitalId && selectedClinicianUserId) {
        await onDoctorSelection({ hospitalId, clinicianUserId: selectedClinicianUserId });
      } else {
        await onDoctorSelection(null);
      }
    }
  };

  const decreaseInterval = () => setIntervalWeeks((w) => clampWeeks(w - 1));
  const increaseInterval = () => setIntervalWeeks((w) => clampWeeks(w + 1));
  const atMin = intervalWeeks <= MIN_INTERVAL_WEEKS;
  const atMax = intervalWeeks >= MAX_INTERVAL_WEEKS;
  const unitLabel = intervalWeeks === 1
    ? t('profileSetup.visitIntervalUnit.one')
    : t('profileSetup.visitIntervalUnit.other');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' as const, width: '100%' as any },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.label}>{t('profileSetup.fullName')} *</Text>
      <TextInput
        style={styles.input}
        value={fullName}
        onChangeText={setFullName}
        placeholder={t('profileSetup.fullName')}
        placeholderTextColor={COLORS.textLight}
      />

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('profile.diagnosis.label' as TranslationKey)}</Text>
        <DiagnosisPicker value={primaryDiagnosis} onChange={handleDiagnosisChange} />
        {primaryDiagnosis === 'thalassemia' && (
          <View style={{ marginTop: SPACING.md }}>
            <Text style={styles.sectionLabel}>{t('profile.subtype.label' as TranslationKey)}</Text>
            <ThalassemiaSubtypePicker value={thalassemiaSubtype} onChange={setThalassemiaSubtype} />
          </View>
        )}
      </View>

      <Text style={styles.label}>{t('profileSetup.bloodType')} *</Text>
      <View style={styles.segmentRow}>
        {BLOOD_TYPES.map((bt) => (
          <TouchableOpacity
            key={bt}
            onPress={() => setBloodType(bt)}
            style={[styles.segment, bloodType === bt && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, bloodType === bt && styles.segmentTextActive]}>
              {bt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{t('profileSetup.rhFactor')} *</Text>
      <View style={styles.segmentRow}>
        {RH_FACTORS.map((rh) => (
          <TouchableOpacity
            key={rh}
            onPress={() => setRhFactor(rh)}
            style={[styles.segment, rhFactor === rh && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, rhFactor === rh && styles.segmentTextActive]}>
              Rh{rh}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>{t('profileSetup.antibodies')}</Text>
      <View style={styles.chipRow}>
        {antibodies.map((ab, i) => (
          <TouchableOpacity key={i} onPress={() => removeAntibody(i)} style={styles.chip}>
            <Text style={styles.chipText}>{ab} ✕</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.addRow}>
        <TextInput
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
          value={newAntibody}
          onChangeText={setNewAntibody}
          placeholder={t('profileSetup.addAntibody')}
          placeholderTextColor={COLORS.textLight}
          onSubmitEditing={addAntibody}
        />
        <TouchableOpacity onPress={addAntibody} style={styles.addBtn}>
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>{t('profileSetup.knownReactions')}</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={knownReactions}
        onChangeText={setKnownReactions}
        placeholder={t('profileSetup.knownReactions')}
        placeholderTextColor={COLORS.textLight}
        multiline
        numberOfLines={2}
      />

      <Text style={styles.label}>{t('profileSetup.medications')}</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={medications}
        onChangeText={setMedications}
        placeholder={t('profileSetup.medications')}
        placeholderTextColor={COLORS.textLight}
        multiline
        numberOfLines={2}
      />

      <Text style={styles.label}>{t('profileSetup.visitInterval')}</Text>
      <View style={styles.stepperRow}>
        <TouchableOpacity
          onPress={decreaseInterval}
          disabled={atMin}
          style={[styles.stepperBtn, atMin && styles.stepperBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t('profileSetup.visitIntervalDecrease')}
          accessibilityState={{ disabled: atMin }}
        >
          <Text style={[styles.stepperBtnText, atMin && styles.stepperBtnTextDisabled]}>−</Text>
        </TouchableOpacity>
        <View style={styles.stepperValueWrap}>
          <Text style={styles.stepperValue}>{intervalWeeks}</Text>
          <Text style={styles.stepperUnit}>{unitLabel}</Text>
        </View>
        <TouchableOpacity
          onPress={increaseInterval}
          disabled={atMax}
          style={[styles.stepperBtn, atMax && styles.stepperBtnDisabled]}
          accessibilityRole="button"
          accessibilityLabel={t('profileSetup.visitIntervalIncrease')}
          accessibilityState={{ disabled: atMax }}
        >
          <Text style={[styles.stepperBtnText, atMax && styles.stepperBtnTextDisabled]}>+</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>{t('profileSetup.visitIntervalHint')}</Text>

      {onDoctorSelection && (
        <View style={styles.doctorSection}>
          <Text style={styles.sectionLabel}>
            {t('profileSetup.connectDoctor.title' as TranslationKey)}
          </Text>
          <Text style={styles.doctorOptional}>
            {t('profileSetup.connectDoctor.optional' as TranslationKey)}
          </Text>
          <HospitalPicker value={hospitalId} onChange={setHospitalId} />
          {hospitalId && (
            <View style={{ marginTop: SPACING.md, gap: SPACING.sm }}>
              {cliniciansLoading && <ActivityIndicator color={COLORS.primary} />}
              {!cliniciansLoading && clinicians.length === 0 && (
                <Text style={styles.emptyClinicians}>
                  {t('profileSetup.connectDoctor.noClinicians' as TranslationKey)}
                </Text>
              )}
              {clinicians.map(c => {
                const selected = c.user_id === selectedClinicianUserId;
                return (
                  <TouchableOpacity
                    key={c.user_id}
                    onPress={() => setSelectedClinicianUserId(selected ? null : c.user_id)}
                    activeOpacity={0.7}
                    style={[styles.clinicianRow, selected && styles.clinicianRowSelected]}
                  >
                    <View style={styles.clinicianAvatar}>
                      <Feather name="user" size={16} color={COLORS.primary} />
                    </View>
                    <Text style={[styles.clinicianName, selected && styles.clinicianNameSelected]} numberOfLines={1}>
                      {c.full_name || t('clinician.dashboard.title')}
                    </Text>
                    {selected && <Feather name="check" size={18} color={COLORS.primary} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}

      {afterForm}

      <Button
        label={submitLabel || t('common.save')}
        onPress={handleSubmit}
        isLoading={isLoading}
        disabled={!fullName.trim() || !bloodType || !rhFactor}
        style={{ marginTop: SPACING.lg, marginBottom: SPACING.xxl }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  label: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACING.md - 2,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.sm,
  },
  multiline: {
    minHeight: 64,
    textAlignVertical: 'top',
    borderColor: COLORS.borderLight,
  },
  hint: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textLight,
    marginBottom: SPACING.sm,
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  segment: {
    minWidth: 56,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  segmentActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  segmentText: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  segmentTextActive: {
    color: COLORS.primary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  chip: {
    backgroundColor: COLORS.primaryLight,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm + 2,
    borderRadius: RADIUS.full,
  },
  chipText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.primary,
    fontWeight: '600',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: {
    color: COLORS.white,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 26,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnDisabled: {
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  stepperBtnText: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  stepperBtnTextDisabled: {
    color: COLORS.textLight,
  },
  stepperValueWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white,
  },
  stepperValue: {
    ...TYPOGRAPHY.body,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  stepperUnit: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  doctorSection: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  doctorOptional: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: -SPACING.xs,
    marginBottom: SPACING.sm,
  },
  emptyClinicians: {
    fontSize: 13,
    color: COLORS.textSecondary,
    padding: SPACING.md,
    textAlign: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
  },
  clinicianRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.white,
  },
  clinicianRowSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  clinicianAvatar: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  clinicianName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  clinicianNameSelected: {
    color: COLORS.primary,
  },
});
