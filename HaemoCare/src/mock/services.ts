import { Profile, Transfusion, SymptomLog, Appointment, AppointmentSource, MedicationReminder } from '../types/database';

interface AppointmentInput {
  scheduled_date: string;
  hospital: string;
  notes?: string;
  linked_transfusion_id?: string | null;
  source?: AppointmentSource;
  external_id?: string | null;
  external_source_name?: string | null;
}
import {
  MOCK_PROFILE,
  MOCK_TRANSFUSIONS,
  MOCK_SYMPTOM_LOGS,
  MOCK_APPOINTMENTS,
  MOCK_MEDICATION_REMINDERS,
} from './data';

// Mutable copies so the user can add data during the session
let profile = { ...MOCK_PROFILE };
let transfusions = [...MOCK_TRANSFUSIONS];
let symptomLogs = [...MOCK_SYMPTOM_LOGS];
let appointments = [...MOCK_APPOINTMENTS];
let medicationReminders = MOCK_MEDICATION_REMINDERS.map(m => ({ ...m }));

let nextId = 100;
const genId = () => `mock-${nextId++}`;

// ── Profile ──────────────────────────────────────────────────
export async function getProfile(): Promise<Profile | null> {
  return profile;
}

export async function createProfile(
  _userId: string,
  data: Partial<Profile>
): Promise<Profile> {
  const patientId = data.patient_id || `HC-${Math.floor(Math.random() * 999999 + 1).toString().padStart(6, '0')}`;
  profile = { ...profile, ...data, patient_id: patientId, updated_at: new Date().toISOString() };
  return profile;
}

export async function updateProfile(
  _userId: string,
  data: Partial<Profile>
): Promise<Profile> {
  profile = { ...profile, ...data, updated_at: new Date().toISOString() };
  return profile;
}

