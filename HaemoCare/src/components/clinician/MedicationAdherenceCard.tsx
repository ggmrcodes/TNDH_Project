/**
 * Per-patient medication widget for the clinician dashboard.
 *
 * Three sections, in order:
 *
 *  1. Adherence stats — taken/missed counts for the last 7 days + a
 *     sparkline of daily taken counts.
 *  2. Active reminders list — medication_reminders rows the patient
 *     has set up (name · dosage · frequency · times). The doctor used
 *     to see only the adherence numbers without knowing WHAT meds the
 *     patient was on; this section fixes that.
 *  3. Other reported medications — patient's free-text
 *     `profile.medications` field (passed in by the parent). Covers
 *     patients who type their meds in their profile but never set up
 *     structured reminders.
 *
 * Renders nothing when ALL three sources are empty.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { COLORS, SPACING, RADIUS, TYPOGRAPHY, SHADOWS } from '../../config/theme';
import { TranslationKey } from '../../i18n';
import * as mockServices from '../../mock/services';
import * as realClinicianService from '../../services/clinicianService';
import type { MedicationAdherenceEvent, MedicationReminder } from '../../types/database';

export interface MedicationAdherenceCardProps {
  patientUserId: string;
  days?: number;
  /** Free-text from `profiles.medications` — typed by the patient on
   * signup or in Edit Profile. Passed in from the dashboard so the
   * card stays a single source of truth for "what's the patient on?" */
  profileMedications?: string | null;
}

interface Aggregated {
  takenCount: number;
  skippedCount: number;
  perDayTaken: number[]; // length === days
  hasReminders: boolean;
}

