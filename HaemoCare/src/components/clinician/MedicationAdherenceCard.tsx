/**
 * Per-patient medication adherence widget for the clinician dashboard.
 * Shows taken/missed counts for the last 7 days plus a sparkline of daily
 * taken counts. Renders an empty state when the patient has no active
 * reminders configured.
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
}

interface Aggregated {
  takenCount: number;
  skippedCount: number;
  perDayTaken: number[]; // length === days
  hasReminders: boolean;
}

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
}: MedicationAdherenceCardProps) {
  const { isMockMode } = useAuth();
  const { t } = useLanguage();
  const [data, setData] = useState<Aggregated | null>(null);
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
        const [reminders, events]: [MedicationReminder[], MedicationAdherenceEvent[]] = isMockMode
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
        const hasReminders = reminders.some(r => r.is_active);
        setData({ ...agg, hasReminders });
      } catch {
        if (!cancelled) setData({ takenCount: 0, skippedCount: 0, perDayTaken: new Array(days).fill(0), hasReminders: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientUserId, isMockMode, days]);

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
      ) : !data || (!data.hasReminders && data.takenCount === 0 && data.skippedCount === 0) ? (
        <Text style={styles.empty}>{t('clinician.adherence.empty' as TranslationKey)}</Text>
      ) : (
        <View style={styles.body}>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: COLORS.statusNormal }]}>{data.takenCount}</Text>
              <Text style={styles.statLabel}>{t('clinician.adherence.takenLabel' as TranslationKey).toUpperCase()}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: COLORS.statusMonitor }]}>{data.skippedCount}</Text>
              <Text style={styles.statLabel}>{t('clinician.adherence.missedLabel' as TranslationKey).toUpperCase()}</Text>
            </View>
            <View style={styles.sparklineWrap}>
              <Sparkline values={data.perDayTaken} />
              <Text style={styles.sparklineLabel}>
                {t('clinician.adherence.windowLabel' as TranslationKey, { days })}
              </Text>
            </View>
          </View>
        </View>
      )}
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
});
