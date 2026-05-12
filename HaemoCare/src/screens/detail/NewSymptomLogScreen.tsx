import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, SafeAreaView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import { evaluateSymptoms, ThresholdResult } from '../../utils/clinicalThresholds';
import { triageSymptoms, TriageResult } from '../../analytics';
import * as realSymptomService from '../../services/symptomService';
import * as realTransfusionService from '../../services/transfusionService';
import * as mockServices from '../../mock/services';
import { Outcome, SymptomLog, Transfusion } from '../../types/database';
import SymptomChecklist from '../../components/symptoms/SymptomChecklist';
import SeveritySlider from '../../components/common/SeveritySlider';
import OutcomeDisplay from '../../components/symptoms/OutcomeDisplay';
import Button from '../../components/common/Button';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';
import { TranslationKey } from '../../i18n';
import { useOverdueState } from '../../hooks/useOverdueState';
import { applyBump } from '../../utils/overdueVisit';

type RouteProps = RouteProp<RootStackParamList, 'NewSymptomLog'>;

type Step = 'select' | 'severity' | 'result';

export default function NewSymptomLogScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProps>();
  const { user, isMockMode } = useAuth();
  const { t } = useLanguage();

  const { isMobile } = useResponsive();
  const transfusionId = route.params?.transfusionId;

  const { overdueState } = useOverdueState();
  // Remembers the raw AI-suggested outcome before any overdue bump is applied.
  // Set once in handleSubmit; never reset by user interaction so the bump
  // explanation always shows the original suggestion as the "from" value.
  const aiSuggestedOutcomeRef = useRef<Outcome | null>(null);

  const [step, setStep] = useState<Step>('select');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [severityScores, setSeverityScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<ThresholdResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [latestTx, setLatestTx] = useState<Transfusion | null>(null);
  const [recentLogs, setRecentLogs] = useState<SymptomLog[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [tx, logs] = isMockMode
        ? await Promise.all([
            mockServices.getLatestTransfusion(),
            mockServices.getSymptomLogs(user.id, 20),
          ])
        : await Promise.all([
            realTransfusionService.getLatestTransfusion(user.id),
            realSymptomService.getSymptomLogs(user.id, 20),
          ]);
      if (!cancelled) {
        setLatestTx(tx);
        setRecentLogs(logs);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isMockMode]);

  const triage: TriageResult | null = useMemo(() => {
    if (step !== 'severity' || Object.keys(severityScores).length === 0) return null;
    return triageSymptoms(severityScores, {
      loggedAt: new Date().toISOString(),
      recentLogs,
      recentTransfusion: latestTx,
    });
  }, [severityScores, step, recentLogs, latestTx]);

  const handleToggle = (key: string) => {
    setSelectedSymptoms(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const handleSeverityChange = (key: string, value: number) => {
    setSeverityScores(prev => ({ ...prev, [key]: value }));
  };

  const initSeverity = () => {
    const initial: Record<string, number> = {};
    selectedSymptoms.forEach(k => { initial[k] = severityScores[k] || 3; });
    setSeverityScores(initial);
    setStep('severity');
  };

  const handleSubmit = async () => {
    const evaluation = evaluateSymptoms(severityScores);

    // Record the AI-suggested outcome before any overdue bump.
    // This is the stable "from" value used in the bump explanation copy.
    const aiSuggested = evaluation.outcome;
    aiSuggestedOutcomeRef.current = aiSuggested;

    // Apply overdue bump to the saved outcome and the displayed result.
    const bumpTiers = overdueState?.isOverdue ? overdueState.bumpTiers : 0;
    const bumpedOutcome = applyBump(aiSuggested, bumpTiers);
    const bumpedEvaluation: ThresholdResult = { ...evaluation, outcome: bumpedOutcome };

    setResult(bumpedEvaluation);

    if (!user) return;
    setSaving(true);
    try {
      const logData = {
        transfusion_id: transfusionId || null,
        symptoms: selectedSymptoms,
        severity_scores: severityScores,
        outcome: bumpedOutcome,
        notes,
      };
      if (isMockMode) {
        await mockServices.createSymptomLog(user.id, logData);
      } else {
        await realSymptomService.createSymptomLog(user.id, logData);
      }
    } catch (err) {
      console.error('Save symptom log error:', err);
    }
    setSaving(false);
    setStep('result');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={[styles.content, !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' as const, width: '100%' as any }]}>
        {step === 'select' && (
          <>
            <Text style={styles.stepTitle}>{t('symptoms.selectSymptoms')}</Text>
            <SymptomChecklist selected={selectedSymptoms} onToggle={handleToggle} />
            <Button
              label={t('common.next')}
              onPress={initSeverity}
              disabled={selectedSymptoms.length === 0}
              style={{ marginTop: SPACING.lg }}
            />
          </>
        )}

        {step === 'severity' && (
          <>
            <Text style={styles.stepTitle}>{t('symptoms.setSeverity')}</Text>
            {selectedSymptoms.map(key => (
              <SeveritySlider
                key={key}
                label={t(`symptom.${key}` as TranslationKey)}
                value={severityScores[key] || 3}
                onChange={(val) => handleSeverityChange(key, val)}
              />
            ))}

            <Text style={styles.notesLabel}>{t('symptoms.notes')}</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              placeholder={t('symptoms.notes')}
              placeholderTextColor={COLORS.textLight}
            />

            {triage && (
              <TriageBanner triage={triage} t={t} />
            )}

            <Button
              label={t('symptoms.submit')}
              onPress={handleSubmit}
              isLoading={saving}
              style={{ marginTop: SPACING.lg }}
            />
            <Button
              label={t('common.back')}
              onPress={() => setStep('select')}
              variant="outline"
              style={{ marginTop: SPACING.sm }}
            />
          </>
        )}

        {step === 'result' && result && (
          <>
            <Text style={styles.stepTitle}>{t('symptoms.result')}</Text>
            {overdueState?.isOverdue &&
              aiSuggestedOutcomeRef.current !== null &&
              applyBump(aiSuggestedOutcomeRef.current, overdueState.bumpTiers) !== aiSuggestedOutcomeRef.current && (
                <View style={styles.bumpNote}>
                  <Feather name="alert-triangle" size={16} color={COLORS.statusUrgent as string} />
                  <Text style={styles.bumpNoteText}>
                    {t('overdue.bumpExplanation' as TranslationKey, {
                      days: overdueState.daysOverdue,
                      from: t(`status.${aiSuggestedOutcomeRef.current}` as TranslationKey),
                      to: t(`status.${applyBump(aiSuggestedOutcomeRef.current, overdueState.bumpTiers)}` as TranslationKey),
                    })}
                  </Text>
                </View>
              )}
            <OutcomeDisplay result={result} />
            <Button
              label={t('common.done')}
              onPress={() => navigation.goBack()}
              style={{ marginTop: SPACING.lg }}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TriageBanner({ triage, t }: { triage: TriageResult; t: (k: TranslationKey) => string }) {
  const { tier, observations } = triage;
  const palette =
    tier === 'seek_urgent_care'
      ? { bg: COLORS.statusUrgentBg, fg: COLORS.statusUrgentText, icon: COLORS.statusUrgent, label: t('triage.tier.urgent'), iconName: 'alert-triangle' as const }
      : tier === 'contact_clinic'
      ? { bg: COLORS.statusMonitorBg, fg: COLORS.statusMonitorText, icon: COLORS.statusMonitor, label: t('triage.tier.clinic'), iconName: 'alert-circle' as const }
      : { bg: COLORS.statusNormalBg, fg: COLORS.statusNormalText, icon: COLORS.statusNormal, label: t('triage.tier.self'), iconName: 'check-circle' as const };
  return (
    <View style={[triageStyles.box, { backgroundColor: palette.bg }]}>
      <View style={triageStyles.row}>
        <Feather name={palette.iconName} size={16} color={palette.icon} />
        <Text style={[triageStyles.tier, { color: palette.fg }]}>{palette.label}</Text>
      </View>
      {observations.length > 0 && (
        <View style={triageStyles.obsList}>
          {observations.map((o, i) => (
            <View key={i} style={triageStyles.obsRow}>
              <Text style={[triageStyles.obsBullet, { color: palette.fg }]}>·</Text>
              <Text style={[triageStyles.obsText, { color: palette.fg }]}>{o}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={[triageStyles.disclaimer, { color: palette.fg }]}>
        {t('triage.observation')} — not medical advice. Discuss with your clinician.
      </Text>
    </View>
  );
}

const triageStyles = StyleSheet.create({
  box: {
    borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
    marginTop: SPACING.md,
    gap: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tier: { ...TYPOGRAPHY.bodySmall, fontWeight: '700' },
  obsList: { gap: 2 },
  obsRow: { flexDirection: 'row', gap: 6 },
  obsBullet: { ...TYPOGRAPHY.bodySmall, fontWeight: '800' },
  obsText: { ...TYPOGRAPHY.bodySmall, flex: 1 },
  disclaimer: { ...TYPOGRAPHY.caption, marginTop: 2, opacity: 0.8 },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: SPACING.xxl,
  },
  stepTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  notesLabel: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACING.md - 2,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    backgroundColor: COLORS.white,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  bumpNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 12,
    backgroundColor: COLORS.statusUrgentBg,
    borderWidth: 1,
    borderColor: COLORS.statusUrgent,
    marginBottom: SPACING.md,
  },
  bumpNoteText: { flex: 1, fontSize: 12, color: COLORS.text, lineHeight: 17 },
});
