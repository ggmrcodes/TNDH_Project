/**
 * Initializes local-fire medication reminders for the signed-in patient.
 *
 * Responsibilities (per brief, see docs/superpowers/specs/
 * 2026-05-17-medication-reminders-wire-up-brief.md):
 *  1. On first patient login after install: politely ask for notification
 *     permission with a bilingual rationale (don't fire the OS prompt cold).
 *  2. Ensure the Android notification channel exists.
 *  3. Rehydrate the next ~14 days of local notifications from the user's
 *     current reminder list.
 *  4. Register a tap-handler that deep-links to MedicationRemindersScreen
 *     and surfaces a "Did you take it?" action sheet.
 *
 * This component renders nothing — it only runs effects. Mounted inside
 * NavigationContainer so it has access to navigation + LanguageContext.
 */

import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import * as notificationsService from '../services/notifications';
import * as medicationsService from '../services/medicationsService';
import * as mockServices from '../mock/services';
import {
  SchedulableTriggerInputTypes,
} from 'expo-notifications';
import type { MedicationReminder, AdherenceEventSource } from '../types/database';
import type { TranslationKey } from '../i18n';

const SNOOZE_MIN = 10;
// Per-user-id flag so we only ask once per session. If a user denies, we
// honor that for the session; native settings is the right place to flip.
const askedThisSession = new Set<string>();

export default function NotificationGate() {
  const { user, role, isMockMode } = useAuth();
  const { t, language } = useLanguage();
  const navigation = useNavigation<any>();
  const didInitForUserRef = useRef<string | null>(null);
  // Latest language ref so the tap-handler always builds strings in the
  // user's current language without re-subscribing.
  const langRef = useRef(language);
  langRef.current = language;

  // Init: permission rationale + channel + rehydrate. Runs once per user.
  useEffect(() => {
    if (!user || role !== 'patient') return;
    if (didInitForUserRef.current === user.id) return;
    didInitForUserRef.current = user.id;

    let cancelled = false;
    (async () => {
      notificationsService.ensureNotificationHandler();
      await notificationsService.ensureAndroidChannel();

      // Pre-permission rationale: only show if we haven't asked yet this
      // session and the OS hasn't already granted permission.
      const settings = await Notifications.getPermissionsAsync();
      if (!settings.granted && settings.canAskAgain && !askedThisSession.has(user.id)) {
        askedThisSession.add(user.id);
        await new Promise<void>((resolve) => {
          Alert.alert(
            t('reminders.permission.title' as TranslationKey),
            t('reminders.permission.body' as TranslationKey),
            [
              {
                text: t('reminders.permission.skip' as TranslationKey),
                style: 'cancel',
                onPress: () => resolve(),
              },
              {
                text: t('reminders.permission.allow' as TranslationKey),
                onPress: async () => {
                  await notificationsService.requestPermission();
                  resolve();
                },
              },
            ],
            { cancelable: false }
          );
        });
      }

      if (cancelled) return;

      // Always attempt rehydration; if perm is denied the scheduling calls
      // become no-ops on iOS and silent failures on Android. We don't bail.
      try {
        const reminders = isMockMode
          ? await mockServices.getMedicationReminders(user.id)
          : await medicationsService.getMedicationReminders(user.id);
        const buildStrings = (r: MedicationReminder) => ({
          title: t('reminders.notif.title' as TranslationKey, { med: r.medication_name }),
          body: t('reminders.notif.body' as TranslationKey, { dose: r.dosage }),
        });
        await notificationsService.rehydrateFromSchedule(reminders, { buildStrings });
      } catch (err) {
        console.warn('NotificationGate rehydrate failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, role, isMockMode, t]);

  // Tap-handler. Registered once; uses navigation + langRef inside callbacks
  // to stay current without re-subscribing.
  useEffect(() => {
    if (!user || role !== 'patient') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { kind?: string; reminderId?: string; medicationName?: string; time?: string; type?: string; linkId?: string }
        | undefined;

      // Phase 4 — chat push notification tap: route patient to Messages tab.
      // v1 routes to the inbox; direct-to-thread (requires otherPartyName + status
      // from a DB fetch) is a future refinement.
      if (data?.type === 'chat') {
        try {
          navigation.navigate('MainTabs', { screen: 'Messages' });
        } catch (err) {
          console.warn('navigate to Messages tab failed:', err);
        }
        return;
      }

      if (data?.kind !== 'medication-reminder' || !data.reminderId) return;

      // Navigate to MedicationRemindersScreen. The screen re-loads on focus
      // so the action-sheet result will be reflected immediately.
      try {
        navigation.navigate('MedicationReminders');
      } catch (err) {
        console.warn('navigate to MedicationReminders failed:', err);
      }

      const medName = data.medicationName ?? '';
      Alert.alert(
        t('reminders.actionSheet.title' as TranslationKey, { med: medName }),
        undefined,
        [
          {
            text: t('reminders.actionSheet.snooze' as TranslationKey),
            onPress: async () => {
              try {
                const fireAt = new Date(Date.now() + SNOOZE_MIN * 60 * 1000);
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: response.notification.request.content.title ?? '',
                    body: response.notification.request.content.body ?? '',
                    data: response.notification.request.content.data,
                    sound: 'default',
                  },
                  trigger: { type: SchedulableTriggerInputTypes.DATE, date: fireAt },
                });
              } catch (err) {
                console.warn('snooze schedule failed:', err);
              }
            },
          },
          {
            text: t('reminders.actionSheet.skipped' as TranslationKey),
            style: 'destructive',
            onPress: async () => {
              await writeAdherence(user.id, data.reminderId!, 'skip', 'notification', isMockMode);
            },
          },
          {
            text: t('reminders.actionSheet.taken' as TranslationKey),
            onPress: async () => {
              await writeAdherence(user.id, data.reminderId!, 'take', 'notification', isMockMode);
            },
          },
        ],
        { cancelable: true }
      );
    });
    return () => { sub.remove(); };
  }, [user, role, navigation, t, isMockMode]);

  return null;
}

async function writeAdherence(
  userId: string,
  reminderId: string,
  action: 'take' | 'skip',
  source: AdherenceEventSource,
  isMockMode: boolean
): Promise<void> {
  try {
    if (action === 'take') {
      if (isMockMode) {
        await mockServices.markMedicationTakenWithEvent(userId, reminderId, source);
      } else {
        await medicationsService.markMedicationTaken(userId, reminderId, source);
      }
    } else {
      if (isMockMode) {
        await mockServices.markMedicationSkipped(userId, reminderId, source);
      } else {
        await medicationsService.markMedicationSkipped(userId, reminderId, source);
      }
    }
  } catch (err) {
    console.warn(`writeAdherence ${action} failed:`, err);
  }
}