const FREQUENCY_KEY: Record<MedicationReminder['frequency'], TranslationKey> = {
  daily: 'medications.frequencyDaily' as TranslationKey,
  twice_daily: 'medications.frequencyTwice' as TranslationKey,
  three_times: 'medications.frequencyThrice' as TranslationKey,
  weekly: 'medications.frequencyWeekly' as TranslationKey,
  as_needed: 'medications.frequencyAsNeeded' as TranslationKey,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function aggregateEvents(
  events: MedicationAdherenceEvent[],
  days: number,
  now: Date
): { takenCount: number; skippedCount: number; perDayTaken: number[] } {
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const perDayTaken = new Array(days).fill(0) as number[];
  let takenCount = 0;
  let skippedCount = 0;
  for (const e of events) {
    const eDate = new Date(e.scheduled_at);
    const dayIndex = Math.floor((eDate.getTime() - cutoff.getTime()) / DAY_MS);
    if (dayIndex < 0 || dayIndex >= days) continue;
    if (e.taken_at) {
      perDayTaken[dayIndex]++;
      takenCount++;
    } else if (e.skipped_at) {
      skippedCount++;
    }
  }
  return { takenCount, skippedCount, perDayTaken };
}

export default function MedicationAdherenceCard({
  patientUserId,
  days = 7,
  profileMedications,
}: MedicationAdherenceCardProps) {
  const { isMockMode } = useAuth();
  const { t } = useLanguage();
  const [data, setData] = useState<Aggregated | null>(null);
  const [reminders, setReminders] = useState<MedicationReminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const now = new Date();
      const cutoff = new Date(now);
      cutoff.setHours(0, 0, 0, 0);
      cutoff.setDate(cutoff.getDate() - (days - 1));
      try {
        const [reminderRows, events]: [MedicationReminder[], MedicationAdherenceEvent[]] = isMockMode
          ? await Promise.all([
              mockServices.getMedicationRemindersForPatient(patientUserId),
              mockServices.getAdherenceEventsForPatient(patientUserId, cutoff.toISOString()),
            ])
          : await Promise.all([
              realClinicianService.getMedicationRemindersForPatient(patientUserId),
              realClinicianService.getAdherenceEventsForPatient(patientUserId, cutoff.toISOString()),
            ]);
        if (cancelled) return;
        const agg = aggregateEvents(events, days, now);
        const activeReminders = reminderRows.filter((r) => r.is_active);
        setReminders(activeReminders);
        setData({ ...agg, hasReminders: activeReminders.length > 0 });
      } catch {
        if (!cancelled) {
          setReminders([]);
          setData({
            takenCount: 0,
            skippedCount: 0,
            perDayTaken: new Array(days).fill(0),
            hasReminders: false,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientUserId, isMockMode, days]);

  const hasReminders = reminders.length > 0;
  const profileMedsTrimmed = (profileMedications ?? '').trim();
  const hasProfileMeds = profileMedsTrimmed.length > 0;
  const hasAnyAdherenceSignal =
    !!data && (data.takenCount > 0 || data.skippedCount > 0);

  // Render nothing only when ALL sources are empty — otherwise we have
  // SOMETHING to tell the doctor about this patient's meds.
  if (!loading && !hasReminders && !hasProfileMeds && !hasAnyAdherenceSignal) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.iconBg}>
            <Feather name="check-circle" size={14} color={COLORS.primary} />
          </View>
          <Text style={styles.label}>
            {t('clinician.adherence.title' as TranslationKey).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.empty}>
          {t('clinician.adherence.empty' as TranslationKey)}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconBg}>
          <Feather name="check-circle" size={14} color={COLORS.primary} />
        </View>
        <Text style={styles.label}>
          {t('clinician.adherence.title' as TranslationKey).toUpperCase()}
        </Text>
      </View>

      {loading ? (
        <Text style={styles.empty}>{t('common.loading' as TranslationKey)}</Text>
      ) : (
        <View style={styles.body}>
          {(hasReminders || hasAnyAdherenceSignal) && data && (
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: COLORS.statusNormal }]}>
                  {data.takenCount}
                </Text>
                <Text style={styles.statLabel}>
                  {t('clinician.adherence.takenLabel' as TranslationKey).toUpperCase()}
                </Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: COLORS.statusMonitor }]}>
                  {data.skippedCount}
                </Text>
                <Text style={styles.statLabel}>
                  {t('clinician.adherence.missedLabel' as TranslationKey).toUpperCase()}
                </Text>
              </View>
              <View style={styles.sparklineWrap}>
                <Sparkline values={data.perDayTaken} />
                <Text style={styles.sparklineLabel}>
                  {t('clinician.adherence.windowLabel' as TranslationKey, { days })}
                </Text>
              </View>
            </View>
          )}

          {hasReminders && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t('clinician.medications.activeTitle' as TranslationKey, {
                  count: reminders.length,
                })}
              </Text>
              <View style={styles.reminderList}>
                {reminders.map((r) => (
                  <ReminderRow key={r.id} reminder={r} t={t} />
                ))}
              </View>
            </View>
          )}

          {hasProfileMeds && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t('clinician.medications.otherReportedTitle' as TranslationKey)}
              </Text>
              <Text style={styles.profileMedsText}>{profileMedsTrimmed}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function ReminderRow({
  reminder,
  t,
}: {
  reminder: MedicationReminder;
  t: ReturnType<typeof useLanguage>['t'];
}) {
  const freq = t(FREQUENCY_KEY[reminder.frequency]);
  // Show up to 3 reminder times; rest collapsed to "+N more".
  const times = reminder.reminder_times ?? [];
  const visibleTimes = times.slice(0, 3).join(', ');
  const overflow = times.length - 3;
  const timeText = overflow > 0 ? `${visibleTimes} +${overflow}` : visibleTimes;

  return (
    <View style={styles.reminderRow}>
      <View style={styles.reminderIconWrap}>
        <Feather name="circle" size={6} color={COLORS.primary} />
      </View>
      <View style={styles.reminderTextWrap}>
        <Text style={styles.reminderName} numberOfLines={1}>
          {reminder.medication_name}
          {reminder.dosage ? ` · ${reminder.dosage}` : ''}
        </Text>
        <Text style={styles.reminderMeta} numberOfLines={1}>
          {freq}
          {timeText ? ` · ${timeText}` : ''}
        </Text>
        {reminder.instructions ? (
          <Text style={styles.reminderInstructions} numberOfLines={1}>
            {reminder.instructions}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Sparkline({ values, width = 100, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (!values || values.length === 0) return null;
  const padY = 3;
  const innerH = Math.max(1, height - padY * 2);
  const n = values.length;
  const maxV = Math.max(1, ...values);
  const xStep = n > 1 ? width / (n - 1) : 0;
  const y = (v: number) => padY + (1 - v / maxV) * innerH;
  const points = values.map((v, i) => ({
    x: n === 1 ? width / 2 : i * xStep,
    y: y(v),
  }));
  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');
  const stroke = COLORS.primary;
  return (
    <Svg width={width} height={height}>
      <Polyline
        points={polyline}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => {
        const isLast = i === points.length - 1;
        return (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={isLast ? 2.5 : 2}
            fill={isLast ? stroke : '#FFFFFF'}
            stroke={stroke}
            strokeWidth={1.2}
          />
        );
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.card,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBg: {
    width: 24, height: 24, borderRadius: 6,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  label: { ...TYPOGRAPHY.label, color: COLORS.textLight },
  body: { gap: SPACING.sm },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  stat: { alignItems: 'center', minWidth: 56 },
  statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textLight, letterSpacing: 0.3 },
  sparklineWrap: { flex: 1, alignItems: 'flex-end', gap: 2 },
  sparklineLabel: { fontSize: 10, color: COLORS.textLight, fontWeight: '500' },
  empty: { ...TYPOGRAPHY.bodySmall, color: COLORS.textLight, fontStyle: 'italic' },
  section: { gap: SPACING.xs, paddingTop: SPACING.xs },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textLight,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  reminderList: { gap: SPACING.xs },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
    paddingVertical: 2,
  },
  reminderIconWrap: {
    width: 14,
    alignItems: 'center',
    paddingTop: 7,
  },
  reminderTextWrap: { flex: 1, gap: 1 },
  reminderName: { ...TYPOGRAPHY.bodySmall, color: COLORS.text, fontWeight: '600' },
  reminderMeta: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  reminderInstructions: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
  profileMedsText: { ...TYPOGRAPHY.bodySmall, color: COLORS.text, lineHeight: 18 },
});
