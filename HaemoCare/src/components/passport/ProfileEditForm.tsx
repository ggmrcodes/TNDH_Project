import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Profile } from '../../types/database';
import { useLanguage } from '../../contexts/LanguageContext';
import Button from '../common/Button';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';

interface ProfileEditFormProps {
  profile?: Profile | null;
  onSubmit: (data: Partial<Profile>) => void;
  isLoading?: boolean;
  submitLabel?: string;
}

const BLOOD_TYPES = ['A', 'B', 'AB', 'O'] as const;
const RH_FACTORS = ['+', '-'] as const;

export default function ProfileEditForm({ profile, onSubmit, isLoading, submitLabel }: ProfileEditFormProps) {
  const { t } = useLanguage();
  const { isMobile } = useResponsive();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [bloodType, setBloodType] = useState(profile?.blood_type || '');
  const [rhFactor, setRhFactor] = useState(profile?.rh_factor || '');
  const [antibodies, setAntibodies] = useState<string[]>(profile?.antibodies || []);
  const [newAntibody, setNewAntibody] = useState('');
  const [knownReactions, setKnownReactions] = useState(profile?.known_reactions || '');
  const [medications, setMedications] = useState(profile?.medications || '');
  const [intervalDays, setIntervalDays] = useState<number>(
    profile?.recommended_visit_interval_days ?? 28
  );

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

  const handleSubmit = () => {
    onSubmit({
      full_name: fullName.trim(),
      blood_type: bloodType as Profile['blood_type'],
      rh_factor: rhFactor as Profile['rh_factor'],
      antibodies,
      known_reactions: knownReactions.trim(),
      medications: medications.trim(),
      recommended_visit_interval_days: intervalDays,
    });
  };

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
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={String(intervalDays)}
        onChangeText={(s) => {
          const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
          setIntervalDays(Number.isFinite(n) ? Math.min(180, Math.max(7, n)) : 28);
        }}
        placeholder="28"
        placeholderTextColor={COLORS.textLight}
      />
      <Text style={styles.hint}>{t('profileSetup.visitIntervalHint')}</Text>

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
});
