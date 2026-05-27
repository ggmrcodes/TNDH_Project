import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, StyleSheet, SafeAreaView, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { isSameDay } from 'date-fns';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../../types/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import { formatDate } from '../../utils/dateHelpers';
import { evaluateSymptoms, ThresholdResult, getSymptomLabel } from '../../utils/clinicalThresholds';
import { triageSymptoms, TriageResult } from '../../analytics';
import * as realSymptomService from '../../services/symptomService';
import * as realTransfusionService from '../../services/transfusionService';
import * as mockServices from '../../mock/services';
import { Outcome, SymptomLog, Transfusion, UrineColor } from '../../types/database';
import SymptomChecklist from '../../components/symptoms/SymptomChecklist';
import UrineColorPicker from '../../components/symptoms/UrineColorPicker';
import SeveritySlider from '../../components/common/SeveritySlider';
import OutcomeDisplay from '../../components/symptoms/OutcomeDisplay';
import Button from '../../components/common/Button';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS } from '../../config/theme';
import { TranslationKey } from '../../i18n';
import { useOverdueState } from '../../hooks/useOverdueState';
import { applyBump } from '../../utils/overdueVisit';
import EmergencyContactSheet from '../../components/emergency/EmergencyContactSheet';
import { useEmergencyContacts } from '../../hooks/useEmergencyContacts';

type RouteProps = RouteProp<RootStackParamList, 'NewSymptomLog'>;

type Step = 'select' | 'severity' | 'review' | 'result';

