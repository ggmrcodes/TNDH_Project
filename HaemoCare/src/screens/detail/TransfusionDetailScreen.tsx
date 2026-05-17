import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
import PreTransfusionLabsForm from '../../components/transfusions/PreTransfusionLabsForm';
import PreTransfusionLabsDisplay from '../../components/transfusions/PreTransfusionLabsDisplay';
import { isEmptyLabs } from '../../utils/preTransfusionLabs';
import { TranslationKey } from '../../i18n';
import { Ionicons, Feather } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING } from '../../config/theme';

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
            <Text style={styles.value}>{transfusion.units_received} {t('history.units')}</Text>
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
});
