/**
 * Local-fire notification service for medication reminders.
 *
 * Wraps expo-notifications. All notifications are scheduled on-device
 * (no remote push). On Android, ensures a dedicated high-importance channel
 * exists before scheduling.
 *
 * Caveats:
 *  - Local notifications are not supported in Expo Go on iOS (SDK 53+).
 *    They work in TestFlight / standalone dev builds but silently no-op
 *    in Expo Go iPhone testing. See EXPO_GO_TESTER_GUIDE.md.
 *  - All schedules assume Asia/Bangkok timezone. We reschedule the next
 *    14 days from the device clock; if the device TZ changes, callers
 *    must invoke rehydrateFromSchedule again.
 *  - Per the brief, we rehydrate ~14 days of one-shot notifications instead
 *    of using DailyTriggerInput / WeeklyTriggerInput. This keeps payloads
 *    addressable (one identifier per dose) so editing/deleting a med can
 *    cancel exactly the right notifications.
 *
 * Push token registration (Phase 4):
 *  - registerPushToken() upserts an Expo push token into push_tokens for
 *    both patient and clinician roles. It is safe on web (returns early),
 *    on simulators (getExpoPushTokenAsync returns null gracefully), and
 *    when permission is denied. All failures are non-fatal (console.warn).
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from '../config/supabase';
import {
  AndroidImportance,
  SchedulableTriggerInputTypes,
} from 'expo-notifications';
import type { MedicationReminder, WeekdayCode } from '../types/database';

export const MED_CHANNEL_ID = 'medication-reminders';
export const REHYDRATE_DAYS = 14;

// All scheduled notifications carry { kind: 'medication-reminder', ... } so we
// can identify and cancel them without touching unrelated notifications.
export interface MedicationNotificationData {
  kind: 'medication-reminder';
  reminderId: string;
  medicationName: string;
  scheduledAt: string; // ISO timestamp of the planned fire time
  time: string; // "HH:MM" original time-of-day for the dose
}

export interface ScheduleStrings {
  /** Notification title, e.g. "Time to take {{med}}". */
  title: string;
  /** Body text, e.g. "Take {{dose}}. Tap to confirm." */
  body: string;
}

// Module-level handler init guard.
let handlerSet = false;

/**
 * Sets the foreground-presentation handler so reminders surface even when
 * the app is open. Safe to call multiple times; only runs once.
 */
export function ensureNotificationHandler(): void {
  if (handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Requests notification permission. Returns true if granted.
 * On iOS Expo Go this may resolve true but notifications still won't fire.
 */
export async function requestPermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  if (!settings.canAskAgain) return false;
  const ask = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });
  return ask.granted;
}

/**
 * Creates the Android notification channel for med reminders if missing.
 * No-op on iOS.
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(MED_CHANNEL_ID, {
    name: 'Medication reminders',
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0B6E6E',
  });
}

/**
 * Parses an "HH:MM" string into { hour, minute }. Returns null on bad input.
 */
function parseTime(t: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Generates the next N daily firing dates for a given HH:MM time.
 * Includes today only if the time is still in the future. Always counts
 * up to N future dates.
 */
export function nextDailyFireDates(
  time: string,
  fromDate: Date,
  days: number = REHYDRATE_DAYS
): Date[] {
  const parsed = parseTime(time);
  if (!parsed) return [];
  const out: Date[] = [];
  const cursor = new Date(fromDate);
  cursor.setSeconds(0, 0);

  // Start with today at HH:MM; if it's already past, skip.
  const first = new Date(cursor);
  first.setHours(parsed.hour, parsed.minute, 0, 0);
  if (first.getTime() > fromDate.getTime()) out.push(first);

  while (out.length < days) {
    const last = out.length > 0 ? out[out.length - 1] : first;
    const next = new Date(last);
    next.setDate(next.getDate() + 1);
    next.setHours(parsed.hour, parsed.minute, 0, 0);
    out.push(next);
  }
  return out.slice(0, days);
}

/**
 * Computes weekly firing dates (one per week for N/7 weeks) at HH:MM,
 * starting from the next future occurrence of the same weekday as fromDate.
 * We don't ask the user for a weekday in v1 (brief locks the UI), so
 * weekly reminders fire on the same weekday they were created.
 */
export function nextWeeklyFireDates(
  time: string,
  fromDate: Date,
  days: number = REHYDRATE_DAYS
): Date[] {
  const parsed = parseTime(time);
  if (!parsed) return [];
  const weeks = Math.max(1, Math.ceil(days / 7));
  const out: Date[] = [];
  const first = new Date(fromDate);
  first.setHours(parsed.hour, parsed.minute, 0, 0);
  if (first.getTime() <= fromDate.getTime()) {
    first.setDate(first.getDate() + 7);
  }
  out.push(first);
  while (out.length < weeks) {
    const next = new Date(out[out.length - 1]);
    next.setDate(next.getDate() + 7);
    out.push(next);
  }
  return out;
}

export interface ScheduleReminderInput {
  reminder: MedicationReminder;
  strings: ScheduleStrings;
  /** Optional "now" override for tests. */
  now?: Date;
  /** Override channel (tests). */
  channelId?: string;
  /** Number of days to schedule forward. Defaults to REHYDRATE_DAYS. */
  days?: number;
}

// JS getDay() codes (Sunday=0) mapped to our ISO-style weekday strings.
const WEEKDAY_FROM_JS_DAY: Record<number, WeekdayCode> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
};

/** True when the given date's weekday is in `days_of_week` (or `days_of_week`
 *  is null/empty, meaning "every day" by convention). */
export function isOnActiveDay(
  date: Date,
  daysOfWeek: WeekdayCode[] | null | undefined
): boolean {
  if (!daysOfWeek || daysOfWeek.length === 0) return true;
  const code = WEEKDAY_FROM_JS_DAY[date.getDay()];
  return daysOfWeek.includes(code);
}

