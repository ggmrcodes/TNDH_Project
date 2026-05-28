import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Switch,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useHospitals } from '../../hooks/useHospitals';
import { TranslationKey } from '../../i18n';
import * as mockServices from '../../mock/services';
import * as realTransfusionService from '../../services/transfusionService';
import * as realPreLabsService from '../../services/preTransfusionLabsService';
import type { PreTransfusionLabs } from '../../types/database';
import {
  extractTransfusionFromImage,
  ExtractedTransfusion,
  MissingApiKeyError,
  ExtractionError,
} from '../../services/aiExtraction';
import Disclaimer from '../../components/common/Disclaimer';
import Button from '../../components/common/Button';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../config/theme';

type Phase = 'capture' | 'processing' | 'review' | 'error';

interface FormState {
  date: string;
  hospital: string;
  units: string;
  preHb: string;
  postHb: string;
  hct: string;
  ferritin: string;
  reactionNoted: boolean;
  reactionDetail: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  date: '',
  hospital: '',
  units: '',
  preHb: '',
  postHb: '',
  hct: '',
  ferritin: '',
  reactionNoted: false,
  reactionDetail: '',
  notes: '',
};

export default function ScanTransfusionScreen() {
  const navigation = useNavigation<any>();
  const { user, profile, isMockMode } = useAuth();
  const { t } = useLanguage();
  const { hospitals } = useHospitals();

  const [phase, setPhase] = useState<Phase>('capture');
  const [imageUri, setImageUri] = useState<string | null>(null);
  // Kept around after AI extraction so we can persist the same scanned
  // image to the transfusion record once it's created. Null in the
  // manual-entry path (no scan performed) — the patient can attach a
  // photo later from the detail screen.
  const [scannedBase64, setScannedBase64] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  // Prefill hospital from the patient's profile.hospital_id (one-shot
  // after both profile + hospital directory load). Scan-extracted hospital
  // overrides this; AI extraction runs separately and writes via setForm.
  const hospitalPrefilled = useRef(false);
  useEffect(() => {
    if (hospitalPrefilled.current) return;
    if (!profile || hospitals.length === 0 || !profile.hospital_id) return;
    const myHospital = hospitals.find(h => h.id === profile.hospital_id);
    if (!myHospital) return;
    hospitalPrefilled.current = true;
    setForm(prev => (prev.hospital ? prev : { ...prev, hospital: myHospital.name_th || myHospital.name_en || '' }));
  }, [profile, hospitals]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [aiFields, setAiFields] = useState<Set<keyof FormState>>(new Set());
  const [confidence, setConfidence] = useState<ExtractedTransfusion['confidence']>('medium');
  const [unreadableReason, setUnreadableReason] = useState('');
  const [saving, setSaving] = useState(false);

  const pickAndExtract = async (source: 'camera' | 'library') => {
    setErrorMsg('');

    // Permissions (native only)
    if (Platform.OS !== 'web') {
      if (source === 'camera') {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) {
          setErrorMsg('Camera permission denied.');
          setPhase('error');
          return;
        }
      } else {
        const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!p.granted) {
          setErrorMsg('Photo library permission denied.');
          setPhase('error');
          return;
        }
      }
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.9, base64: true })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.9,
            base64: true,
          });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);
    setPhase('processing');

    try {
      // Resize if longest edge > 1568
      let base64 = asset.base64 ?? null;
      const longest = Math.max(asset.width ?? 0, asset.height ?? 0);
      if (longest > 1568) {
        const resized = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: longest === (asset.width ?? 0) ? { width: 1568 } : { height: 1568 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        base64 = resized.base64 ?? base64;
      }
      if (!base64) throw new ExtractionError('Could not read the picked image.');

      // Stash the (possibly-resized) base64 so handleSave() can upload it
      // to the transfusion-documents bucket once the row is created.
      setScannedBase64(base64);

      const extracted = await extractTransfusionFromImage(base64, 'image/jpeg');
      applyExtraction(extracted);
      setPhase('review');
    } catch (e: any) {
      console.error('extract error', e);
      if (e instanceof MissingApiKeyError) {
        setErrorMsg(e.message);
      } else if (e instanceof ExtractionError) {
        setErrorMsg(e.message);
      } else {
        setErrorMsg('Unexpected error — please try again.');
      }
      setPhase('error');
    }
  };

  const applyExtraction = (x: ExtractedTransfusion) => {
    const ai = new Set<keyof FormState>();
    const next: FormState = { ...EMPTY_FORM };
    if (x.date_iso) { next.date = x.date_iso.slice(0, 10); ai.add('date'); }
    if (x.hospital) { next.hospital = x.hospital; ai.add('hospital'); }
    if (x.units_received != null) { next.units = String(x.units_received); ai.add('units'); }
    if (x.pre_hb_g_dl != null) { next.preHb = String(x.pre_hb_g_dl); ai.add('preHb'); }
    if (x.post_hb_g_dl != null) { next.postHb = String(x.post_hb_g_dl); ai.add('postHb'); }
    if (x.reaction_noted != null) { next.reactionNoted = x.reaction_noted; ai.add('reactionNoted'); }
    if (x.reaction_detail) { next.reactionDetail = x.reaction_detail; ai.add('reactionDetail'); }
    if (x.notes) { next.notes = x.notes; ai.add('notes'); }
    setForm(next);
    setAiFields(ai);
    setConfidence(x.confidence);
    setUnreadableReason(x.unreadable_reason);
  };

  const save = async () => {
    if (!user) return;
    // Units (blood bags received) is optional; left blank it saves as the
    // schema default (1). Only date + hospital are required.
    if (!form.date || !form.hospital) {
      setErrorMsg(t('scan.error.required'));
      return;
    }
    setSaving(true);
    try {
      // Optional: blank → null (unknown), not a guessed default.
      const unitsNum = Number(form.units);
      const units = form.units.trim() !== '' && isFinite(unitsNum) ? unitsNum : null;
      const preHb = form.preHb ? Number(form.preHb) : undefined;
      const postHb = form.postHb ? Number(form.postHb) : undefined;
      const hctNum = form.hct ? Number(form.hct) : undefined;
      const ferritinNum = form.ferritin ? Number(form.ferritin) : undefined;
      const data = {
        date: /^\d{4}-\d{2}-\d{2}$/.test(form.date)
          ? `${form.date}T00:00:00+07:00`
          : form.date,
        hospital: form.hospital,
        units_received: units,
        reaction_noted: form.reactionNoted,
        reaction_detail: form.reactionDetail,
        notes: form.notes,
        ...(preHb != null && isFinite(preHb) ? { pre_hb_g_dl: preHb } : {}),
        ...(postHb != null && isFinite(postHb) ? { post_hb_g_dl: postHb } : {}),
      };
      const newTx = isMockMode
        ? await mockServices.createTransfusion(user.id, data)
        : await realTransfusionService.createTransfusion(user.id, data);

      // Persist the scanned document photo (if any). Non-fatal — the
      // transfusion record itself already saved; the patient can attach
      // a photo later from the detail screen.
      if (scannedBase64) {
        try {
          const svc = isMockMode ? mockServices : realTransfusionService;
          const stored = await svc.uploadTransfusionDocumentPhoto(user.id, newTx.id, scannedBase64);
          await svc.setTransfusionDocumentPhotoUrl(newTx.id, stored);
        } catch (photoErr) {
          console.error('save transfusion photo error', photoErr);
        }
      }

      // Persist pre-transfusion labs (Hb / Hct / Ferritin) into the new
      // pre_labs JSONB column whenever any of those fields was entered.
      // Pre-Hb mirrors into pre_labs.hb so trends pick it up. Failure here
      // is non-fatal — the transfusion record already saved; the patient
      // can edit labs later via the detail view.
      const hbForLabs = preHb != null && isFinite(preHb) ? preHb : null;
      const hctForLabs = hctNum != null && isFinite(hctNum) ? hctNum : null;
      const ferritinForLabs = ferritinNum != null && isFinite(ferritinNum) ? ferritinNum : null;
      if (hbForLabs != null || hctForLabs != null || ferritinForLabs != null) {
        const labs: PreTransfusionLabs = {
          hb: hbForLabs,
          hct: hctForLabs,
          ferritin: ferritinForLabs,
          recorded_at: new Date().toISOString(),
          recorded_by_user_id: user.id,
          verified_by_clinician_id: null,
          lab_slip_photo_url: null,
          source: 'manual',
        };
        try {
          if (isMockMode) {
            await mockServices.savePreLabsForTransfusion(newTx.id, user.id, labs);
          } else {
            await realPreLabsService.savePreLabs(newTx.id, user.id, user.id, labs);
          }
        } catch (labErr) {
          console.error('save pre-labs error', labErr);
          // Continue — main record is saved; surface a soft notice.
        }
      }

      navigation.goBack();
    } catch (e) {
      console.error('save transfusion error', e);
      setErrorMsg('Could not save the record — try again.');
    }
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {phase === 'capture' && (
          <CaptureStep
            onPick={pickAndExtract}
            onEnterManually={() => {
              setForm(EMPTY_FORM);
              setAiFields(new Set());
              setConfidence('medium');
              setUnreadableReason('');
              setImageUri(null);
              setErrorMsg('');
              setPhase('review');
            }}
            t={t}
          />
        )}

        {phase === 'processing' && (
          <ProcessingStep imageUri={imageUri} t={t} />
        )}

        {phase === 'error' && (
          <ErrorStep message={errorMsg} onRetry={() => setPhase('capture')} t={t} />
        )}

        {phase === 'review' && (
          <ReviewStep
            form={form}
            setForm={setForm}
            aiFields={aiFields}
            confidence={confidence}
            unreadableReason={unreadableReason}
            imageUri={imageUri}
            saving={saving}
            onSave={save}
            onRetry={() => {
              setPhase('capture');
              setForm(EMPTY_FORM);
              setAiFields(new Set());
            }}
            errorMsg={errorMsg}
            t={t}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CaptureStep({
  onPick,
  onEnterManually,
  t,
}: {
  onPick: (s: 'camera' | 'library') => void;
  onEnterManually: () => void;
  t: (k: TranslationKey) => string;
}) {
  return (
    <View style={styles.captureWrap}>
      <View style={styles.heroIconWrap}>
        <Feather name="camera" size={28} color={COLORS.primary} />
      </View>
      <Text style={styles.stepTitle}>{t('scan.title')}</Text>
      <Text style={styles.stepBody}>{t('scan.disclaimer')}</Text>

      {Platform.OS !== 'web' && (
        <Button label={t('scan.pickPhoto')} onPress={() => onPick('camera')} style={{ marginTop: SPACING.lg }} />
      )}
      <Button
        label={t('scan.pickLibrary')}
        onPress={() => onPick('library')}
        variant={Platform.OS === 'web' ? 'primary' : 'outline'}
        style={{ marginTop: SPACING.sm }}
      />

      <View style={styles.manualDivider}>
        <View style={styles.manualDividerLine} />
        <Text style={styles.manualDividerText}>{t('common.or' as TranslationKey)}</Text>
        <View style={styles.manualDividerLine} />
      </View>

      <Button
        label={t('scan.enterManually')}
        onPress={onEnterManually}
        variant="outline"
      />
      <Text style={styles.manualHint}>{t('scan.enterManuallyHint')}</Text>
    </View>
  );
}

function ProcessingStep({
  imageUri,
  t,
}: {
  imageUri: string | null;
  t: (k: TranslationKey) => string;
}) {
  return (
    <View style={styles.processWrap}>
      {imageUri && (
        <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
      )}
      <View style={styles.processRow}>
        <ActivityIndicator size="small" color={COLORS.primary} />
        <Text style={styles.processText}>{t('scan.reading')}</Text>
      </View>
    </View>
  );
}

function ErrorStep({
  message,
  onRetry,
  t,
}: {
  message: string;
  onRetry: () => void;
  t: (k: TranslationKey) => string;
}) {
  return (
    <View style={styles.errorWrap}>
      <Feather name="alert-circle" size={24} color={COLORS.statusUrgent} />
      <Text style={styles.errorText}>{message || t('scan.error.network')}</Text>
      <Button label={t('scan.retry')} onPress={onRetry} style={{ marginTop: SPACING.md }} />
    </View>
  );
}

function ReviewStep(props: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  aiFields: Set<keyof FormState>;
  confidence: ExtractedTransfusion['confidence'];
  unreadableReason: string;
  imageUri: string | null;
  saving: boolean;
  onSave: () => void;
  onRetry: () => void;
  errorMsg: string;
  t: (k: TranslationKey) => string;
}) {
  const { form, setForm, aiFields, confidence, unreadableReason, imageUri, saving, onSave, onRetry, errorMsg, t } = props;
  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const confidenceMeta =
    confidence === 'high'
      ? { color: COLORS.statusNormal, bg: COLORS.statusNormalBg, label: t('scan.confidence.high') }
      : confidence === 'low'
      ? { color: COLORS.statusUrgent, bg: COLORS.statusUrgentBg, label: t('scan.confidence.low') }
      : { color: COLORS.statusMonitor, bg: COLORS.statusMonitorBg, label: t('scan.confidence.medium') };

  return (
    <View style={{ gap: SPACING.md }}>
      <View style={styles.reviewHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.stepTitle}>{t('scan.reviewTitle')}</Text>
          <View style={[styles.confidencePill, { backgroundColor: confidenceMeta.bg }]}>
            <Feather name="zap" size={11} color={confidenceMeta.color} />
            <Text style={[styles.confidenceText, { color: confidenceMeta.color }]}>{confidenceMeta.label}</Text>
          </View>
        </View>
        {imageUri && (
          <Image source={{ uri: imageUri }} style={styles.thumb} resizeMode="cover" />
        )}
      </View>

      {confidence === 'low' && unreadableReason ? (
        <View style={styles.warnBanner}>
          <Feather name="alert-circle" size={14} color={COLORS.statusUrgent} />
          <Text style={styles.warnText}>{unreadableReason}</Text>
        </View>
      ) : null}

      <Disclaimer message={t('scan.disclaimer')} />

      <Field
        label={t('scan.field.date')}
        value={form.date}
        onChange={(v) => update('date', v)}
        ai={aiFields.has('date')}
        placeholder="2026-04-24"
        t={t}
      />
      <Field
        label={t('history.hospital')}
        value={form.hospital}
        onChange={(v) => update('hospital', v)}
        ai={aiFields.has('hospital')}
        placeholder=""
        t={t}
      />
      <Field
        label={t('scan.field.units')}
        value={form.units}
        onChange={(v) => update('units', v)}
        ai={aiFields.has('units')}
        placeholder="2"
        keyboardType="numeric"
        t={t}
      />
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Field
            label={t('scan.field.preHb')}
            value={form.preHb}
            onChange={(v) => update('preHb', v)}
            ai={aiFields.has('preHb')}
            placeholder="7.0"
            keyboardType="numeric"
            t={t}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label={t('scan.field.postHb')}
            value={form.postHb}
            onChange={(v) => update('postHb', v)}
            ai={aiFields.has('postHb')}
            placeholder="10.0"
            keyboardType="numeric"
            t={t}
          />
        </View>
      </View>
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <Field
            label={t('preLabs.hct')}
            value={form.hct}
            onChange={(v) => update('hct', v)}
            placeholder="30"
            keyboardType="numeric"
            t={t}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label={t('preLabs.ferritin')}
            value={form.ferritin}
            onChange={(v) => update('ferritin', v)}
            placeholder="500"
            keyboardType="numeric"
            t={t}
          />
        </View>
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.fieldLabel}>{t('history.reactionYes')}</Text>
          {aiFields.has('reactionNoted') && (
            <Text style={styles.aiHint}>{t('scan.aiField')}</Text>
          )}
        </View>
        <Switch
          value={form.reactionNoted}
          onValueChange={(v) => update('reactionNoted', v)}
          trackColor={{ false: COLORS.borderLight, true: COLORS.primaryMuted }}
          thumbColor={form.reactionNoted ? COLORS.primary : COLORS.white}
        />
      </View>

      {form.reactionNoted && (
        <Field
          label={t('scan.field.reactionDetail')}
          value={form.reactionDetail}
          onChange={(v) => update('reactionDetail', v)}
          ai={aiFields.has('reactionDetail')}
          placeholder=""
          multiline
          t={t}
        />
      )}

      <Field
        label="Notes"
        value={form.notes}
        onChange={(v) => update('notes', v)}
        ai={aiFields.has('notes')}
        placeholder=""
        multiline
        t={t}
      />

      {errorMsg ? <Text style={styles.inlineError}>{errorMsg}</Text> : null}

      <Button label={t('scan.save')} onPress={onSave} isLoading={saving} style={{ marginTop: SPACING.sm }} />
      <Button label={t('scan.retry')} onPress={onRetry} variant="outline" />
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ai?: boolean;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  multiline?: boolean;
  t: (k: TranslationKey) => string;
}) {
  const { label, value, onChange, ai, placeholder, keyboardType, multiline, t } = props;
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {ai && <Feather name="zap" size={11} color={COLORS.primary} />}
      </View>
      <TextInput
        style={[styles.input, ai && styles.inputAi, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textLight}
        keyboardType={keyboardType || 'default'}
        multiline={!!multiline}
        numberOfLines={multiline ? 3 : 1}
      />
      {ai && <Text style={styles.aiHint}>{t('scan.aiField')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  captureWrap: { alignItems: 'center', paddingVertical: SPACING.xl, gap: SPACING.sm },
  heroIconWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  stepTitle: { ...TYPOGRAPHY.h2, color: COLORS.text, textAlign: 'center' },
  stepBody: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, textAlign: 'center', paddingHorizontal: SPACING.md },
  manualDivider: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch',
    gap: SPACING.sm, marginTop: SPACING.lg, marginBottom: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  manualDividerLine: { flex: 1, height: 1, backgroundColor: COLORS.borderLight },
  manualDividerText: { ...TYPOGRAPHY.caption, color: COLORS.textLight, fontWeight: '600' },
  manualHint: { ...TYPOGRAPHY.caption, color: COLORS.textLight, textAlign: 'center', marginTop: SPACING.xs },
  processWrap: { alignItems: 'center', gap: SPACING.lg, paddingVertical: SPACING.xl },
  previewImage: {
    width: '100%', aspectRatio: 4 / 3, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.borderLight,
  },
  processRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  processText: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  errorWrap: { alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.xl },
  errorText: { ...TYPOGRAPHY.body, color: COLORS.text, textAlign: 'center', paddingHorizontal: SPACING.md },
  reviewHeader: { flexDirection: 'row', gap: SPACING.md, alignItems: 'center' },
  thumb: { width: 56, height: 56, borderRadius: RADIUS.md, backgroundColor: COLORS.borderLight },
  confidencePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8,
    borderRadius: RADIUS.full, marginTop: 4,
  },
  confidenceText: { ...TYPOGRAPHY.caption, fontWeight: '700' },
  warnBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: COLORS.statusUrgentBg, padding: SPACING.sm + 2,
    borderRadius: RADIUS.md,
  },
  warnText: { ...TYPOGRAPHY.bodySmall, color: COLORS.statusUrgentText, flex: 1 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldLabel: { ...TYPOGRAPHY.bodySmall, fontWeight: '600', color: COLORS.textSecondary },
  aiHint: { ...TYPOGRAPHY.caption, color: COLORS.primary, fontStyle: 'italic' },
  input: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm,
    paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.md - 2,
    ...TYPOGRAPHY.body, color: COLORS.text, backgroundColor: COLORS.white,
  },
  inputAi: {
    borderColor: COLORS.primary, borderWidth: 1.5,
    backgroundColor: COLORS.primaryLight,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: SPACING.sm },
  switchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.sm, gap: SPACING.md,
  },
  inlineError: { ...TYPOGRAPHY.bodySmall, color: COLORS.statusUrgent, marginTop: 4 },
});
