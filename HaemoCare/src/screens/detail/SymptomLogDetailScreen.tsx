import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import * as realSymptomService from '../../services/symptomService';
import * as mockServices from '../../mock/services';
import { confirm } from '../../utils/confirm';
import { formatDateTime } from '../../utils/dateHelpers';
import { SymptomLog } from '../../types/database';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import StatusBadge from '../../components/common/StatusBadge';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { COLORS, TYPOGRAPHY, SPACING } from '../../config/theme';
import { getSymptomLabel, URINE_COLOR_HEX, isHematuriaColor } from '../../utils/clinicalThresholds';
import { TranslationKey } from '../../i18n';

type RouteProps = RouteProp<RootStackParamList, 'SymptomLogDetail'>;

function SeverityBar({ value }: { value: number }) {
  const pct = (value / 10) * 100;
  const color = value <= 3 ? COLORS.statusNormal : value <= 6 ? COLORS.statusMonitor : COLORS.statusUrgent;
  return (
    <View style={styles.barBg}>
      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

export default function SymptomLogDetailScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isMockMode } = useAuth();
  const { t, language } = useLanguage();
  const { isMobile } = useResponsive();
  const [log, setLog] = useState<SymptomLog | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = isMockMode
      ? mockServices.getSymptomLogById(route.params.logId)
      : realSymptomService.getSymptomLogById(route.params.logId);
    fetch.then(setLog);
  }, [route.params.logId, isMockMode]);

  const handleEdit = () => {
    if (!log) return;
    navigation.navigate('NewSymptomLog', { editLogId: log.id });
  };

  const handleDelete = async () => {
    if (!log) return;
    const ok = await confirm({
      title: t('symptoms.deleteConfirmTitle'),
      body: t('symptoms.deleteConfirmBody'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setDeleting(true);
    try {
      if (isMockMode) {
        await mockServices.deleteSymptomLog(log.id);
      } else {
        await realSymptomService.deleteSymptomLog(log.id);
      }
      navigation.goBack();
    } catch (err) {
      console.error('Delete symptom log error:', err);
      setError(t('symptoms.deleteFailed'));
      setDeleting(false);
    }
  };

  if (!log) return <LoadingSpinner />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.content, !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' as const, width: '100%' as any }]}>
        <View style={styles.header}>
          <Text style={styles.date}>{formatDateTime(log.logged_at, language)}</Text>
          <StatusBadge outcome={log.outcome} large />
        </View>

        <Card style={styles.card}>
          {Object.entries(log.severity_scores).map(([key, value]) => (
            <View key={key} style={styles.symptomRow}>
              <View style={styles.symptomInfo}>
                <Text style={styles.symptomName}>{getSymptomLabel(key, t)}</Text>
                <Text style={styles.symptomScore}>{value}/10</Text>
              </View>
              <SeverityBar value={value} />
            </View>
          ))}
          {log.urine_color ? (
            <View style={styles.urineRow}>
              <View
                style={[
                  styles.urineSwatch,
                  { backgroundColor: URINE_COLOR_HEX[log.urine_color] },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.symptomName}>
                  {t('symptom.urineColor.label')}
                </Text>
                <Text
                  style={[
                    styles.symptomScore,
                    isHematuriaColor(log.urine_color) && { color: COLORS.statusUrgent },
                  ]}
                >
                  {t(`symptom.urineColor.${log.urine_color}` as TranslationKey)}
                </Text>
              </View>
            </View>
          ) : null}
        </Card>

        {log.notes ? (
          <Card style={styles.card}>
            <Text style={styles.notesLabel}>{t('symptoms.notes')}</Text>
            <Text style={styles.notesText}>{log.notes}</Text>
          </Card>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={t('common.edit')}
            onPress={handleEdit}
            variant="outline"
            disabled={deleting}
            accessibilityLabel={t('symptoms.editLog')}
          />
          <Button
            label={t('common.delete')}
            onPress={handleDelete}
            variant="danger"
            isLoading={deleting}
            style={styles.deleteButton}
            accessibilityLabel={t('symptoms.deleteConfirmTitle')}
          />
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  date: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  card: {
    marginBottom: SPACING.md,
  },
  symptomRow: {
    marginBottom: SPACING.md,
  },
  symptomInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  symptomName: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  symptomScore: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  barBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
  },
  urineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingTop: SPACING.sm,
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  urineSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  notesLabel: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  notesText: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },
  actions: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  deleteButton: {
    backgroundColor: COLORS.error,
  },
  errorText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.error,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});
