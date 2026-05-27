// Pre-transfusion lab entry form.
//
// Three numeric inputs (Hb / Hct / Ferritin) with unit suffix labels,
// per-field validation, and an optional "attach lab slip photo" button.
// Validation rules live in utils/preTransfusionLabs.ts so the service
// layer can re-check defensively.
//
// In mock mode (or when `onUploadPhoto` is not provided) the photo
// helper stores a local URI directly; in real mode the caller wires
// `onUploadPhoto` to the storage service which compresses to ≤1200px
// wide / ≤80% quality before upload.

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import Button from '../common/Button';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';
import {
  validateLabField,
  validateLabs,
  type LabField,
  type LabValidationError,
} from '../../utils/preTransfusionLabs';
import type { PreTransfusionLabs } from '../../types/database';

export interface PreTransfusionLabsFormProps {
  initial?: PreTransfusionLabs | null;
  /** Persist labs. Caller composes the full payload (recorded_by_user_id,
   * etc.) from `actorUserId` and `valuesAndPhotoUrl`. */
  onSubmit: (values: {
    hb: number | null;
    hct: number | null;
    ferritin: number | null;
    lab_slip_photo_url: string | null;
  }) => Promise<void>;
  /** Optional photo-upload handler. Receives the compressed JPEG bytes
   * (ArrayBuffer); should return the storage path / URL to persist.
   * If omitted, the form uses the local URI directly (mock mode). */
  onUploadPhoto?: (jpegData: ArrayBuffer, localUri: string) => Promise<string>;
  onCancel?: () => void;
  /** When the form opens for a clinician overwriting a patient value, the
   * caller should set this so the prompt explains the audit-log behavior. */
  showClinicianEditNotice?: boolean;
}

interface FieldState {
  raw: string;
  error: LabValidationError | null;
}

const blankField: FieldState = { raw: '', error: null };

function toFieldState(value: number | null | undefined): FieldState {
  return { raw: value == null ? '' : String(value), error: null };
}