export default function NewSymptomLogScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProps>();
  const { user, isMockMode, profile } = useAuth();
  const { t, language } = useLanguage();

  const { isMobile } = useResponsive();
  const transfusionId = route.params?.transfusionId;
  // When present, the wizard runs in EDIT mode: it loads the existing log,
  // pre-fills every field, and saves via updateSymptomLog instead of
  // createSymptomLog. Absent → the normal create flow (unchanged).
  const editLogId = route.params?.editLogId;
  const isEditing = !!editLogId;
  const [editError, setEditError] = useState<string | null>(null);

  const { overdueState } = useOverdueState();
  const { contacts } = useEmergencyContacts();
  const [notifySheetVisible, setNotifySheetVisible] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  // Remembers the raw AI-suggested outcome before any overdue bump is applied.
  // Set once in handlePreview; never reset by user interaction so the bump
  // explanation always shows the original suggestion as the "from" value.
  const aiSuggestedOutcomeRef = useRef<Outcome | null>(null);

  const [step, setStep] = useState<Step>('select');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [severityScores, setSeverityScores] = useState<Record<string, number>>({});
  const [urineColor, setUrineColor] = useState<UrineColor | null>(null);
  const [notes, setNotes] = useState('');
  // Date the symptoms occurred. Defaults to now; the patient can backdate it
  // on the review step (future dates are disabled via the picker's maximumDate).
  // The time-of-day is preserved as "now" — when a past day is picked we keep
  // the current local clock time on that day, so a backdated log still carries
  // a sensible timestamp rather than midnight.
  const [logDate, setLogDate] = useState<Date>(new Date());
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  // Snapshot taken when the picker opens, so iOS "Cancel" can discard changes
  // (the iOS spinner commits live on each scroll).
  const dateBeforeEditRef = useRef<Date>(new Date());
  const [result, setResult] = useState<ThresholdResult | null>(null);
  // Outcome the patient has selected (or accepted) on the review step.
  // Initialised to the bumped suggestion in handlePreview; patient can override.
  const [confirmedOutcome, setConfirmedOutcome] = useState<Outcome>('normal');
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

  // Edit mode: load the existing log and pre-fill every field. The wizard
  // still starts at the 'select' step so the patient can adjust anything.
  useEffect(() => {
    if (!editLogId) return;
    let cancelled = false;
    (async () => {
      const existing = isMockMode
        ? await mockServices.getSymptomLogById(editLogId)
        : await realSymptomService.getSymptomLogById(editLogId);
      if (cancelled) return;
      // If the log can't be loaded (e.g. deleted between detail and edit),
      // surface an error instead of leaving a blank edit form. (t is captured
      // intentionally — not a dep — so a later language switch can't re-run
      // this effect and wipe the user's in-progress edits.)
      if (!existing) { setEditError(t('symptoms.updateFailed')); return; }
      // severity_scores may carry a 'urine_color' key (the color's intensity);
      // selectedSymptoms is the symptom list only.
      setSelectedSymptoms(existing.symptoms);
      setSeverityScores(existing.severity_scores);
      setUrineColor(existing.urine_color ?? null);
      setNotes(existing.notes ?? '');
      setLogDate(new Date(existing.logged_at));
    })();
    return () => {
      cancelled = true;
    };
  }, [editLogId, isMockMode]);

  // Reflect edit mode in the header title.
  useEffect(() => {
    navigation.setOptions({ title: isEditing ? t('symptoms.editLog') : t('symptoms.logNew') });
  }, [navigation, isEditing, t]);

  const triage: TriageResult | null = useMemo(() => {
    if (step !== 'severity') return null;
    if (Object.keys(severityScores).length === 0 && !urineColor) return null;
    return triageSymptoms(severityScores, {
      loggedAt: logDate.toISOString(),
      recentLogs,
      recentTransfusion: latestTx,
      urineColor,
    });
  }, [severityScores, step, recentLogs, latestTx, urineColor, logDate]);

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

  /**
   * Commits a date picked by the user. The picker yields midnight on the
   * chosen day; we graft the current local time-of-day onto it so a backdated
   * log keeps a realistic timestamp (see logDate state comment).
   */
  const commitPickedDate = (picked: Date) => {
    const now = new Date();
    const next = new Date(picked);
    next.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
    setLogDate(next);
  };

  const onDatePicked = (event: DateTimePickerEvent, selected?: Date) => {
    // Android default dialog: fires once with OK ('set') or Cancel
    // ('dismissed') and closes itself. iOS inline picker: we close it via the
    // Done/Cancel buttons rendered alongside, committing the live value here.
    if (Platform.OS === 'android') {
      setDatePickerVisible(false);
      if (event.type === 'dismissed' || !selected) return;
      commitPickedDate(selected);
      return;
    }
    if (selected) commitPickedDate(selected);
  };

  // Locale-aware label for the chosen date: "Today" when it is today,
  // otherwise the shared formatDate helper (th-TH vs en-US via `language`).
  const logDateLabel = useMemo(
    () => (isSameDay(logDate, new Date()) ? t('symptom.dateToday') : formatDate(logDate, language)),
    [logDate, language, t]
  );

  const initSeverity = () => {
    const initial: Record<string, number> = {};
    selectedSymptoms.forEach(k => { initial[k] = severityScores[k] || 3; });
    // Urine color, when set, also gets a severity rating (intensity of the
    // selected color — e.g. light pink vs deep red). Same 1-10 scale as
    // every other symptom for UI consistency.
    if (urineColor) initial['urine_color'] = severityScores['urine_color'] || 3;
    setSeverityScores(initial);
    setStep('severity');
  };

  /**
   * Called when the patient taps Submit on the severity step.
   * Runs AI evaluation, computes the overdue bump, and transitions to the
   * review step so the patient can inspect and override the outcome before
   * anything is saved. No createSymptomLog call happens here.
   */
  const handlePreview = () => {
    const evaluation = evaluateSymptoms(severityScores, urineColor);

    // Record the AI-suggested outcome before any overdue bump.
    // This is the stable "from" value used in the bump explanation copy.
    const aiSuggested = evaluation.outcome;
    aiSuggestedOutcomeRef.current = aiSuggested;

    // Apply overdue bump to derive the default outcome for the selector.
    const bumpTiers = overdueState?.isOverdue ? overdueState.bumpTiers : 0;
    const bumpedOutcome = applyBump(aiSuggested, bumpTiers);
    const bumpedEvaluation: ThresholdResult = { ...evaluation, outcome: bumpedOutcome };

    setResult(bumpedEvaluation);
    // Default the selector to the bumped outcome; the patient may change it.
    setConfirmedOutcome(bumpedOutcome);
    setStep('review');
  };

  /**
   * Called when the patient taps Confirm on the review step.
   * Saves with whatever outcome the patient last selected.
   *
   * Create mode: inserts a new log and advances to the 'result' step (which
   * runs the urgent "notify clinician" nudge). Edit mode: updates the existing
   * log via updateSymptomLog and navigates straight back to the detail screen,
   * skipping the result/nudge flow.
   */
  const handleConfirm = async () => {
    if (!user) return;
    setEditError(null);
    setSaving(true);
    if (isEditing && editLogId) {
      try {
        const fields = {
          symptoms: selectedSymptoms,
          severity_scores: severityScores,
          outcome: confirmedOutcome,
          notes,
          urine_color: urineColor,
          logged_at: logDate.toISOString(),
        };
        if (isMockMode) {
          await mockServices.updateSymptomLog(editLogId, fields);
        } else {
          await realSymptomService.updateSymptomLog(editLogId, fields);
        }
        setSaving(false);
        navigation.goBack();
      } catch (err) {
        console.error('Update symptom log error:', err);
        setEditError(t('symptoms.updateFailed'));
        setSaving(false);
      }
      return;
    }
    try {
      const logData = {
        transfusion_id: transfusionId || null,
        symptoms: selectedSymptoms,
        severity_scores: severityScores,
        outcome: confirmedOutcome,
        notes,
        urine_color: urineColor,
        logged_at: logDate.toISOString(),
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
            <UrineColorPicker value={urineColor} onChange={setUrineColor} />
            <Button
              label={t('common.next')}
              onPress={initSeverity}
              disabled={selectedSymptoms.length === 0 && urineColor === null}
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
                label={getSymptomLabel(key, t)}
                value={severityScores[key] || 3}
                onChange={(val) => handleSeverityChange(key, val)}
              />
            ))}
            {urineColor && (
              <SeveritySlider
                key="urine_color"
                label={`${t('symptom.urine_color' as TranslationKey)}: ${t(`symptom.urineColor.${urineColor}` as TranslationKey)}`}
                value={severityScores['urine_color'] || 3}
                onChange={(val) => handleSeverityChange('urine_color', val)}
              />
            )}

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
              onPress={handlePreview}
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

        {step === 'review' && result && (
          <>
            <Text style={styles.stepTitle}>{t('symptoms.result')}</Text>

            {/* Date of symptoms — defaults to today, backdating allowed */}
            <Text style={styles.dateLabel}>{t('symptom.logDate')}</Text>
            <TouchableOpacity
              style={styles.dateRow}
              onPress={() => { dateBeforeEditRef.current = logDate; setDatePickerVisible(true); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${t('symptom.logDate')}: ${logDateLabel}`}
            >
              <Feather name="calendar" size={18} color={COLORS.primary} />
              <Text style={styles.dateRowText}>{logDateLabel}</Text>
              <Feather name="chevron-down" size={18} color={COLORS.textLight} style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
            {datePickerVisible && (
              <DateTimePicker
                value={logDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={onDatePicked}
              />
            )}
            {Platform.OS === 'ios' && datePickerVisible && (
              <View style={styles.iosPickerActions}>
                <TouchableOpacity
                  style={styles.iosPickerCancel}
                  onPress={() => { setLogDate(dateBeforeEditRef.current); setDatePickerVisible(false); }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                >
                  <Text style={styles.iosPickerCancelText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iosPickerDone}
                  onPress={() => setDatePickerVisible(false)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.done')}
                >
                  <Text style={styles.iosPickerDoneText}>{t('common.done')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Bump explanation — only shown when the bump is a real change */}
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

            {/* Outcome selector — patient picks the outcome that will be saved */}
            <View style={styles.outcomeSelector}>
              {(['normal', 'monitor', 'urgent'] as Outcome[]).map(option => {
                const isSelected = confirmedOutcome === option;
                const bgColor = option === 'normal' ? COLORS.statusNormalBg
                  : option === 'monitor' ? COLORS.statusMonitorBg
                  : COLORS.statusUrgentBg;
                const borderColor = option === 'normal' ? COLORS.statusNormal
                  : option === 'monitor' ? COLORS.statusMonitor
                  : COLORS.statusUrgent;
                const textColor = option === 'normal' ? COLORS.statusNormalText
                  : option === 'monitor' ? COLORS.statusMonitorText
                  : COLORS.statusUrgentText;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[
                      styles.outcomeSelectorOption,
                      { backgroundColor: isSelected ? bgColor : COLORS.white, borderColor },
                      isSelected && styles.outcomeSelectorOptionSelected,
                    ]}
                    onPress={() => setConfirmedOutcome(option)}
                    activeOpacity={0.75}
                  >
                    {isSelected && (
                      <Feather name="check" size={14} color={borderColor} style={{ marginRight: 4 }} />
                    )}
                    <Text style={[styles.outcomeSelectorLabel, { color: isSelected ? textColor : COLORS.textSecondary }]}>
                      {t(`status.${option}` as TranslationKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Button
              label={isEditing ? t('symptoms.saveChanges') : t('common.confirm')}
              onPress={handleConfirm}
              isLoading={saving}
              style={{ marginTop: SPACING.lg }}
            />
            <Button
              label={t('common.back')}
              onPress={() => setStep('severity')}
              variant="outline"
              style={{ marginTop: SPACING.sm }}
            />
            {editError ? <Text style={styles.editError}>{editError}</Text> : null}
          </>
        )}

        {step === 'result' && result && (
          <>
            <Text style={styles.stepTitle}>{t('symptoms.result')}</Text>
            <OutcomeDisplay result={{ ...result, outcome: confirmedOutcome }} />
            {confirmedOutcome === 'urgent' && contacts.length > 0 && !nudgeDismissed && (
              <View style={styles.urgentNotifyBanner}>
                <Text style={styles.urgentNotifyText}>{t('emergency.notifyPrompt')}</Text>
                <View style={styles.urgentNotifyActions}>
                  <TouchableOpacity style={styles.urgentNotifyPrimary} onPress={() => setNotifySheetVisible(true)}>
                    <Text style={styles.urgentNotifyPrimaryText}>{t('emergency.notifyAction')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.urgentNotifyGhost} onPress={() => setNudgeDismissed(true)}>
                    <Text style={styles.urgentNotifyGhostText}>{t('emergency.notifyDismiss')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <EmergencyContactSheet
              visible={notifySheetVisible}
              onClose={() => setNotifySheetVisible(false)}
              contacts={contacts}
              context="urgent_symptom"
              patientName={profile?.full_name?.trim() || profile?.patient_id || ''}
            />
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
  dateLabel: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md - 2,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.md,
  },
  dateRowText: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    fontWeight: '600',
  },
  iosPickerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },
  iosPickerCancel: { paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  iosPickerCancelText: { ...TYPOGRAPHY.bodySmall, fontWeight: '700', color: COLORS.textSecondary },
  iosPickerDone: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
  },
  iosPickerDoneText: { ...TYPOGRAPHY.bodySmall, fontWeight: '700', color: COLORS.white },
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
  editError: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.error,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  outcomeSelector: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  outcomeSelectorOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 2,
  },
  outcomeSelectorOptionSelected: {
    // extra visual emphasis on the selected option
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  outcomeSelectorLabel: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  urgentNotifyBanner: {
    padding: SPACING.md,
    borderRadius: 12,
    backgroundColor: COLORS.statusUrgentBg ?? '#FEF2F2',
    borderWidth: 1,
    borderColor: COLORS.statusUrgent ?? '#DC3B3B',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  urgentNotifyText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  urgentNotifyActions: { flexDirection: 'row', gap: SPACING.sm },
  urgentNotifyPrimary: {
    backgroundColor: COLORS.statusUrgent ?? '#DC3B3B',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
  },
  urgentNotifyPrimaryText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
  urgentNotifyGhost: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  urgentNotifyGhostText: { color: COLORS.textLight, fontSize: 13, fontWeight: '600' },
});
