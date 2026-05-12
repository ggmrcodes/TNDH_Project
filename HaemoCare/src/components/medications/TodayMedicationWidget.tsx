import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import * as mockServices from '../../mock/services';
import { MedicationReminder } from '../../types/database';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../../config/theme';

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
      (async () => {
        const data = await mockServices.getMedicationReminders(user.id);
        setMedications(data.filter(m => m.is_active));
      })();
    }, [user, isMockMode])
  );

  if (medications.length === 0) return null;

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