export default function PreTransfusionLabsForm({
  initial,
  onSubmit,
  onUploadPhoto,
  onCancel,
  showClinicianEditNotice,
}: PreTransfusionLabsFormProps) {
  const { t } = useLanguage();

  const [hb, setHb] = useState<FieldState>(() => toFieldState(initial?.hb));
  const [hct, setHct] = useState<FieldState>(() => toFieldState(initial?.hct));
  const [ferritin, setFerritin] = useState<FieldState>(() => toFieldState(initial?.ferritin));
  const [photoUri, setPhotoUri] = useState<string | null>(initial?.lab_slip_photo_url ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fieldLabel = (field: LabField): string => {
    switch (field) {
      case 'hb': return t('preLabs.hb' as TranslationKey);
      case 'hct': return t('preLabs.hct' as TranslationKey);
      case 'ferritin': return t('preLabs.ferritin' as TranslationKey);
    }
  };

  const formatError = (err: LabValidationError | null): string | null => {
    if (!err) return null;
    const label = fieldLabel(err.field);
    const keyByCode = {
      too_high: 'preLabs.error.tooHigh' as TranslationKey,
      too_low: 'preLabs.error.tooLow' as TranslationKey,
      not_a_number: 'preLabs.error.notANumber' as TranslationKey,
    };
    return t(keyByCode[err.code])
      .replace('{field}', label)
      .replace('{min}', String(err.min))
      .replace('{max}', String(err.max));
  };

  const handleFieldChange = (field: LabField) => (raw: string) => {
    const result = validateLabField(field, raw);
    const next: FieldState = result.error
      ? { raw, error: result.error }
      : { raw, error: null };
    if (field === 'hb') setHb(next);
    if (field === 'hct') setHct(next);
    if (field === 'ferritin') setFerritin(next);
  };

  const pickAndAttachPhoto = async () => {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('common.error' as TranslationKey), 'Photo library permission denied.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    try {
      setUploadingPhoto(true);
      // Compress to ≤1200px wide / ≤80% quality per brief open-question
      // resolution. Only resize when the asset is wider than 1200px.
      const needResize = (asset.width ?? 0) > 1200;
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        needResize ? [{ resize: { width: 1200 } }] : [],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      if (onUploadPhoto) {
        // Real mode: upload the bytes as an ArrayBuffer. fetch(uri).blob()
        // uploads 0 bytes on React Native, so decode the base64 directly.
        if (!manipulated.base64) throw new Error('Could not read image data');
        const storedRef = await onUploadPhoto(decodeBase64(manipulated.base64), manipulated.uri);
        setPhotoUri(storedRef);
      } else {
        // Mock mode: just keep the local URI.
        setPhotoUri(manipulated.uri);
      }
    } catch (err: any) {
      console.error('lab slip photo upload failed', err);
      Alert.alert(
        t('common.error' as TranslationKey),
        t('preLabs.error.upload' as TranslationKey)
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = () => setPhotoUri(null);

  const allErrors = useMemo<LabValidationError[]>(() => {
    const fieldErrors: LabValidationError[] = [];
    if (hb.error) fieldErrors.push(hb.error);
    if (hct.error) fieldErrors.push(hct.error);
    if (ferritin.error) fieldErrors.push(ferritin.error);
    return fieldErrors;
  }, [hb.error, hct.error, ferritin.error]);

  const canSubmit = allErrors.length === 0 && !saving && !uploadingPhoto;

  const handleSubmit = async () => {
    setSaveError(null);
    // Re-validate from raw strings; covers the case where a user typed
    // a value then deleted it (state would say "no error" but value is
    // null) — handled correctly — and covers defensive double-check.
    const hbR = validateLabField('hb', hb.raw);
    const hctR = validateLabField('hct', hct.raw);
    const ferR = validateLabField('ferritin', ferritin.raw);
    if (hbR.error || hctR.error || ferR.error) {
      if (hbR.error) setHb(prev => ({ ...prev, error: hbR.error! }));
      if (hctR.error) setHct(prev => ({ ...prev, error: hctR.error! }));
      if (ferR.error) setFerritin(prev => ({ ...prev, error: ferR.error! }));
      return;
    }

    const payload = {
      hb: hbR.value ?? null,
      hct: hctR.value ?? null,
      ferritin: ferR.value ?? null,
      lab_slip_photo_url: photoUri,
    };
    // Defensive: never let bad numbers slip past the form even if the
    // per-field parsers reported clean (e.g. future code path bypass).
    const xErrors = validateLabs(payload);
    if (xErrors.length > 0) {
      setSaveError(formatError(xErrors[0]));
      return;
    }

    try {
      setSaving(true);
      await onSubmit(payload);
    } catch (err: any) {
      setSaveError(err?.message || t('preLabs.error.save' as TranslationKey));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('preLabs.title' as TranslationKey)}</Text>
        <Text style={styles.subtitle}>{t('preLabs.optional' as TranslationKey)}</Text>
      </View>

      {showClinicianEditNotice && (
        <View style={styles.notice}>
          <Feather name="info" size={14} color={COLORS.primary} />
          <Text style={styles.noticeText}>{t('preLabs.clinicianEditPrompt' as TranslationKey)}</Text>
        </View>
      )}

      <LabFieldRow
        label={t('preLabs.hb' as TranslationKey)}
        unit="g/dL"
        value={hb.raw}
        onChangeText={handleFieldChange('hb')}
        errorMessage={formatError(hb.error)}
        testID="preLabs.hb.input"
      />
      <LabFieldRow
        label={t('preLabs.hct' as TranslationKey)}
        unit="%"
        value={hct.raw}
        onChangeText={handleFieldChange('hct')}
        errorMessage={formatError(hct.error)}
        testID="preLabs.hct.input"
      />
      <LabFieldRow
        label={t('preLabs.ferritin' as TranslationKey)}
        unit="ng/mL"
        value={ferritin.raw}
        onChangeText={handleFieldChange('ferritin')}
        errorMessage={formatError(ferritin.error)}
        testID="preLabs.ferritin.input"
      />

      <View style={styles.photoRow}>
        <Feather name="paperclip" size={16} color={COLORS.primary} />
        {photoUri ? (
          <>
            <Text style={styles.photoAttached}>{t('preLabs.photoAttached' as TranslationKey)}</Text>
            <TouchableOpacity onPress={pickAndAttachPhoto} disabled={uploadingPhoto}>
              <Text style={styles.photoLink}>{t('preLabs.retakePhoto' as TranslationKey)}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={removePhoto} disabled={uploadingPhoto}>
              <Text style={[styles.photoLink, styles.photoLinkDestructive]}>
                {t('preLabs.removePhoto' as TranslationKey)}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity onPress={pickAndAttachPhoto} disabled={uploadingPhoto}>
            <Text style={styles.photoLink}>{t('preLabs.attachPhoto' as TranslationKey)}</Text>
          </TouchableOpacity>
        )}
        {uploadingPhoto && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.uploadingText}>{t('preLabs.photoUploading' as TranslationKey)}</Text>
          </View>
        )}
      </View>

      {saveError && (
        <View style={styles.errorBanner}>
          <Feather name="alert-circle" size={14} color={COLORS.statusUrgent} />
          <Text style={styles.errorBannerText}>{saveError}</Text>
        </View>
      )}

      <View style={styles.actions}>
        {onCancel && (
          <Button
            label={t('preLabs.cancel' as TranslationKey)}
            onPress={onCancel}
            variant="outline"
            fullWidth={false}
            style={styles.actionBtn}
          />
        )}
        <Button
          label={t('preLabs.save' as TranslationKey)}
          onPress={handleSubmit}
          isLoading={saving}
          disabled={!canSubmit}
          fullWidth={false}
          style={styles.actionBtn}
        />
      </View>
    </View>
  );
}

interface LabFieldRowProps {
  label: string;
  unit: string;
  value: string;
  onChangeText: (s: string) => void;
  errorMessage: string | null;
  testID?: string;
}

function LabFieldRow({ label, unit, value, onChangeText, errorMessage, testID }: LabFieldRowProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputRow, errorMessage && styles.inputRowError]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="—"
          placeholderTextColor={COLORS.textLight}
          style={styles.input}
          testID={testID}
        />
        <Text style={styles.unit}>{unit}</Text>
      </View>
      {errorMessage && <Text style={styles.fieldError}>{errorMessage}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.sm },
  header: { gap: 2, marginBottom: SPACING.xs },
  title: { ...TYPOGRAPHY.h3, color: COLORS.text },
  subtitle: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.primaryMuted,
  },
  noticeText: { ...TYPOGRAPHY.bodySmall, color: COLORS.text, flex: 1 },
  field: { gap: 4 },
  fieldLabel: { ...TYPOGRAPHY.label, color: COLORS.textSecondary },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  inputRowError: { borderColor: COLORS.statusUrgent },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? SPACING.sm : SPACING.xs,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  unit: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, marginLeft: SPACING.xs },
  fieldError: { ...TYPOGRAPHY.caption, color: COLORS.statusUrgent, fontWeight: '600' },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  photoAttached: { ...TYPOGRAPHY.bodySmall, color: COLORS.text, fontWeight: '600' },
  photoLink: { ...TYPOGRAPHY.bodySmall, color: COLORS.primary, fontWeight: '600' },
  photoLinkDestructive: { color: COLORS.statusUrgent },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  uploadingText: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.statusUrgentBg,
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
  },
  errorBannerText: { ...TYPOGRAPHY.bodySmall, color: COLORS.statusUrgentText, flex: 1 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  actionBtn: { paddingHorizontal: SPACING.lg },
});
