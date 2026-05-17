import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import * as mockServices from '../../mock/services';
import * as realMedicationsService from '../../services/medicationsService';
import { MedicationReminder } from '../../types/database';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../config/theme';

interface Props {
  onPress: () => void;
}

export default function TodayMedicationWidget({ onPress }: Props) {
  const { user, isMockMode } = useAuth();
  const { t } = useLanguage();
  const [medications, setMedications] = useState<MedicationReminder[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let cancelled = false;
      (async () => {
        try {
          const data = isMockMode
            ? await mockServices.getMedicationReminders(user.id)
            : await realMedicationsService.getMedicationReminders(user.id);
          if (!cancelled) setMedications(data.filter(m => m.is_active));
        } catch (err) {
          console.error('TodayMedicationWidget load error', err);
          if (!cancelled) setMedications([]);
        }
      })();
      return () => { cancelled = true; };
    }, [user, isMockMode])
  );

  // Empty state — patients with zero active medications previously saw
  // nothing here, which left them confused about what the widget did.
  // Render a compact "tap to set up" card so the value of the feature is
  // visible even before any data exists.
  if (medications.length === 0) {
    return (
      <TouchableOpacity
        style={[styles.container, styles.emptyContainer]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('medications.noMedications')}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <View style={styles.emptyIconBg}>
              <Text style={styles.pillEmoji}>💊</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t('medications.noMedications')}</Text>
              <Text style={styles.emptySubtitle} numberOfLines={2}>
                {t('medications.noMedicationsDesc')}
              </Text>
            </View>
          </View>
          <Feather name="plus-circle" size={20} color={COLORS.primary} />
        </View>
      </TouchableOpacity>
    );
  }

  const takenCount = medications.filter(m => m.taken_today.length > 0).length;
  const totalCount = medications.length;
  const allTaken = takenCount === totalCount;
  const pendingMeds = medications.filter(m => m.taken_today.length === 0);

  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const hasOverdue = pendingMeds.some(m =>
    m.reminder_times.some(t => currentTime > t)
  );

  return (
    <TouchableOpacity
      style={[styles.container, hasOverdue && styles.containerOverdue, allTaken && styles.containerDone]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[
            styles.iconBg,
            allTaken && styles.iconBgDone,
            hasOverdue && styles.iconBgOverdue,
          ]}>
            {allTaken ? (
              <Feather name="check-circle" size={18} color={COLORS.white} />
            ) : (
              <Text style={styles.pillEmoji}>💊</Text>
            )}
          </View>
          <View>
            <Text style={styles.title}>{t('medications.todayProgress')}</Text>
            <Text style={[styles.status, allTaken && styles.statusDone, hasOverdue && styles.statusOverdue]}>
              {allTaken
                ? t('medications.allTaken')
                : hasOverdue
                  ? `${totalCount - takenCount} ${t('medications.pending')} ⚠️`
                  : `${takenCount}/${totalCount} ${t('medications.taken')}`
              }
            </Text>
          </View>
        </View>
        <Feather name="chevron-right" size={18} color={COLORS.textLight} />
      </View>

      {/* Pill progress dots */}
      <View style={styles.dotsRow}>
        {medications.map((med) => {
          const isTaken = med.taken_today.length > 0;
          const isLate = !isTaken && med.reminder_times.some(t => currentTime > t);
          return (
            <View key={med.id} style={styles.dotItem}>
              <View style={[
                styles.dot,
                isTaken && styles.dotTaken,
                isLate && styles.dotOverdue,
              ]}>
                {isTaken && <Feather name="check" size={10} color={COLORS.white} />}
              </View>
              <Text style={styles.dotLabel} numberOfLines={1}>
                {med.medication_name}
              </Text>
              <Text style={[styles.dotTime, isLate && styles.dotTimeOverdue]}>
                {med.reminder_times[0]}
              </Text>
            </View>
          );
        })}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 18,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.card,
  },
  containerOverdue: {
    borderColor: COLORS.accentMuted,
    backgroundColor: '#FFFBF9',
  },
  containerDone: {
    borderColor: COLORS.statusNormal,
    backgroundColor: COLORS.statusNormalBg,
  },
  emptyContainer: {
    borderStyle: 'dashed',
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  emptyIconBg: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptySubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBg: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBgDone: { backgroundColor: COLORS.statusNormal },
  iconBgOverdue: { backgroundColor: COLORS.accentLight },
  pillEmoji: { fontSize: 18 },
  title: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  status: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  statusDone: { color: COLORS.statusNormal, fontWeight: '700' },
  statusOverdue: { color: COLORS.accent, fontWeight: '700' },
  dotsRow: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 8,
  },
  dotItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotTaken: {
    backgroundColor: COLORS.statusNormal,
    borderColor: COLORS.statusNormal,
  },
  dotOverdue: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentLight,
  },
  dotLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  dotTime: {
    fontSize: 10,
    fontWeight: '500',
    color: COLORS.textLight,
  },
  dotTimeOverdue: {
    color: COLORS.accent,
    fontWeight: '700',
  },
});
