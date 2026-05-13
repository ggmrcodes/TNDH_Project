import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { MedicationReminder, SymptomLog, Transfusion } from '../../types/database';
import * as mockServices from '../../mock/services';
import * as realSymptomService from '../../services/symptomService';
import * as realTransfusionService from '../../services/transfusionService';
import * as realClinicianService from '../../services/clinicianService';
import { formatDate } from '../../utils/dateHelpers';
import {
  projectHbDecay,
  HbDecayResult,
  computeSymptomTimepoints,
  summarizePatterns,
  SymptomPattern,
  SymptomTimepoint,
  computeAdherenceSummary,
  AdherenceSummary,
} from '../../analytics';
import ResponsiveContainer from '../common/ResponsiveContainer';
import Disclaimer from '../common/Disclaimer';
import LoadingSpinner from '../common/LoadingSpinner';
import HbTrendChart from '../charts/HbTrendChart';
import SymptomDotPlot from '../charts/SymptomDotPlot';
import AdherenceRing from '../charts/AdherenceRing';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../config/theme';

const SYMPTOM_LABELS: Record<string, string> = {
  fever: 'Fever',
  chills: 'Chills',
  fatigue: 'Fatigue',
  dark_urine: 'Dark urine',
  jaundice: 'Jaundice',
  back_pain: 'Back pain',
  shortness_of_breath: 'Shortness of breath',
  skin_rash: 'Skin rash',
};

export interface PatientDetailPaneProps {
  userId: string;
  isClinicianView?: boolean;
}

interface LoadedData {
  transfusions: Transfusion[];
  logs: SymptomLog[];
  medications: MedicationReminder[];
}

async function loadPatientData(
  userId: string,
  isMockMode: boolean,
  isClinicianView: boolean
): Promise<LoadedData> {
  if (isMockMode && isClinicianView) {
    const [txs, slogs] = await Promise.all([
      mockServices.getTransfusionsForPatient(userId),
      mockServices.getSymptomLogsForPatient(userId),
    ]);
    return { transfusions: txs, logs: slogs, medications: [] };
  }
  if (isMockMode) {
    const [txs, slogs, meds] = await Promise.all([
      mockServices.getTransfusions(),
      mockServices.getSymptomLogs(userId, 200),
      mockServices.getMedicationReminders(userId),
    ]);
    return { transfusions: txs, logs: slogs, medications: meds };
  }
  if (isClinicianView) {
    const [txs, slogs] = await Promise.all([
      realClinicianService.getTransfusionsForPatient(userId),
      realClinicianService.getSymptomLogsForPatient(userId),
    ]);
    return { transfusions: txs, logs: slogs, medications: [] };
  }
  const [txs, slogs] = await Promise.all([
    realTransfusionService.getTransfusions(userId),
    realSymptomService.getSymptomLogs(userId, 200),
  ]);
  return { transfusions: txs, logs: slogs, medications: [] };
}

