import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import * as mockServices from '../../mock/services';
import * as medicationsService from '../../services/medicationsService';
import * as notifications from '../../services/notifications';
import { MedicationReminder, ALL_WEEKDAYS, WeekdayCode } from '../../types/database';
import { COLORS, TYPOGRAPHY, SPACING, RADIUS, SHADOWS } from '../../config/theme';
import type { TranslationKey } from '../../i18n';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

const FREQUENCY_OPTIONS = [
  { key: 'daily', times: 1 },
  { key: 'twice_daily', times: 2 },
  { key: 'three_times', times: 3 },
  { key: 'weekly', times: 1 },
  { key: 'as_needed', times: 0 },
] as const;

const MEAL_TIMING_OPTIONS = [
  { key: 'beforeMeal',   labelKey: 'medications.mealTiming.beforeMeal' as const },
  { key: 'withMeal',     labelKey: 'medications.mealTiming.withMeal' as const },
  { key: 'afterMeal',    labelKey: 'medications.mealTiming.afterMeal' as const },
  { key: 'emptyStomach', labelKey: 'medications.mealTiming.emptyStomach' as const },
] as const;

// JS getDay() is 0=Sun..6=Sat — map to our weekday codes for default-today picks.
const JS_DAY_TO_CODE: Record<number, WeekdayCode> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
};

