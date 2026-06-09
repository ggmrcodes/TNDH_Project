import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, Alert, Image, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { RootStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import * as realTransfusionService from '../../services/transfusionService';
import * as realSymptomService from '../../services/symptomService';
import * as realPreLabsService from '../../services/preTransfusionLabsService';
import * as mockServices from '../../mock/services';
import { formatDateTime } from '../../utils/dateHelpers';
import { Transfusion, SymptomLog, PreTransfusionLabs } from '../../types/database';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import SymptomLogCard from '../../components/symptoms/SymptomLogCard';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import FullScreenImageViewer from '../../components/common/FullScreenImageViewer';
import PreTransfusionLabsForm from '../../components/transfusions/PreTransfusionLabsForm';
import PreTransfusionLabsDisplay from '../../components/transfusions/PreTransfusionLabsDisplay';
import ClinicianEditedBadge from '../../components/transfusions/ClinicianEditedBadge';
import { isEmptyLabs } from '../../utils/preTransfusionLabs';
import { useConnectedClinicians } from '../../hooks/useConnectedClinicians';
import { confirm } from '../../utils/confirm';
import { TranslationKey } from '../../i18n';
import { Ionicons, Feather } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';

type RouteProps = RouteProp<RootStackParamList, 'TransfusionDetail'>;

export default function TransfusionDetailScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isMockMode, user } = useAuth();
  const { t, language } = useLanguage();
  const { isMobile } = useResponsive();
  const [transfusion, setTransfusion] = useState<Transfusion | null>(null);
  const [logs, setLogs] = useState<SymptomLog[]>([]);
  const [editingLabs, setEditingLabs] = useState(false);
  const { connected: connectedClinicians } = useConnectedClinicians();

  // Resolve the editor's display name from the patient's active clinician
  // links; null if the clinician was unlinked after the edit.
  const clinicianEditorName: string | null = transfusion?.clinician_edited_by
    ? connectedClinicians.find(
        (c) => c.clinicianUserId === transfusion.clinician_edited_by
      )?.clinicianFullName ?? null
    : null;
  // Resolved (signed / data:) URL for the scanned-document photo. Re-fetched
  // whenever document_photo_url changes (e.g. after replace).
  const [photoDisplayUri, setPhotoDisplayUri] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);

  useEffect(() => {
    const id = route.params.transfusionId;
    if (isMockMode) {
      mockServices.getTransfusionById(id).then(setTransfusion);
      mockServices.getSymptomLogsByTransfusion(id).then(setLogs);
    } else {
      realTransfusionService.getTransfusionById(id).then(setTransfusion);
      realSymptomService.getSymptomLogsByTransfusion(id).then(setLogs);
    }
  }, [route.params.transfusionId, isMockMode]);

  // Resolve a usable image URI whenever the stored value changes. The
  // mock path returns the value as-is (it's already a data: URI); real
  // mode mints a short-lived signed URL via the storage bucket.
  useEffect(() => {
    let cancelled = false;
    const stored = transfusion?.document_photo_url ?? null;
    if (!stored) {
      setPhotoDisplayUri(null);
      return;
    }
    const svc = isMockMode ? mockServices : realTransfusionService;
    svc.getTransfusionDocumentPhotoSignedUrl(stored).then(uri => {
      if (!cancelled) setPhotoDisplayUri(uri);
    });
    return () => { cancelled = true; };
  }, [transfusion?.document_photo_url, isMockMode]);

  const pickAndUploadPhoto = async (source: 'camera' | 'library') => {
    if (!transfusion || !user?.id || photoBusy) return;
    setPhotoBusy(true);
    try {
      const permission = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          t('common.permissionRequired' as TranslationKey),
          t('common.photoPermissionBody' as TranslationKey),
        );
        return;
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.9, base64: true })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.9,
            base64: true,
          });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      // Resize large captures so the upload stays small.
      let base64 = asset.base64 ?? null;
      const longest = Math.max(asset.width ?? 0, asset.height ?? 0);
      if (longest > 1568) {
        const resized = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: longest === (asset.width ?? 0) ? { width: 1568 } : { height: 1568 } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        base64 = resized.base64 ?? base64;
      }
      if (!base64) throw new Error('no base64');

      const svc = isMockMode ? mockServices : realTransfusionService;
      // If a previous photo exists, best-effort delete from storage so we
      // don't leak files behind upsert. (Path is the same so upsert would
      // overwrite anyway; this is a safety net for non-upsert backends.)
      if (transfusion.document_photo_url) {
        await svc.deleteTransfusionDocumentPhoto(transfusion.document_photo_url).catch(() => {});
      }
      const stored = await svc.uploadTransfusionDocumentPhoto(user.id, transfusion.id, base64);
      await svc.setTransfusionDocumentPhotoUrl(transfusion.id, stored);
      setTransfusion({ ...transfusion, document_photo_url: stored });
    } catch (err: any) {
      Alert.alert(
        t('common.error' as TranslationKey),
        err?.message || t('transfusion.documentPhoto.uploadError' as TranslationKey),
      );
    } finally {
      setPhotoBusy(false);
    }
  };

  const handlePickPhoto = () => {
    if (!transfusion) return;
    Alert.alert(
      t('transfusion.documentPhoto.pickSourceTitle' as TranslationKey),
      undefined,
      [
        { text: t('common.cancel' as TranslationKey), style: 'cancel' },
        { text: t('transfusion.documentPhoto.takePhoto' as TranslationKey), onPress: () => pickAndUploadPhoto('camera') },
        { text: t('transfusion.documentPhoto.chooseFromLibrary' as TranslationKey), onPress: () => pickAndUploadPhoto('library') },
      ],
    );
  };

  const handleDeletePhoto = async () => {
    if (!transfusion?.document_photo_url || photoBusy) return;
    const ok = await confirm({
      title: t('transfusion.documentPhoto.deleteConfirmTitle' as TranslationKey),
      body: t('transfusion.documentPhoto.deleteConfirmBody' as TranslationKey),
      confirmLabel: t('transfusion.documentPhoto.deletePhoto' as TranslationKey),
      cancelLabel: t('common.cancel' as TranslationKey),
      destructive: true,
    });
    if (!ok) return;
    setPhotoBusy(true);
    try {
      const svc = isMockMode ? mockServices : realTransfusionService;
      await svc.deleteTransfusionDocumentPhoto(transfusion.document_photo_url);
      await svc.setTransfusionDocumentPhotoUrl(transfusion.id, null);
      setTransfusion({ ...transfusion, document_photo_url: null });
    } catch (err: any) {
      Alert.alert(t('common.error' as TranslationKey), err?.message || 'delete failed');
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleSubmitLabs = async (values: {
    hb: number | null;
    hct: number | null;
    ferritin: number | null;
    lab_slip_photo_url: string | null;
  }) => {
    if (!transfusion) return;
    const actorId = user?.id ?? transfusion.user_id;
    const payload: PreTransfusionLabs = {
      hb: values.hb,
      hct: values.hct,
      ferritin: values.ferritin,
      recorded_at: new Date().toISOString(),
      recorded_by_user_id: actorId,
      // Patient-entered values are unverified; clinician edits flip this
      // upstream in the clinician dashboard surface.
      verified_by_clinician_id: transfusion.pre_labs?.verified_by_clinician_id ?? null,
      lab_slip_photo_url: values.lab_slip_photo_url,
      source: 'manual',
    };
    try {
      if (isMockMode) {
        const updated = await mockServices.savePreLabsForTransfusion(
          transfusion.id,
          actorId,
          payload
        );
        setTransfusion(updated);
      } else {
        const updated = await realPreLabsService.savePreLabs(
          transfusion.id,
          transfusion.user_id,
          actorId,
          payload
        );
        setTransfusion(updated);
      }
      setEditingLabs(false);
    } catch (err: any) {
      Alert.alert(
        t('common.error' as TranslationKey),
        err?.message || t('preLabs.error.save' as TranslationKey)
      );
      // Re-throw so the form's saving state clears via its own catch.
      throw err;
    }
  };

  if (!transfusion) return <LoadingSpinner />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.content, !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' as const, width: '100%' as any }]}>
        {transfusion.clinician_edited_at && (
          <ClinicianEditedBadge
            editedAt={transfusion.clinician_edited_at}
            clinicianName={clinicianEditorName}
          />
        )}
        <Card style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="calendar" size={20} color={COLORS.primary} />
            <Text style={styles.value}>{formatDateTime(transfusion.date, language)}</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="business" size={20} color={COLORS.primary} />
            <Text style={styles.value}>{transfusion.hospital}</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="water" size={20} color={COLORS.primary} />
            <Text style={styles.value}>{transfusion.units_received ?? '—'} {t('history.units')}</Text>
          </View>
        </Card>

        {/* Pre-transfusion labs section — patient-side surface. */}
        <Card style={styles.card}>
          <View style={styles.labsHeader}>
            <View style={styles.labsHeaderLeft}>
              <Feather name="activity" size={18} color={COLORS.primary} />
              <Text style={styles.labsHeaderTitle}>{t('preLabs.title' as TranslationKey)}</Text>
            </View>
            {!editingLabs && (
              <TouchableOpacity onPress={() => setEditingLabs(true)} activeOpacity={0.7}>
                <Text style={styles.labsHeaderCta}>
                  {isEmptyLabs(transfusion.pre_labs)
                    ? t('preLabs.addCta' as TranslationKey)
                    : t('preLabs.editCta' as TranslationKey)}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {editingLabs ? (
            <PreTransfusionLabsForm
              initial={transfusion.pre_labs ?? null}
              onSubmit={handleSubmitLabs}
              onCancel={() => setEditingLabs(false)}
            />
          ) : (
            <PreTransfusionLabsDisplay
              labs={transfusion.pre_labs ?? null}
              photoDisplayUri={
                // In mock mode the URL is a local URI; in real mode the
                // caller (clinician dashboard) is responsible for fetching
                // a signed URL — this patient-side view skips the photo
                // unless it's already a renderable URI (mock case).
                transfusion.pre_labs?.lab_slip_photo_url?.startsWith('http') ||
                transfusion.pre_labs?.lab_slip_photo_url?.startsWith('file:') ||
                transfusion.pre_labs?.lab_slip_photo_url?.startsWith('data:')
                  ? transfusion.pre_labs.lab_slip_photo_url
                  : null
              }
            />
          )}
        </Card>

        {/* Scanned document photo — the source image from the scan flow,
            or a photo attached later via "Add photo". */}
        <Card style={styles.card}>
          <View style={styles.photoHeader}>
            <View style={styles.labsHeaderLeft}>
              <Feather name="image" size={18} color={COLORS.primary} />
              <Text style={styles.labsHeaderTitle}>
                {t('transfusion.documentPhoto.title' as TranslationKey)}
              </Text>
            </View>
          </View>
          {photoDisplayUri ? (
            <>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setPhotoViewerOpen(true)}
                accessibilityRole="imagebutton"
                accessibilityLabel={t('transfusion.documentPhoto.viewFull' as TranslationKey)}
              >
                <Image
                  source={{ uri: photoDisplayUri }}
                  style={styles.photoThumb}
                  resizeMode="cover"
                />
              </TouchableOpacity>
              <View style={styles.photoActions}>
                <TouchableOpacity
                  onPress={handlePickPhoto}
                  disabled={photoBusy}
                  style={[styles.photoActionBtn, photoBusy && styles.photoActionDisabled]}
                  accessibilityRole="button"
                >
                  <Feather name="refresh-cw" size={14} color={COLORS.primary} />
                  <Text style={styles.photoActionText}>
                    {t('transfusion.documentPhoto.replacePhoto' as TranslationKey)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleDeletePhoto}
                  disabled={photoBusy}
                  style={[styles.photoActionBtn, photoBusy && styles.photoActionDisabled]}
                  accessibilityRole="button"
                >
                  <Feather name="trash-2" size={14} color={COLORS.statusUrgent} />
                  <Text style={[styles.photoActionText, { color: COLORS.statusUrgent }]}>
                    {t('transfusion.documentPhoto.deletePhoto' as TranslationKey)}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : transfusion.document_photo_url ? (
            // Stored value present but signed URL still loading.
            <View style={styles.photoEmpty}><ActivityIndicator color={COLORS.primary} /></View>
          ) : (
            <TouchableOpacity
              onPress={handlePickPhoto}
              disabled={photoBusy}
              style={[styles.photoEmptyBtn, photoBusy && styles.photoActionDisabled]}
              accessibilityRole="button"
            >
              {photoBusy ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <>
                  <Feather name="plus" size={18} color={COLORS.primary} />
                  <Text style={styles.photoEmptyText}>
                    {t('transfusion.documentPhoto.addPhoto' as TranslationKey)}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </Card>

        {transfusion.reaction_noted && (
          <Card style={[styles.card, styles.reactionCard]}>
            <View style={styles.row}>
              <Ionicons name="alert-circle" size={20} color={COLORS.statusUrgent} />
              <Text style={styles.reactionLabel}>{t('history.reaction')}</Text>
            </View>
            <Text style={styles.reactionDetail}>{transfusion.reaction_detail}</Text>
          </Card>
        )}

        {transfusion.notes ? (
          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>{t('history.notes')}</Text>
            <Text style={styles.notesText}>{transfusion.notes}</Text>
          </Card>
        ) : null}

        {logs.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t('history.linkedLogs')}</Text>
            {logs.map(log => (
              <SymptomLogCard
                key={log.id}
                log={log}
                onPress={() => navigation.navigate('SymptomLogDetail', { logId: log.id })}
              />
            ))}
          </>
        )}

        <Button
          label={t('symptoms.logNew')}
          onPress={() => navigation.navigate('NewSymptomLog', { transfusionId: transfusion.id })}
          variant="outline"
          style={{ marginTop: SPACING.md }}
        />
      </ScrollView>
      <FullScreenImageViewer
        visible={photoViewerOpen}
        uri={photoDisplayUri}
        onClose={() => setPhotoViewerOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  card: {
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  value: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  reactionCard: {
    borderWidth: 1.5,
    borderColor: COLORS.statusUrgent,
    backgroundColor: COLORS.statusUrgentBg,
  },
  reactionLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.statusUrgent,
    fontWeight: '600',
  },
  reactionDetail: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    marginTop: SPACING.xs,
  },
  sectionLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  notesText: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  sectionTitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  labsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  labsHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  labsHeaderTitle: { ...TYPOGRAPHY.h3, color: COLORS.text },
  labsHeaderCta: { ...TYPOGRAPHY.bodySmall, color: COLORS.primary, fontWeight: '700' },
  photoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  photoThumb: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.borderLight,
  },
  photoActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  photoActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: 36,
  },
  photoActionText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.primary,
    fontWeight: '700',
  },
  photoActionDisabled: { opacity: 0.5 },
  photoEmpty: {
    aspectRatio: 4 / 3,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    minHeight: 64,
  },
  photoEmptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '700',
  },
});