export default function PatientDetailPane({
  userId,
  isClinicianView = false,
}: PatientDetailPaneProps) {
  const { isMockMode } = useAuth();
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [transfusions, setTransfusions] = useState<Transfusion[]>([]);
  const [logs, setLogs] = useState<SymptomLog[]>([]);
  const [medications, setMedications] = useState<MedicationReminder[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let cancelled = false;
      (async () => {
        setLoading(true);
        const data = await loadPatientData(userId, isMockMode, isClinicianView);
        if (!cancelled) {
          setTransfusions(data.transfusions);
          setLogs(data.logs);
          setMedications(data.medications);
          setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [userId, isMockMode, isClinicianView])
  );

  const hbResult: HbDecayResult = useMemo(() => projectHbDecay(transfusions), [transfusions]);

  const timepoints: SymptomTimepoint[] = useMemo(
    () => computeSymptomTimepoints(logs, transfusions),
    [logs, transfusions]
  );

  const patterns: SymptomPattern[] = useMemo(
    () => summarizePatterns(timepoints, 2).slice(0, 3),
    [timepoints]
  );

  const adherence: AdherenceSummary = useMemo(
    () => computeAdherenceSummary(medications),
    [medications]
  );

  const thirtyDayStats = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const txCount = transfusions.filter(t => new Date(t.date).getTime() >= cutoff).length;
    const logCount = logs.filter(l => new Date(l.logged_at).getTime() >= cutoff).length;
    const flagged = logs.filter(l => {
      const ts = new Date(l.logged_at).getTime();
      return ts >= cutoff && (l.outcome === 'monitor' || l.outcome === 'urgent');
    }).length;
    return { txCount, logCount, flagged };
  }, [transfusions, logs]);

  if (loading) return <LoadingSpinner />;

  return (
    <ResponsiveContainer>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('preVisit.title')}</Text>
          <Text style={styles.subtitle}>{t('preVisit.subtitle')}</Text>
        </View>

        <Disclaimer />

        {/* 30-day snapshot */}
        <Section label={t('preVisit.section.recent')}>
          <View style={styles.row30}>
            <Stat value={thirtyDayStats.txCount} label="Transfusions" icon="droplet" color={COLORS.primary} />
            <Stat value={thirtyDayStats.logCount} label="Symptom logs" icon="activity" color={COLORS.accent} />
            <Stat value={thirtyDayStats.flagged} label="Flagged" icon="alert-circle" color={COLORS.statusMonitor} />
          </View>
        </Section>

        {/* Hb trend */}
        <Section label={t('preVisit.section.hb')} icon="trending-down">
          {hbResult.sampleCount === 0 ? (
            <Text style={styles.empty}>{t('preVisit.empty.hb')}</Text>
          ) : (
            <>
              <View style={styles.chartWrap}>
                <HbTrendChart transfusions={transfusions} decay={hbResult} />
              </View>
              <View style={styles.insightList}>
                <Insight
                  headline={`Estimated decay ${hbResult.decayRatePerDay?.toFixed(2)} g/dL per day`}
                  body={`Derived from ${hbResult.sampleCount} past cycle${hbResult.sampleCount === 1 ? '' : 's'} (${hbResult.confidence} confidence).`}
                />
                {hbResult.latestPostHb != null && hbResult.latestTxDate && (
                  <Insight
                    headline={`Most recent post-Hb: ${hbResult.latestPostHb.toFixed(1)} g/dL`}
                    body={`Measured on ${formatDate(hbResult.latestTxDate, language)}.`}
                  />
                )}
                {hbResult.projectedThresholdDate && hbResult.daysUntilThreshold != null && (
                  <Insight
                    headline={
                      hbResult.daysUntilThreshold <= 0
                        ? `Projected threshold (7.0 g/dL) reached`
                        : `Projected to cross 7.0 g/dL in ~${hbResult.daysUntilThreshold} days`
                    }
                    body={`Around ${formatDate(hbResult.projectedThresholdDate, language)}. Observation based on past decay — actual timing varies.`}
                  />
                )}
              </View>
            </>
          )}
        </Section>

        {/* Symptom patterns */}
        <Section label={t('preVisit.section.symptoms')} icon="clipboard">
          {patterns.length === 0 ? (
            <Text style={styles.empty}>{t('preVisit.empty.symptoms')}</Text>
          ) : (
            <>
              <View style={styles.chartWrap}>
                <SymptomDotPlot
                  timepoints={timepoints}
                  topSymptoms={patterns.map(p => p.symptomKey)}
                  labelMap={SYMPTOM_LABELS}
                />
              </View>
              <View style={styles.insightList}>
                {patterns.map(p => (
                  <Insight
                    key={p.symptomKey}
                    headline={`${SYMPTOM_LABELS[p.symptomKey] ?? p.symptomKey} — ${p.occurrences}× logged`}
                    body={`Typically appears ${windowRange(p)} after a transfusion. Mean severity ${p.meanSeverity}/10.`}
                  />
                ))}
              </View>
            </>
          )}
        </Section>

        {/* Medication adherence */}
        <Section label={t('preVisit.section.adherence')} icon="check-circle">
          {adherence.activeCount === 0 ? (
            <Text style={styles.empty}>{t('preVisit.empty.adherence')}</Text>
          ) : (
            <View style={styles.adherenceRow}>
              <AdherenceRing
                percent={adherence.overallPercentToday}
                streakDays={Math.max(0, ...adherence.items.map(i => i.streakDays))}
              />
              <View style={[styles.insightList, { flex: 1 }]}>
                <Insight
                  headline={`${adherence.overallPercentToday}% on track today`}
                  body={`Across ${adherence.activeCount} active medication${adherence.activeCount === 1 ? '' : 's'}.`}
                />
                {adherence.items
                  .filter(i => i.dosesExpectedToday > 0)
                  .map(i => (
                    <Insight
                      key={i.medicationId}
                      headline={i.medicationName}
                      body={`${i.dosesTakenToday}/${i.dosesExpectedToday} doses today · ${i.streakDays}-day streak.`}
                    />
                  ))}
              </View>
            </View>
          )}
        </Section>

        <View style={styles.footer}>
          <Feather name="shield" size={12} color={COLORS.textLight} />
          <Text style={styles.footerText}>Observations only. Share with your care team.</Text>
        </View>
      </ScrollView>
    </ResponsiveContainer>
  );
}

function Section({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon && <Feather name={icon} size={14} color={COLORS.textLight} />}
        <Text style={styles.sectionLabel}>{label.toUpperCase()}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Insight({ headline, body }: { headline: string; body: string }) {
  return (
    <View style={styles.insight}>
      <Text style={styles.insightHeadline}>{headline}</Text>
      <Text style={styles.insightBody}>{body}</Text>
    </View>
  );
}

function Stat({
  value,
  label,
  icon,
  color,
}: {
  value: number;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}) {
  return (
    <View style={styles.stat}>
      <Feather name={icon} size={18} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function windowRange(p: SymptomPattern): string {
  if (p.minDaysSinceTx === p.maxDaysSinceTx) return `~${p.meanDaysSinceTx} days`;
  return `${p.minDaysSinceTx}–${p.maxDaysSinceTx} days`;
}

const styles = StyleSheet.create({
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xxl, gap: SPACING.md },
  header: { gap: 4, marginBottom: SPACING.xs },
  title: { ...TYPOGRAPHY.h2, color: COLORS.text },
  subtitle: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.card,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionLabel: { ...TYPOGRAPHY.label, color: COLORS.textLight },
  sectionBody: {},
  chartWrap: { alignItems: 'center', marginBottom: SPACING.sm },
  adherenceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  insightList: { gap: SPACING.sm },
  insight: {
    paddingVertical: SPACING.xs,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    paddingLeft: SPACING.sm,
  },
  insightHeadline: { ...TYPOGRAPHY.body, fontWeight: '700', color: COLORS.text },
  insightBody: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, marginTop: 2 },
  empty: { ...TYPOGRAPHY.bodySmall, color: COLORS.textLight, fontStyle: 'italic' },
  row30: { flexDirection: 'row', gap: SPACING.sm },
  stat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: COLORS.surfaceElevated,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    gap: 4,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textLight, letterSpacing: 0.3 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.sm,
  },
  footerText: { ...TYPOGRAPHY.caption, color: COLORS.textLight },
});