function formatTimeFromDate(d: Date): string {
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function MedicationRemindersScreen() {
  const { user, isMockMode } = useAuth();
  const { t } = useLanguage();
  const { isMobile } = useResponsive();
  const [medications, setMedications] = useState<MedicationReminder[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Picks the right backing impl based on mock/real mode. Defined inline so
  // the screen stays a single render path with no isMockMode branches sprinkled
  // through every handler.
  const svc = useCallback(() => ({
    list: (uid: string) => isMockMode
      ? mockServices.getMedicationReminders(uid)
      : medicationsService.getMedicationReminders(uid),
    create: (uid: string, data: Parameters<typeof medicationsService.createMedicationReminder>[1]) =>
      isMockMode
        ? mockServices.createMedicationReminder(uid, data)
        : medicationsService.createMedicationReminder(uid, data),
    update: (uid: string, id: string, patch: Partial<MedicationReminder>) =>
      isMockMode
        ? mockServices.updateMedicationReminder(uid, id, patch)
        : medicationsService.updateMedicationReminder(uid, id, patch),
    remove: (uid: string, id: string) =>
      isMockMode
        ? mockServices.deleteMedicationReminder(uid, id)
        : medicationsService.deleteMedicationReminder(uid, id),
    markTaken: (uid: string, id: string) =>
      isMockMode
        ? mockServices.markMedicationTakenWithEvent(uid, id, 'tap')
        : medicationsService.markMedicationTaken(uid, id, 'tap'),
    unmark: (uid: string, id: string) =>
      isMockMode
        ? mockServices.unmarkMedicationTaken(uid, id)
        : medicationsService.unmarkMedicationTaken(uid, id),
  }), [isMockMode]);

  // Builds the i18n title/body for a reminder at the time we schedule it.
  // This is a function (not memoized) because LanguageContext changes
  // re-rendering this screen will already trigger a reschedule via the
  // dependency below.
  const buildReminderStrings = useCallback(
    (med: MedicationReminder): notifications.ScheduleStrings => ({
      title: t('reminders.notif.title' as TranslationKey, { med: med.medication_name }),
      body: t('reminders.notif.body' as TranslationKey, { dose: med.dosage }),
    }),
    [t]
  );

  // Add form state
  const [newName, setNewName] = useState('');
  const [newDosage, setNewDosage] = useState('');
  const [newFrequency, setNewFrequency] = useState<MedicationReminder['frequency']>('daily');
  const [newTimes, setNewTimes] = useState<string[]>(['08:00']);
  const [newDays, setNewDays] = useState<WeekdayCode[]>([...ALL_WEEKDAYS]);
  const [newInstructions, setNewInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);

  const loadMedications = useCallback(async () => {
    if (!user) return;
    try {
      const data = await svc().list(user.id);
      setMedications(data);
    } catch (err) {
      console.error('Failed to load medications:', err);
    }
    setLoading(false);
  }, [user, svc]);

  // Reschedule local notifications for the given set. Best-effort — failures
  // log but don't block the user-visible save (e.g. Expo Go iPhone, or no
  // permission). Patient sees the in-app state regardless.
  const reschedule = useCallback(async (meds: MedicationReminder[]) => {
    try {
      await notifications.rehydrateFromSchedule(meds, {
        buildStrings: buildReminderStrings,
      });
    } catch (err) {
      console.warn('Failed to reschedule reminders:', err);
    }
  }, [buildReminderStrings]);

  useFocusEffect(
    useCallback(() => {
      loadMedications();
    }, [loadMedications])
  );

  const handleMarkTaken = async (med: MedicationReminder) => {
    if (!user) return;
    try {
      await svc().markTaken(user.id, med.id);
      await loadMedications();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUndoTaken = async (med: MedicationReminder) => {
    if (!user) return;
    try {
      await svc().unmark(user.id, med.id);
      await loadMedications();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = (med: MedicationReminder) => {
    Alert.alert(
      t('medications.delete'),
      t('medications.deleteConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!user) return;
            await svc().remove(user.id, med.id);
            // Cancel any scheduled notifications for this reminder.
            try { await notifications.cancelReminder(med.id); }
            catch (err) { console.warn('cancelReminder failed:', err); }
            await loadMedications();
          },
        },
      ]
    );
  };

  const handleToggleActive = async (med: MedicationReminder) => {
    if (!user) return;
    await svc().update(user.id, med.id, { is_active: !med.is_active });
    // Pausing → cancel scheduled notifs; resuming → reschedule below via reload.
    if (med.is_active) {
      try { await notifications.cancelReminder(med.id); }
      catch (err) { console.warn('cancelReminder failed:', err); }
    }
    const refreshed = await svc().list(user.id);
    setMedications(refreshed);
    await reschedule(refreshed);
  };

  const handleAddMedication = async () => {
    if (!user || !newName.trim() || !newDosage.trim()) return;
    setSaving(true);
    try {
      // Treat "every day" as null in storage (legacy semantic + saves space).
      const daysToPersist = (newFrequency === 'as_needed' || newDays.length === 7)
        ? null
        : newDays;
      await svc().create(user.id, {
        medication_name: newName.trim(),
        dosage: newDosage.trim(),
        frequency: newFrequency,
        reminder_times: newTimes,
        days_of_week: daysToPersist,
        instructions: newInstructions.trim(),
      });
      // Reset form
      setNewName('');
      setNewDosage('');
      setNewFrequency('daily');
      setNewTimes(['08:00']);
      setNewDays([...ALL_WEEKDAYS]);
      setNewInstructions('');
      setShowAddForm(false);
      const refreshed = await svc().list(user.id);
      setMedications(refreshed);
      // Schedule local notifications for the next 14 days.
      await reschedule(refreshed);
      setLoading(false);
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  const toggleTime = (time: string) => {
    setNewTimes(prev =>
      prev.includes(time) ? prev.filter(t => t !== time) : [...prev, time].sort()
    );
  };

  const removeTime = (time: string) => {
    setNewTimes(prev => prev.filter(t => t !== time));
  };

  const onTimePicked = (event: DateTimePickerEvent, selected?: Date) => {
    // Android closes on first select; iOS spinner stays mounted.
    if (Platform.OS !== 'ios') setTimePickerVisible(false);
    if (event.type === 'dismissed' || !selected) return;
    const hhmm = formatTimeFromDate(selected);
    setNewTimes(prev => prev.includes(hhmm) ? prev : [...prev, hhmm].sort());
  };

  const toggleDay = (day: WeekdayCode) => {
    setNewDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const applyMealTiming = (labelKey: typeof MEAL_TIMING_OPTIONS[number]['labelKey']) => {
    setNewInstructions(t(labelKey));
  };

  const clearMealTiming = () => {
    setNewInstructions('');
  };

  const targetTimeCount = FREQUENCY_OPTIONS.find(o => o.key === newFrequency)?.times ?? 1;

  const getFrequencyLabel = (freq: string) => {
    const map: Record<string, string> = {
      daily: t('medications.frequencyDaily'),
      twice_daily: t('medications.frequencyTwice'),
      three_times: t('medications.frequencyThrice'),
      weekly: t('medications.frequencyWeekly'),
      as_needed: t('medications.frequencyAsNeeded'),
    };
    return map[freq] || freq;
  };

  const activeMeds = medications.filter(m => m.is_active);
  const takenCount = activeMeds.filter(m => m.taken_today.length > 0).length;
  const totalActive = activeMeds.length;
  const allTaken = totalActive > 0 && takenCount === totalActive;
  const progressPercent = totalActive > 0 ? (takenCount / totalActive) * 100 : 0;

  const now = new Date();
  const currentTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const getNextDoseTime = (med: MedicationReminder) => {
    if (med.taken_today.length >= med.reminder_times.length) return null;
    const untaken = med.reminder_times.filter(
      (_, i) => i >= med.taken_today.length
    );
    return untaken[0] || null;
  };

  const isOverdue = (med: MedicationReminder) => {
    const next = getNextDoseTime(med);
    if (!next) return false;
    return currentTimeStr > next && med.taken_today.length === 0;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          !isMobile && { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' as const, width: '100%' as any },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress Ring Card */}
        <View style={styles.progressCard}>
          <View style={styles.progressLeft}>
            <View style={styles.ringContainer}>
              <View style={[styles.ringOuter, allTaken && styles.ringOuterComplete]}>
                <View style={styles.ringInner}>
                  <Text style={[styles.ringNumber, allTaken && styles.ringNumberComplete]}>
                    {takenCount}/{totalActive}
                  </Text>
                </View>
              </View>
              {/* Progress arc overlay */}
              <View style={[
                styles.progressArc,
                {
                  borderTopColor: allTaken ? COLORS.statusNormal : COLORS.primary,
                  borderRightColor: progressPercent > 25 ? (allTaken ? COLORS.statusNormal : COLORS.primary) : 'transparent',
                  borderBottomColor: progressPercent > 50 ? (allTaken ? COLORS.statusNormal : COLORS.primary) : 'transparent',
                  borderLeftColor: progressPercent > 75 ? (allTaken ? COLORS.statusNormal : COLORS.primary) : 'transparent',
                  transform: [{ rotate: '-45deg' }],
                },
              ]} />
            </View>
          </View>
          <View style={styles.progressRight}>
            <Text style={styles.progressTitle}>{t('medications.todayProgress')}</Text>
            {allTaken ? (
              <View style={styles.allTakenBadge}>
                <Feather name="check-circle" size={14} color={COLORS.statusNormal} />
                <Text style={styles.allTakenText}>{t('medications.allTaken')}</Text>
              </View>
            ) : (
              <Text style={styles.progressSubtitle}>
                {totalActive - takenCount} {t('medications.pending')}
              </Text>
            )}
            {/* Streak */}
            {activeMeds.length > 0 && (
              <View style={styles.streakRow}>
                <Text style={styles.streakFire}>🔥</Text>
                <Text style={styles.streakText}>
                  {Math.min(...activeMeds.map(m => m.streak_days))} {t('medications.streak')}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Notification badge */}
        <View style={styles.notifBadge}>
          <Feather name="bell" size={13} color={COLORS.primary} />
          <Text style={styles.notifText}>{t('medications.notificationsEnabled')}</Text>
        </View>

        {/* Medication Cards */}
        {medications.map((med) => {
          const isTaken = med.taken_today.length > 0;
          const overdue = isOverdue(med);
          const nextDose = getNextDoseTime(med);

          return (
            <View
              key={med.id}
              style={[
                styles.medCard,
                isTaken && styles.medCardTaken,
                overdue && styles.medCardOverdue,
                !med.is_active && styles.medCardPaused,
              ]}
            >
              <View style={styles.medCardHeader}>
                <View style={styles.medCardLeft}>
                  <View style={[
                    styles.medIcon,
                    isTaken && styles.medIconTaken,
                    overdue && styles.medIconOverdue,
                  ]}>
                    {isTaken ? (
                      <Feather name="check" size={18} color={COLORS.white} />
                    ) : (
                      <Text style={styles.medIconText}>💊</Text>
                    )}
                  </View>
                  <View style={styles.medInfo}>
                    <Text style={[styles.medName, isTaken && styles.medNameTaken]}>
                      {med.medication_name}
                    </Text>
                    <Text style={styles.medDosage}>
                      {med.dosage} · {getFrequencyLabel(med.frequency)}
                    </Text>
                  </View>
                </View>
                <View style={styles.medCardRight}>
                  {med.streak_days > 0 && med.is_active && (
                    <View style={styles.streakIndicator}>
                      <Text style={styles.streakFire}>🔥</Text>
                      <Text style={styles.streakIndicatorText}>
                        {med.streak_days}d
                      </Text>
                    </View>
                  )}
                  {!med.is_active ? (
                    <View style={styles.pausedBadge}>
                      <Text style={styles.pausedText}>{t('medications.paused')}</Text>
                    </View>
                  ) : isTaken ? (
                    <TouchableOpacity
                      style={styles.undoBtn}
                      onPress={() => handleUndoTaken(med)}
                      activeOpacity={0.7}
                    >
                      <Feather name="rotate-ccw" size={14} color={COLORS.textLight} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* Time & Instructions */}
              <View style={styles.medDetails}>
                <View style={styles.timeRow}>
                  <Feather
                    name="clock"
                    size={13}
                    color={overdue ? COLORS.statusUrgent : COLORS.textLight}
                  />
                  {isTaken ? (
                    <Text style={styles.takenTimeText}>
                      {t('medications.takenAt')} {new Date(med.taken_today[med.taken_today.length - 1]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  ) : nextDose ? (
                    <Text style={[styles.timeText, overdue && styles.timeTextOverdue]}>
                      {t('medications.nextDose')}: {nextDose}
                      {overdue ? ' ⚠️' : ''}
                    </Text>
                  ) : (
                    <Text style={styles.timeText}>
                      {med.reminder_times.join(', ')}
                    </Text>
                  )}
                </View>
                {med.instructions ? (
                  <View style={styles.instructionRow}>
                    <Feather name="info" size={13} color={COLORS.textLight} />
                    <Text style={styles.instructionText}>{med.instructions}</Text>
                  </View>
                ) : null}
              </View>

              {/* Action Row */}
              {med.is_active && !isTaken && (
                <TouchableOpacity
                  style={[styles.takeBtn, overdue && styles.takeBtnOverdue]}
                  onPress={() => handleMarkTaken(med)}
                  activeOpacity={0.8}
                >
                  <Feather name="check-circle" size={16} color={COLORS.white} />
                  <Text style={styles.takeBtnText}>{t('medications.markTaken')}</Text>
                </TouchableOpacity>
              )}

              {/* Bottom actions */}
              <View style={styles.medActions}>
                <TouchableOpacity
                  style={styles.medActionBtn}
                  onPress={() => handleToggleActive(med)}
                  activeOpacity={0.7}
                >
                  <Feather
                    name={med.is_active ? 'pause-circle' : 'play-circle'}
                    size={14}
                    color={COLORS.textLight}
                  />
                  <Text style={styles.medActionText}>
                    {med.is_active ? t('medications.paused') : t('medications.active')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.medActionBtn}
                  onPress={() => handleDelete(med)}
                  activeOpacity={0.7}
                >
                  <Feather name="trash-2" size={14} color={COLORS.statusUrgent} />
                </TouchableOpacity>
              </View>

            </View>
          );
        })}

        {/* Empty state */}
        {medications.length === 0 && !loading && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>💊</Text>
            <Text style={styles.emptyTitle}>{t('medications.noMedications')}</Text>
            <Text style={styles.emptyDesc}>{t('medications.noMedicationsDesc')}</Text>
          </View>
        )}

        {/* Add Medication Form */}
        {showAddForm ? (
          <View style={styles.addFormCard}>
            <View style={styles.addFormHeader}>
              <Text style={styles.addFormTitle}>{t('medications.addNew')}</Text>
              <TouchableOpacity onPress={() => setShowAddForm(false)}>
                <Feather name="x" size={20} color={COLORS.textLight} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>{t('medications.name')} *</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="Deferasirox"
              placeholderTextColor={COLORS.textLight}
            />

            <Text style={styles.fieldLabel}>{t('medications.dosage')} *</Text>
            <TextInput
              style={styles.input}
              value={newDosage}
              onChangeText={setNewDosage}
              placeholder="500mg"
              placeholderTextColor={COLORS.textLight}
            />

            <Text style={styles.fieldLabel}>{t('medications.frequency')}</Text>
            <View style={styles.freqRow}>
              {FREQUENCY_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.freqChip,
                    newFrequency === opt.key && styles.freqChipActive,
                  ]}
                  onPress={() => setNewFrequency(opt.key)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.freqChipText,
                      newFrequency === opt.key && styles.freqChipTextActive,
                    ]}
                  >
                    {getFrequencyLabel(opt.key)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {newFrequency !== 'as_needed' && (
              <>
                <Text style={styles.fieldLabel}>{t('medications.daysOfWeek')}</Text>
                <View style={styles.daysRow}>
                  {ALL_WEEKDAYS.map(day => {
                    const isOn = newDays.includes(day);
                    return (
                      <TouchableOpacity
                        key={day}
                        style={[styles.dayChip, isOn && styles.dayChipActive]}
                        onPress={() => toggleDay(day)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isOn }}
                      >
                        <Text style={[styles.dayChipText, isOn && styles.dayChipTextActive]}>
                          {t(`medications.day.${day}` as TranslationKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {newDays.length === 7 && (
                  <Text style={styles.hintText}>{t('medications.daysAllWeek')}</Text>
                )}
              </>
            )}

            {newFrequency !== 'as_needed' && (
              <>
                <Text style={styles.fieldLabel}>{t('medications.reminderTime')}</Text>
                <Text style={styles.hintText}>
                  {t('medications.reminderTimeHint', {
                    count: targetTimeCount,
                    label: getFrequencyLabel(newFrequency),
                  })}
                </Text>
                <View style={styles.timeChipRow}>
                  {newTimes.map(time => (
                    <View key={time} style={styles.timeChipSelected}>
                      <Feather name="clock" size={12} color={COLORS.white} />
                      <Text style={styles.timeChipSelectedText}>{time}</Text>
                      <TouchableOpacity
                        onPress={() => removeTime(time)}
                        accessibilityRole="button"
                        accessibilityLabel={t('medications.removeTime')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="x" size={12} color={COLORS.white} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addTimeBtn}
                    onPress={() => setTimePickerVisible(true)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('medications.addCustomTime')}
                  >
                    <Feather name="plus" size={14} color={COLORS.primary} />
                    <Text style={styles.addTimeBtnText}>{t('medications.addCustomTime')}</Text>
                  </TouchableOpacity>
                </View>
                {timePickerVisible && (
                  <DateTimePicker
                    value={new Date()}
                    mode="time"
                    is24Hour
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onTimePicked}
                  />
                )}
                {Platform.OS === 'ios' && timePickerVisible && (
                  <TouchableOpacity
                    style={styles.iosPickerDone}
                    onPress={() => setTimePickerVisible(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.iosPickerDoneText}>{t('common.done')}</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            <Text style={styles.fieldLabel}>{t('medications.mealTiming')}</Text>
            <View style={styles.mealRow}>
              {MEAL_TIMING_OPTIONS.map(opt => {
                const isActive = newInstructions === t(opt.labelKey);
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.mealChip, isActive && styles.mealChipActive]}
                    onPress={() => applyMealTiming(opt.labelKey)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.mealChipText, isActive && styles.mealChipTextActive]}>
                      {t(opt.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={styles.mealChipClear}
                onPress={clearMealTiming}
                activeOpacity={0.7}
              >
                <Feather name="x" size={12} color={COLORS.textLight} />
                <Text style={styles.mealChipClearText}>{t('medications.mealTiming.clear')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>{t('medications.instructions')}</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={newInstructions}
              onChangeText={setNewInstructions}
              placeholder={t('medications.instructionsPlaceholder')}
              placeholderTextColor={COLORS.textLight}
              multiline
              numberOfLines={2}
            />

            <TouchableOpacity
              style={[styles.saveBtn, (!newName.trim() || !newDosage.trim()) && styles.saveBtnDisabled]}
              onPress={handleAddMedication}
              disabled={!newName.trim() || !newDosage.trim() || saving}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={18} color={COLORS.white} />
              <Text style={styles.saveBtnText}>{t('medications.addNew')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setShowAddForm(true)}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={20} color={COLORS.primary} />
            <Text style={styles.addBtnText}>{t('medications.addNew')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.md, paddingBottom: SPACING.xxl },

  // Progress Card
  progressCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: SPACING.sm,
    ...SHADOWS.card,
  },
  progressLeft: { alignItems: 'center' },
  ringContainer: { width: 80, height: 80, position: 'relative' },
  ringOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 6,
    borderColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringOuterComplete: { borderColor: COLORS.statusNormalBg },
  ringInner: { justifyContent: 'center', alignItems: 'center' },
  ringNumber: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  ringNumberComplete: { color: COLORS.statusNormal },
  progressArc: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 6,
  },
  progressRight: { flex: 1, gap: 6 },
  progressTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  progressSubtitle: { fontSize: 14, color: COLORS.textSecondary },
  allTakenBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.statusNormalBg,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
  },
  allTakenText: { fontSize: 13, fontWeight: '600', color: COLORS.statusNormal },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  streakFire: { fontSize: 14 },
  streakText: { fontSize: 13, fontWeight: '600', color: COLORS.statusMonitor },

  // Notification badge
  notifBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
    marginBottom: SPACING.md,
  },
  notifText: { fontSize: 12, fontWeight: '500', color: COLORS.primary },

  // Medication Card
  medCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.card,
  },
  medCardTaken: {
    borderLeftColor: COLORS.statusNormal,
    opacity: 0.85,
  },
  medCardOverdue: {
    borderLeftColor: COLORS.statusUrgent,
    backgroundColor: '#FFFBFB',
  },
  medCardPaused: {
    borderLeftColor: COLORS.border,
    opacity: 0.6,
  },
  medCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  medCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  medIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  medIconTaken: { backgroundColor: COLORS.statusNormal },
  medIconOverdue: { backgroundColor: COLORS.statusUrgentBg },
  medIconText: { fontSize: 20 },
  medInfo: { flex: 1, gap: 2 },
  medName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  medNameTaken: { textDecorationLine: 'line-through', color: COLORS.textSecondary },
  medDosage: { fontSize: 13, color: COLORS.textSecondary },
  medCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  undoBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pausedBadge: {
    backgroundColor: COLORS.borderLight,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: RADIUS.full,
  },
  pausedText: { fontSize: 11, fontWeight: '500', color: COLORS.textLight },

  // Med Details
  medDetails: { marginTop: 10, marginLeft: 54, gap: 6 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { fontSize: 13, color: COLORS.textSecondary },
  timeTextOverdue: { color: COLORS.statusUrgent, fontWeight: '600' },
  takenTimeText: { fontSize: 13, color: COLORS.statusNormal, fontWeight: '500' },
  instructionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  instructionText: { fontSize: 12, color: COLORS.textLight, flex: 1, lineHeight: 16 },

  // Take button
  takeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    marginTop: 12,
  },
  takeBtnOverdue: { backgroundColor: COLORS.statusUrgent },
  takeBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.white },

  // Med bottom actions
  medActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  medActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  medActionText: { fontSize: 12, color: COLORS.textLight },

  // Streak indicator
  streakIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  streakIndicatorText: { fontSize: 11, fontWeight: '700', color: COLORS.statusMonitor },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
    gap: 8,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textSecondary },
  emptyDesc: { fontSize: 13, color: COLORS.textLight, textAlign: 'center', maxWidth: 240 },

  // Add button
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    marginTop: SPACING.sm,
  },
  addBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },

  // Add Form
  addFormCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.sm,
    ...SHADOWS.card,
  },
  addFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  addFormTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.sm,
    padding: SPACING.md - 2,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  multiline: { minHeight: 60, textAlignVertical: 'top' },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  freqChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  freqChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  freqChipText: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary },
  freqChipTextActive: { color: COLORS.primary, fontWeight: '600' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    minWidth: 64,
    alignItems: 'center',
  },
  timeChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  timeChipText: { fontSize: 13, fontWeight: '500', color: COLORS.textSecondary },
  timeChipTextActive: { color: COLORS.primary, fontWeight: '700' },

  // --- New: days-of-week toggles ---
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  dayChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    minWidth: 44,
    alignItems: 'center',
  },
  dayChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  dayChipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  dayChipTextActive: { color: COLORS.primary, fontWeight: '700' },

  // --- New: flexible time picker ---
  hintText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textLight,
    marginTop: 2,
    marginBottom: 6,
  },
  timeChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  timeChipSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  timeChipSelectedText: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  addTimeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.full,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  addTimeBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  iosPickerDone: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primary,
    marginTop: 4,
  },
  iosPickerDoneText: { fontSize: 13, fontWeight: '700', color: COLORS.white },

  // --- New: meal-timing chips above instructions ---
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  mealChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  mealChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  mealChipText: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary },
  mealChipTextActive: { color: COLORS.primary, fontWeight: '700' },
  mealChipClear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: RADIUS.full,
  },
  mealChipClearText: { fontSize: 11, fontWeight: '600', color: COLORS.textLight },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    marginTop: SPACING.lg,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.white },
});
