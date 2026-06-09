// Bottom-sheet modal for editing a patient's per-patient lab reference
// thresholds (Hb floor + Ferritin ceiling). Opened from the gear icon
// in LabTrendsChart's header. Clinician-only — no patient-side caller.
//
// Empty input = clear the override = use the program default from
// clinicalThresholds.ts.
//
// Validation reuses validateLabField from utils/preTransfusionLabs so
// the same per-field ranges (Hb 0.1-25, Ferritin 0-10000) and error
// messages as the lab-entry form apply here too.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import Button from '../common/Button';
import { validateLabField, type LabValidationError } from '../../utils/preTransfusionLabs';
import {
  HB_DEFAULT_FLOOR_G_DL,
  FERRITIN_DEFAULT_CEILING_NG_ML,
} from '../../utils/clinicalThresholds';

export interface ThresholdEditSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Current override values (null = using default). */
  initialHbOverride: number | null;
  initialFerritinOverride: number | null;
  /** Caller persists the values + closes the sheet on success. */
  onSave: (next: {
    hb_threshold_override: number | null;
    ferritin_threshold_override: number | null;
  }) => Promise<void>;
}

interface FieldState {
  raw: string;
  error: LabValidationError | null;
}

function toFieldRaw(value: number | null): string {
  return value == null ? '' : String(value);
}

export default function ThresholdEditSheet({
  visible,
  onClose,
  initialHbOverride,
  initialFerritinOverride,
  onSave,
}: ThresholdEditSheetProps) {
  const { t } = useLanguage();
  const [hb, setHb] = useState<FieldState>({ raw: toFieldRaw(initialHbOverride), error: null });
  const [ferritin, setFerritin] = useState<FieldState>({
    raw: toFieldRaw(initialFerritinOverride),
    error: null,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const hbResult = validateLabField('hb', hb.raw);
    const ferResult = validateLabField('ferritin', ferritin.raw);
    if (hbResult.error || ferResult.error) {
      if (hbResult.error) setHb((p) => ({ ...p, error: hbResult.error! }));
      if (ferResult.error) setFerritin((p) => ({ ...p, error: ferResult.error! }));
      return;
    }
    try {
      setSaving(true);
      await onSave({
        hb_threshold_override: hbResult.value ?? null,
        ferritin_threshold_override: ferResult.value ?? null,
      });
    } catch (err: any) {
      Alert.alert(t('common.error' as TranslationKey), err?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {t('preLabs.threshold.title' as TranslationKey)}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Feather name="x" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Hb floor field */}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>
              {t('preLabs.threshold.hbField' as TranslationKey)}
            </Text>
            <TextInput
              style={[styles.input, hb.error && styles.inputError]}
              value={hb.raw}
              onChangeText={(raw) => setHb({ raw, error: null })}
              placeholder={String(HB_DEFAULT_FLOOR_G_DL)}
              placeholderTextColor={COLORS.textLight}
              keyboardType="decimal-pad"
            />
            {hb.raw !== '' && (
              <TouchableOpacity
                onPress={() => setHb({ raw: '', error: null })}
                style={styles.useDefaultBtn}
              >
                <Text style={styles.useDefaultText}>
                  {t('preLabs.threshold.useDefault' as TranslationKey, {
                    value: String(HB_DEFAULT_FLOOR_G_DL),
                  })}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Ferritin ceiling field */}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>
              {t('preLabs.threshold.ferritinField' as TranslationKey)}
            </Text>
            <TextInput
              style={[styles.input, ferritin.error && styles.inputError]}
              value={ferritin.raw}
              onChangeText={(raw) => setFerritin({ raw, error: null })}
              placeholder={String(FERRITIN_DEFAULT_CEILING_NG_ML)}
              placeholderTextColor={COLORS.textLight}
              keyboardType="number-pad"
            />
            {ferritin.raw !== '' && (
              <TouchableOpacity
                onPress={() => setFerritin({ raw: '', error: null })}
                style={styles.useDefaultBtn}
              >
                <Text style={styles.useDefaultText}>
                  {t('preLabs.threshold.useDefault' as TranslationKey, {
                    value: String(FERRITIN_DEFAULT_CEILING_NG_ML),
                  })}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.actions}>
            <Button
              label={t('preLabs.cancel' as TranslationKey)}
              onPress={onClose}
              variant="outline"
              fullWidth={false}
              style={styles.actionBtn}
            />
            <Button
              label={t('preLabs.save' as TranslationKey)}
              onPress={handleSave}
              fullWidth={false}
              style={styles.actionBtn}
              isLoading={saving}
            />
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { ...TYPOGRAPHY.h3, color: COLORS.text },
  fieldBlock: { gap: SPACING.xs },
  fieldLabel: { ...TYPOGRAPHY.label, color: COLORS.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  inputError: { borderColor: COLORS.statusUrgent },
  useDefaultBtn: { alignSelf: 'flex-start', paddingVertical: 2 },
  useDefaultText: { ...TYPOGRAPHY.caption, color: COLORS.primary, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  actionBtn: { flexGrow: 0 },
});
