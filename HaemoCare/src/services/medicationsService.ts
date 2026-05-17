/**
 * Real Supabase impl of medication reminders + adherence events.
 *
 * Mirrors the public surface of the matching mock CRUD in src/mock/services.ts
 * so the UI can swap based on isMockMode without branching call sites.
 *
 * Adherence model:
 *  - `medication_reminders` holds the schedule, plus the same taken_today /
 *    streak_days fields the existing UI already reads. We keep populating
 *    those for UI parity.
 *  - `medication_adherence_events` is the authoritative history. Every
 *    markMedicationTaken / markMedicationSkipped call writes one row.
 *  - Clinician adherence widget aggregates rows from the events table for
 *    the last N days.
 */

import { supabase } from '../config/supabase';
import type {
  MedicationReminder,
  MedicationAdherenceEvent,
  AdherenceEventSource,
} from '../types/database';

export interface MedicationReminderInput {
  medication_name: string;
  dosage: string;
  frequency: MedicationReminder['frequency'];
  reminder_times: string[];
  instructions?: string;
}

function startOfTodayISO(now = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function isSameLocalDay(aISO: string, bISO: string): boolean {
  const a = new Date(aISO);
  const b = new Date(bISO);
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/**
 * Loads all reminders for a user, freshening `taken_today` to only contain
 * today's confirmations (rolls over the field after midnight).
 */
export async function getMedicationReminders(
  userId: string
): Promise<MedicationReminder[]> {
  const { data, error } = await supabase
    .from('medication_reminders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as MedicationReminder[];
  const now = new Date().toISOString();
  // Day-rollover: drop any taken_today timestamps that aren't from today.
  return rows.map(r => ({
    ...r,
    taken_today: (r.taken_today ?? []).filter(t => isSameLocalDay(t, now)),
  })).sort((a, b) =>
    (a.reminder_times[0] || '').localeCompare(b.reminder_times[0] || '')
  );
}

export async function createMedicationReminder(
  userId: string,
  data: MedicationReminderInput
): Promise<MedicationReminder> {
  const { data: row, error } = await supabase
    .from('medication_reminders')
    .insert({
      user_id: userId,
      medication_name: data.medication_name,
      dosage: data.dosage,
      frequency: data.frequency,
      reminder_times: data.reminder_times,
      instructions: data.instructions ?? '',
      is_active: true,
      taken_today: [],
      streak_days: 0,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return row as MedicationReminder;
}

export async function updateMedicationReminder(
  _userId: string,
  id: string,
  patch: Partial<MedicationReminder>
): Promise<MedicationReminder> {
  // Strip immutable fields out of the patch.
  const {
    id: _i, user_id: _u, created_at: _c, updated_at: _ua, ...safe
  } = patch;
  const { data, error } = await supabase
    .from('medication_reminders')
    .update(safe)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MedicationReminder;
}

export async function deleteMedicationReminder(
  _userId: string,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from('medication_reminders')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Marks the next outstanding dose as taken: appends to taken_today and
 * inserts an adherence event. scheduled_at is reconstructed from the
 * reminder_times slot at position taken_today.length (the next pending dose).
 */
export async function markMedicationTaken(
  userId: string,
  id: string,
  source: AdherenceEventSource = 'tap'
): Promise<MedicationReminder> {
  const { data: existing, error: e1 } = await supabase
    .from('medication_reminders')
    .select('*')
    .eq('id', id)
    .single();
  if (e1) throw new Error(e1.message);
  const row = existing as MedicationReminder;
  const now = new Date();
  // Roll over: drop yesterday's timestamps.
  const today = (row.taken_today ?? []).filter(t => isSameLocalDay(t, now.toISOString()));
  const slot = today.length; // 0-based index of the dose we're confirming
  const scheduledTime = row.reminder_times[slot] ?? row.reminder_times[0] ?? '08:00';
  const [hh, mm] = scheduledTime.split(':').map(Number);
  const scheduledAt = new Date(now);
  scheduledAt.setHours(hh ?? 0, mm ?? 0, 0, 0);

  const nowISO = now.toISOString();
  const newTakenToday = [...today, nowISO];
  // Streak: if any of yesterday's adherence events were taken, +1; otherwise
  // hold the value steady. We only "increment" when transitioning from 0 to 1
  // dose today (the first confirmation of the day).
  const streak = today.length === 0
    ? (row.streak_days ?? 0) + 1
    : (row.streak_days ?? 0);

  const [{ data: updated, error: e2 }, eventResult] = await Promise.all([
    supabase
      .from('medication_reminders')
      .update({ taken_today: newTakenToday, streak_days: streak })
      .eq('id', id)
      .select()
      .single(),
    supabase
      .from('medication_adherence_events')
      .insert({
        user_id: userId,
        reminder_id: id,
        scheduled_at: scheduledAt.toISOString(),
        taken_at: nowISO,
        source,
      }),
  ]);
  if (e2) throw new Error(e2.message);
  if (eventResult.error) throw new Error(eventResult.error.message);
  return updated as MedicationReminder;
}

/**
 * Removes the most recent taken_today timestamp and the matching adherence
 * event for that scheduled slot. Used by the "undo" affordance.
 */
export async function unmarkMedicationTaken(
  userId: string,
  id: string
): Promise<MedicationReminder> {
  const { data: existing, error: e1 } = await supabase
    .from('medication_reminders')
    .select('*')
    .eq('id', id)
    .single();
  if (e1) throw new Error(e1.message);
  const row = existing as MedicationReminder;
  const now = new Date();
  const today = (row.taken_today ?? []).filter(t => isSameLocalDay(t, now.toISOString()));
  if (today.length === 0) return row;
  const newTakenToday = today.slice(0, -1);
  // If we just removed the only dose of the day, undo the streak bump too.
  const streak = newTakenToday.length === 0
    ? Math.max(0, (row.streak_days ?? 0) - 1)
    : (row.streak_days ?? 0);

  const { data: updated, error: e2 } = await supabase
    .from('medication_reminders')
    .update({ taken_today: newTakenToday, streak_days: streak })
    .eq('id', id)
    .select()
    .single();
  if (e2) throw new Error(e2.message);

  // Best-effort delete of the most recent taken_at event for this user+reminder.
  // We use the latest taken_at row rather than scheduled_at because undo can
  // happen across the day boundary and we always want to remove the user's
  // most recent confirmation.
  const { data: latest, error: e3 } = await supabase
    .from('medication_adherence_events')
    .select('id')
    .eq('user_id', userId)
    .eq('reminder_id', id)
    .not('taken_at', 'is', null)
    .order('taken_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!e3 && latest?.id) {
    await supabase
      .from('medication_adherence_events')
      .delete()
      .eq('id', latest.id);
  }
  return updated as MedicationReminder;
}

/**
 * Marks the next outstanding dose as explicitly skipped. Writes an
 * adherence event with skipped_at set. Does not touch taken_today.
 */
export async function markMedicationSkipped(
  userId: string,
  id: string,
  source: AdherenceEventSource = 'tap'
): Promise<void> {
  const { data: existing, error: e1 } = await supabase
    .from('medication_reminders')
    .select('reminder_times, taken_today')
    .eq('id', id)
    .single();
  if (e1) throw new Error(e1.message);
  const row = existing as Pick<MedicationReminder, 'reminder_times' | 'taken_today'>;
  const now = new Date();
  const today = (row.taken_today ?? []).filter(t => isSameLocalDay(t, now.toISOString()));
  const slot = today.length;
  const scheduledTime = row.reminder_times[slot] ?? row.reminder_times[0] ?? '08:00';
  const [hh, mm] = scheduledTime.split(':').map(Number);
  const scheduledAt = new Date(now);
  scheduledAt.setHours(hh ?? 0, mm ?? 0, 0, 0);

  const { error } = await supabase
    .from('medication_adherence_events')
    .insert({
      user_id: userId,
      reminder_id: id,
      scheduled_at: scheduledAt.toISOString(),
      skipped_at: now.toISOString(),
      source,
    });
  if (error) throw new Error(error.message);
}

/**
 * Reads adherence events for a user since `sinceISO`. Used by patient-side
 * analytics (if needed) and as the underlying primitive for the clinician
 * aggregation below.
 */
export async function getAdherenceEvents(
  userId: string,
  sinceISO: string
): Promise<MedicationAdherenceEvent[]> {
  const { data, error } = await supabase
    .from('medication_adherence_events')
    .select('*')
    .eq('user_id', userId)
    .gte('scheduled_at', sinceISO)
    .order('scheduled_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MedicationAdherenceEvent[];
}

export interface AdherenceWindowSummary {
  /** Number of distinct doses confirmed taken in the window. */
  takenCount: number;
  /** Number of distinct doses explicitly skipped in the window. */
  skippedCount: number;
  /** Calendar days in the window (inclusive of today). */
  days: number;
  /**
   * Per-day taken counts, ordered oldest → newest. Length == `days`.
   * Used for sparkline rendering in the clinician card.
   */
  perDayTaken: number[];
}

/**
 * Aggregates per-patient adherence over the last `days` (default 7) days
 * inclusive of today. Computed in the service layer rather than via a
 * database view so we don't add migrations for what is one-shot math.
 */
export async function getAdherenceSummaryForPatient(
  userId: string,
  days: number = 7,
  now: Date = new Date()
): Promise<AdherenceWindowSummary> {
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const events = await getAdherenceEvents(userId, cutoff.toISOString());

  const perDayTaken = new Array(days).fill(0) as number[];
  let takenCount = 0;
  let skippedCount = 0;
  for (const e of events) {
    const eDate = new Date(e.scheduled_at);
    const dayIndex = Math.floor(
      (eDate.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (dayIndex < 0 || dayIndex >= days) continue;
    if (e.taken_at) {
      perDayTaken[dayIndex]++;
      takenCount++;
    } else if (e.skipped_at) {
      skippedCount++;
    }
  }
  return { takenCount, skippedCount, days, perDayTaken };
}