/**
 * Schedules one-shot DATE notifications for the next ~14 days for this
 * reminder. Skips the 'as_needed' frequency (no fixed schedule). Returns the
 * list of created notification identifiers.
 *
 * Title/body interpolation: callers should pass strings with {{med}} and
 * {{dose}} placeholders already resolved (LanguageContext lives in the
 * component layer; this module stays presentation-agnostic).
 */
export async function scheduleReminder(
  input: ScheduleReminderInput
): Promise<string[]> {
  const { reminder, strings, now = new Date(), days = REHYDRATE_DAYS } = input;
  if (!reminder.is_active) return [];
  if (reminder.frequency === 'as_needed') return [];
  if (!reminder.reminder_times || reminder.reminder_times.length === 0) return [];

  const channelId = input.channelId ?? MED_CHANNEL_ID;
  const isWeekly = reminder.frequency === 'weekly';
  // For weekly, take only the first time slot (UI allows multi-select but
  // weekly + multi-times is ambiguous — pick the earliest).
  const times = isWeekly
    ? reminder.reminder_times.slice(0, 1)
    : reminder.reminder_times;

  const ids: string[] = [];
  const hasExplicitDays = !!(reminder.days_of_week && reminder.days_of_week.length > 0);
  for (const time of times) {
    // If the patient picked specific days_of_week, compute daily candidates
    // and filter — works for both daily and weekly frequency. Without
    // days_of_week, weekly retains its "same weekday as creation" behavior.
    const rawDates = (isWeekly && !hasExplicitDays)
      ? nextWeeklyFireDates(time, now, days)
      : nextDailyFireDates(time, now, days);
    const dates = hasExplicitDays
      ? rawDates.filter(d => isOnActiveDay(d, reminder.days_of_week))
      : rawDates;
    for (const date of dates) {
      const data: MedicationNotificationData = {
        kind: 'medication-reminder',
        reminderId: reminder.id,
        medicationName: reminder.medication_name,
        scheduledAt: date.toISOString(),
        time,
      };
      const trigger: Notifications.DateTriggerInput = {
        type: SchedulableTriggerInputTypes.DATE,
        date,
        ...(Platform.OS === 'android' ? { channelId } : {}),
      };
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: strings.title,
          body: strings.body,
          data: data as unknown as Record<string, unknown>,
          sound: 'default',
        },
        trigger,
      });
      ids.push(id);
    }
  }
  return ids;
}

/**
 * Cancels every scheduled notification whose data.reminderId matches.
 */
export async function cancelReminder(reminderId: string): Promise<number> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  let count = 0;
  for (const n of all) {
    const data = n.content?.data as unknown as MedicationNotificationData | undefined;
    if (data?.kind === 'medication-reminder' && data.reminderId === reminderId) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
      count++;
    }
  }
  return count;
}

/**
 * Cancels all scheduled medication-reminder notifications (does not touch
 * notifications scheduled by other modules).
 */
export async function cancelAllMedicationReminders(): Promise<number> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  let count = 0;
  for (const n of all) {
    const data = n.content?.data as unknown as MedicationNotificationData | undefined;
    if (data?.kind === 'medication-reminder') {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
      count++;
    }
  }
  return count;
}

export interface RehydrateOptions {
  /** "now" override for tests. */
  now?: Date;
  /** Number of days forward to schedule. */
  days?: number;
  /**
   * Builds title/body strings for a given reminder. Called once per reminder
   * so the caller can localize on the fly.
   */
  buildStrings: (reminder: MedicationReminder) => ScheduleStrings;
}

export interface RehydrateResult {
  cancelledCount: number;
  scheduledCount: number;
  perReminder: Array<{ reminderId: string; ids: string[] }>;
}

/**
 * Cancels every existing medication-reminder notification and reschedules
 * the next N days from the current list. Idempotent — running it twice in
 * a row produces the same end state without duplicate notifications.
 */
export async function rehydrateFromSchedule(
  reminders: MedicationReminder[],
  options: RehydrateOptions
): Promise<RehydrateResult> {
  const cancelledCount = await cancelAllMedicationReminders();
  const perReminder: RehydrateResult['perReminder'] = [];
  let scheduledCount = 0;
  for (const reminder of reminders) {
    const ids = await scheduleReminder({
      reminder,
      strings: options.buildStrings(reminder),
      now: options.now,
      days: options.days,
    });
    perReminder.push({ reminderId: reminder.id, ids });
    scheduledCount += ids.length;
  }
  return { cancelledCount, scheduledCount, perReminder };
}

/**
 * Convenience: clears every scheduled notification managed by this module.
 * Used on sign-out to avoid leaking a previous user's reminders.
 */
export async function cancelAll(): Promise<void> {
  await cancelAllMedicationReminders();
}

/**
 * Registers the device's Expo push token in the push_tokens table for
 * the given user. Safe to call for both patient and clinician roles.
 *
 * Guards:
 *  - Web: returns immediately (Expo push tokens don't exist on web).
 *  - No EAS projectId in app config: returns silently.
 *  - Permission denied: returns without upsert.
 *  - Simulator / no push entitlement: getExpoPushTokenAsync may throw;
 *    the outer try/catch swallows and warns — non-fatal.
 */
export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const granted = await requestPermission();
    if (!granted) return;
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
        ?.eas?.projectId ??
      (Constants.easConfig as { projectId?: string } | undefined)?.projectId;
    if (!projectId) return;
    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResult?.data;
    if (!token) return;
    await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );
  } catch (e) {
    // Non-fatal — push is best-effort.
    console.warn('push token registration failed', e);
  }
}