// ── Transfusions ─────────────────────────────────────────────
export async function getTransfusions(): Promise<Transfusion[]> {
  return [...transfusions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export async function getTransfusionById(id: string): Promise<Transfusion | null> {
  return transfusions.find((t) => t.id === id) ?? null;
}

export async function getLatestTransfusion(): Promise<Transfusion | null> {
  const sorted = [...transfusions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  return sorted[0] ?? null;
}

export async function createTransfusion(
  _userId: string,
  data: Omit<Transfusion, 'id' | 'user_id' | 'created_at'>
): Promise<Transfusion> {
  const tx: Transfusion = {
    id: genId(),
    user_id: profile.user_id,
    created_at: new Date().toISOString(),
    ...data,
  };
  transfusions.unshift(tx);
  return tx;
}

// ── Symptom Logs ─────────────────────────────────────────────
export async function getSymptomLogs(
  _userId: string,
  limit?: number
): Promise<SymptomLog[]> {
  const sorted = [...symptomLogs].sort(
    (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
  );
  return limit ? sorted.slice(0, limit) : sorted;
}

export async function getSymptomLogsByTransfusion(
  transfusionId: string
): Promise<SymptomLog[]> {
  return symptomLogs
    .filter((l) => l.transfusion_id === transfusionId)
    .sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());
}

export async function getSymptomLogsSinceDate(
  _userId: string,
  sinceDate: string
): Promise<SymptomLog[]> {
  const since = new Date(sinceDate).getTime();
  return symptomLogs
    .filter((l) => new Date(l.logged_at).getTime() >= since)
    .sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());
}

export async function getSymptomLogById(id: string): Promise<SymptomLog | null> {
  return symptomLogs.find((l) => l.id === id) ?? null;
}

export async function createSymptomLog(
  _userId: string,
  log: {
    transfusion_id?: string | null;
    symptoms: string[];
    severity_scores: Record<string, number>;
    outcome: 'normal' | 'monitor' | 'urgent';
    notes?: string;
  }
): Promise<SymptomLog> {
  const entry: SymptomLog = {
    id: genId(),
    user_id: profile.user_id,
    transfusion_id: log.transfusion_id ?? null,
    logged_at: new Date().toISOString(),
    symptoms: log.symptoms,
    severity_scores: log.severity_scores,
    outcome: log.outcome,
    notes: log.notes ?? '',
    created_at: new Date().toISOString(),
  };
  symptomLogs.unshift(entry);
  return entry;
}

// ── Appointments ─────────────────────────────────────────────
export async function getUpcomingAppointments(): Promise<Appointment[]> {
  const now = Date.now();
  return appointments
    .filter((a) => new Date(a.scheduled_date).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime());
}

export async function getPastAppointments(): Promise<Appointment[]> {
  const now = Date.now();
  return appointments
    .filter((a) => new Date(a.scheduled_date).getTime() < now)
    .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());
}

export async function getAppointmentById(id: string): Promise<Appointment | null> {
  return appointments.find((a) => a.id === id) ?? null;
}

export async function createAppointment(
  _userId: string,
  appt: AppointmentInput
): Promise<Appointment> {
  const entry: Appointment = {
    id: genId(),
    user_id: profile.user_id,
    scheduled_date: appt.scheduled_date,
    hospital: appt.hospital,
    notes: appt.notes ?? '',
    linked_transfusion_id: appt.linked_transfusion_id ?? null,
    source: appt.source ?? 'manual',
    external_id: appt.external_id ?? null,
    external_source_name: appt.external_source_name ?? null,
    created_at: new Date().toISOString(),
  };
  appointments.push(entry);
  return entry;
}

export async function upsertAppointmentByExternalId(
  _userId: string,
  appt: AppointmentInput & { source: AppointmentSource; external_id: string }
): Promise<Appointment> {
  const existing = appointments.find(
    a => a.source === appt.source && a.external_id === appt.external_id
  );
  if (existing) {
    existing.scheduled_date = appt.scheduled_date;
    existing.hospital = appt.hospital;
    existing.notes = appt.notes ?? '';
    existing.linked_transfusion_id = appt.linked_transfusion_id ?? null;
    existing.external_source_name = appt.external_source_name ?? null;
    return existing;
  }
  return createAppointment(_userId, appt);
}

// ── Medication Reminders ────────────────────────────────────
export async function getMedicationReminders(
  _userId: string
): Promise<MedicationReminder[]> {
  return [...medicationReminders].sort(
    (a, b) => (a.reminder_times[0] || '').localeCompare(b.reminder_times[0] || '')
  );
}

export async function createMedicationReminder(
  _userId: string,
  data: {
    medication_name: string;
    dosage: string;
    frequency: MedicationReminder['frequency'];
    reminder_times: string[];
    instructions?: string;
  }
): Promise<MedicationReminder> {
  const entry: MedicationReminder = {
    id: genId(),
    user_id: profile.user_id,
    medication_name: data.medication_name,
    dosage: data.dosage,
    frequency: data.frequency,
    reminder_times: data.reminder_times,
    instructions: data.instructions ?? '',
    is_active: true,
    taken_today: [],
    streak_days: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  medicationReminders.push(entry);
  return entry;
}

export async function updateMedicationReminder(
  _userId: string,
  id: string,
  data: Partial<MedicationReminder>
): Promise<MedicationReminder> {
  const idx = medicationReminders.findIndex(m => m.id === id);
  if (idx >= 0) {
    medicationReminders[idx] = {
      ...medicationReminders[idx],
      ...data,
      updated_at: new Date().toISOString(),
    };
    return medicationReminders[idx];
  }
  throw new Error('Medication reminder not found');
}

export async function deleteMedicationReminder(
  _userId: string,
  id: string
): Promise<void> {
  medicationReminders = medicationReminders.filter(m => m.id !== id);
}

export async function markMedicationTaken(
  _userId: string,
  id: string
): Promise<MedicationReminder> {
  const idx = medicationReminders.findIndex(m => m.id === id);
  if (idx >= 0) {
    const now = new Date().toISOString();
    medicationReminders[idx] = {
      ...medicationReminders[idx],
      taken_today: [...medicationReminders[idx].taken_today, now],
      streak_days: medicationReminders[idx].streak_days + (medicationReminders[idx].taken_today.length === 0 ? 0 : 0),
      updated_at: now,
    };
    return medicationReminders[idx];
  }
  throw new Error('Medication reminder not found');
}

export async function unmarkMedicationTaken(
  _userId: string,
  id: string
): Promise<MedicationReminder> {
  const idx = medicationReminders.findIndex(m => m.id === id);
  if (idx >= 0) {
    medicationReminders[idx] = {
      ...medicationReminders[idx],
      taken_today: medicationReminders[idx].taken_today.slice(0, -1),
      updated_at: new Date().toISOString(),
    };
    return medicationReminders[idx];
  }
  throw new Error('Medication reminder not found');
}
