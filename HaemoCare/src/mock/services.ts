import { Profile, Transfusion, SymptomLog, Appointment, AppointmentSource, MedicationReminder, MedicationAdherenceEvent, AdherenceEventSource, ClinicianProfile, EmergencyContact, PreTransfusionLabs, TransfusionLabAuditEntry, UrineColor, ClinicianPatientLink } from '../types/database';
import type { RequestLinkResult, PendingPatientLinkRow } from '../services/clinicianService';
import { validateLabs } from '../utils/preTransfusionLabs';
import {
  MOCK_PROFILE,
  MOCK_TRANSFUSIONS,
  MOCK_SYMPTOM_LOGS,
  MOCK_APPOINTMENTS,
  MOCK_MEDICATION_REMINDERS,
  MOCK_USER_ID,
} from './data';
import {
  MOCK_CLINICIAN_PROFILE,
  MOCK_LINKED_PATIENTS,
  type MockLinkedPatient,
} from './clinicianData';

interface AppointmentInput {
  scheduled_date: string;
  hospital: string;
  notes?: string;
  linked_transfusion_id?: string | null;
  source?: AppointmentSource;
  external_id?: string | null;
  external_source_name?: string | null;
}

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
    urine_color?: UrineColor | null;
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
    urine_color: log.urine_color ?? null,
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

export async function getMostRecentPastAppointment(
  _userId?: string
): Promise<Appointment | null> {
  const now = Date.now();
  const past = appointments
    .filter((a) => new Date(a.scheduled_date).getTime() < now)
    .sort((a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());
  return past[0] ?? null;
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
    days_of_week?: MedicationReminder['days_of_week'];
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
    days_of_week: data.days_of_week ?? null,
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

// ── Clinician-side mock services ──────────────────────────────

export async function getClinicianProfile(): Promise<ClinicianProfile | null> {
  return MOCK_CLINICIAN_PROFILE;
}

export async function getAssignedPatients(): Promise<Profile[]> {
  return MOCK_LINKED_PATIENTS.map(p => p.profile);
}

export async function getAssignedPatientById(userId: string): Promise<MockLinkedPatient | null> {
  return MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === userId) ?? null;
}

export async function getProfileForPatient(userId: string): Promise<Profile | null> {
  return MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === userId)?.profile ?? null;
}

export async function getTransfusionsForPatient(userId: string): Promise<Transfusion[]> {
  return MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === userId)?.transfusions ?? [];
}

export async function getLatestTransfusionForPatient(userId: string): Promise<Transfusion | null> {
  const list = MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === userId)?.transfusions ?? [];
  return list[0] ?? null;
}

export async function getSymptomLogsForPatient(userId: string): Promise<SymptomLog[]> {
  return MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === userId)?.symptomLogs ?? [];
}

export async function getMostRecentPastAppointmentForPatient(
  userId: string
): Promise<Appointment | null> {
  const list = MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === userId)?.appointments ?? [];
  const nowIso = new Date().toISOString();
  const past = list.filter(a => a.scheduled_date < nowIso)
    .sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : -1));
  return past[0] ?? null;
}

// ── Emergency contacts (mock) ──────────────────────────────────

// Pre-populated for the demo patient (สมชาย / Somchai). In real Supabase mode
// these come from the emergency_contacts table via RLS-gated queries.
let mockEmergencyContacts: EmergencyContact[] = [
  {
    id: 'ec-mock-001',
    user_id: MOCK_USER_ID,
    name: 'วนิดา ทะลังสาง',
    phone: '0812345678',
    role_label: 'Caretaker',
    priority: 1,
    created_at: '2025-01-20T00:00:00+07:00',
  },
  {
    id: 'ec-mock-002',
    user_id: MOCK_USER_ID,
    name: 'นายแพทย์สุวรรณ ตันตระกูล',
    phone: '0898765432',
    role_label: 'Doctor',
    priority: 2,
    created_at: '2025-01-20T00:00:00+07:00',
  },
  {
    id: 'ec-mock-003',
    user_id: MOCK_USER_ID,
    name: 'นิรันดร์ ทะลังสาง',
    phone: '0856789012',
    role_label: 'Other',
    priority: 3,
    created_at: '2025-01-20T00:00:00+07:00',
  },
];
let mockEmergencyContactIdCounter = 1;

export async function listEmergencyContacts(_userId: string): Promise<EmergencyContact[]> {
  return [...mockEmergencyContacts].sort((a, b) => a.priority - b.priority);
}

export async function addEmergencyContact(
  userId: string,
  input: { name: string; phone: string; role_label: string; priority: 1 | 2 | 3 }
): Promise<EmergencyContact> {
  if (mockEmergencyContacts.some(c => c.priority === input.priority)) {
    throw new Error(`Priority ${input.priority} already taken`);
  }
  if (mockEmergencyContacts.length >= 3) {
    throw new Error('Maximum 3 contacts');
  }
  const row: EmergencyContact = {
    id: `mock-ec-${mockEmergencyContactIdCounter++}`,
    user_id: userId,
    name: input.name,
    phone: input.phone,
    role_label: input.role_label,
    priority: input.priority,
    created_at: new Date().toISOString(),
  };
  mockEmergencyContacts.push(row);
  return row;
}

export async function updateEmergencyContact(
  id: string,
  input: Partial<Pick<EmergencyContact, 'name' | 'phone' | 'role_label'>>
): Promise<EmergencyContact> {
  const idx = mockEmergencyContacts.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('Contact not found');
  mockEmergencyContacts[idx] = { ...mockEmergencyContacts[idx], ...input };
  return mockEmergencyContacts[idx];
}

export async function deleteEmergencyContact(id: string): Promise<void> {
  mockEmergencyContacts = mockEmergencyContacts.filter(c => c.id !== id);
}

export async function swapEmergencyContactPriorities(aId: string, bId: string): Promise<void> {
  const a = mockEmergencyContacts.find(c => c.id === aId);
  const b = mockEmergencyContacts.find(c => c.id === bId);
  if (!a || !b) throw new Error('Contact not found');
  const aPrio = a.priority;
  a.priority = b.priority;
  b.priority = aPrio;
}

// ── Clinician-side reads (used by clinician dashboard) ──────────

export async function getPastAppointmentsForPatient(
  userId: string,
  sinceISO: string
): Promise<Appointment[]> {
  const list = MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === userId)?.appointments ?? [];
  const nowIso = new Date().toISOString();
  return list
    .filter(a => a.scheduled_date >= sinceISO && a.scheduled_date < nowIso)
    .sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : -1));
}

export async function getEmergencyContactsForPatient(
  userId: string
): Promise<EmergencyContact[]> {
  const contacts = MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === userId)?.emergencyContacts ?? [];
  return [...contacts].sort((a, b) => a.priority - b.priority);
}

// ── Pre-transfusion labs (mock) ──────────────────────────────────────
//
// In real Supabase mode, `Transfusion.pre_labs` is a JSONB column on
// `transfusions` and the audit history lives in `transfusion_lab_audit_log`.
// Here we mirror that shape with in-memory mutation.

const mockLabAuditLog: TransfusionLabAuditEntry[] = [];
let mockLabAuditCounter = 1;

function findTxIndex(transfusionId: string): { source: 'self' | 'patient'; idx: number; patientUserId?: string } | null {
  const ownIdx = transfusions.findIndex(t => t.id === transfusionId);
  if (ownIdx >= 0) return { source: 'self', idx: ownIdx };
  for (const linked of MOCK_LINKED_PATIENTS) {
    const idx = linked.transfusions.findIndex(t => t.id === transfusionId);
    if (idx >= 0) return { source: 'patient', idx, patientUserId: linked.profile.user_id };
  }
  return null;
}

function applyMockLabsUpdate(
  located: NonNullable<ReturnType<typeof findTxIndex>>,
  labs: PreTransfusionLabs
): Transfusion {
  if (located.source === 'self') {
    transfusions[located.idx] = { ...transfusions[located.idx], pre_labs: labs };
    return transfusions[located.idx];
  }
  const linked = MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === located.patientUserId);
  if (!linked) throw new Error('Linked patient missing');
  linked.transfusions[located.idx] = { ...linked.transfusions[located.idx], pre_labs: labs };
  return linked.transfusions[located.idx];
}

export async function savePreLabsForTransfusion(
  transfusionId: string,
  actorUserId: string,
  labs: PreTransfusionLabs
): Promise<Transfusion> {
  const errors = validateLabs(labs);
  if (errors.length > 0) {
    throw new Error(
      `Invalid pre-transfusion labs: ${errors
        .map(e => `${e.field} ${e.code} (${e.min}–${e.max})`)
        .join(', ')}`
    );
  }
  const located = findTxIndex(transfusionId);
  if (!located) throw new Error('Transfusion not found');
  const current =
    located.source === 'self'
      ? transfusions[located.idx]
      : MOCK_LINKED_PATIENTS.find(p => p.profile.user_id === located.patientUserId)!.transfusions[located.idx];
  mockLabAuditLog.unshift({
    id: `mock-lab-audit-${mockLabAuditCounter++}`,
    transfusion_id: transfusionId,
    previous_value: current.pre_labs ?? null,
    new_value: labs,
    changed_by_user_id: actorUserId,
    changed_at: new Date().toISOString(),
  });
  return applyMockLabsUpdate(located, labs);
}

export async function listLabAuditEntries(
  transfusionId: string
): Promise<TransfusionLabAuditEntry[]> {
  return mockLabAuditLog
    .filter(e => e.transfusion_id === transfusionId)
    .sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1));
}

// Stub for the photo-attach flow in mock mode — no real upload. Returns a
// data URI so the display component can still render the chosen image.
export async function uploadLabSlipPhotoMock(
  _patientUserId: string,
  _transfusionId: string,
  localUri: string
): Promise<string> {
  return localUri;
}

// ── Medication adherence events (mock) ─────────────────────────
// Lightweight in-memory store. Real-mode equivalent lives in
// src/services/medicationsService.ts. Seeded with a small history for the
// demo patient so the clinician adherence widget has something to render.

let mockAdherenceEvents: MedicationAdherenceEvent[] = (() => {
  // Seed: 5 of 7 days of adherence for the demo patient.
  const seeded: MedicationAdherenceEvent[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    if (i === 2 || i === 5) continue; // simulate 2 missed days
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(8, 5, 0, 0);
    seeded.push({
      id: `mock-adh-${i}`,
      user_id: MOCK_USER_ID,
      reminder_id: 'mock-med-1',
      scheduled_at: (() => { const s = new Date(d); s.setHours(8, 0, 0, 0); return s.toISOString(); })(),
      taken_at: d.toISOString(),
      skipped_at: null,
      source: 'manual',
      created_at: d.toISOString(),
    });
  }
  return seeded;
})();
let mockAdherenceEventIdCounter = 1;

export async function getAdherenceEvents(
  _userId: string,
  sinceISO: string
): Promise<MedicationAdherenceEvent[]> {
  const since = new Date(sinceISO).getTime();
  return mockAdherenceEvents
    .filter(e => new Date(e.scheduled_at).getTime() >= since)
    .sort((a, b) => (a.scheduled_at < b.scheduled_at ? 1 : -1));
}

export async function getAdherenceEventsForPatient(
  userId: string,
  sinceISO: string
): Promise<MedicationAdherenceEvent[]> {
  const since = new Date(sinceISO).getTime();
  return mockAdherenceEvents
    .filter(e => e.user_id === userId && new Date(e.scheduled_at).getTime() >= since)
    .sort((a, b) => (a.scheduled_at < b.scheduled_at ? 1 : -1));
}

export async function getMedicationRemindersForPatient(
  userId: string
): Promise<MedicationReminder[]> {
  // For non-demo patients (clinician dashboard), we have no schedule data in
  // the mock fixture set, so return an empty array. The widget will render
  // its empty state.
  if (userId !== MOCK_USER_ID) return [];
  return [...medicationReminders];
}

export async function markMedicationSkipped(
  userId: string,
  reminderId: string,
  source: AdherenceEventSource = 'tap'
): Promise<void> {
  const reminder = medicationReminders.find(m => m.id === reminderId);
  const now = new Date();
  const slot = reminder?.taken_today.length ?? 0;
  const scheduledTime = reminder?.reminder_times[slot] ?? reminder?.reminder_times[0] ?? '08:00';
  const [hh, mm] = scheduledTime.split(':').map(Number);
  const scheduledAt = new Date(now);
  scheduledAt.setHours(hh ?? 0, mm ?? 0, 0, 0);
  mockAdherenceEvents.push({
    id: `mock-adh-skip-${mockAdherenceEventIdCounter++}`,
    user_id: userId,
    reminder_id: reminderId,
    scheduled_at: scheduledAt.toISOString(),
    taken_at: null,
    skipped_at: now.toISOString(),
    source,
    created_at: now.toISOString(),
  });
}

// Patch markMedicationTaken to also write an adherence event so mock-mode
// produces the same clinician-side data as real mode. We can't redefine the
// existing export so we expose a new function the screen will call when it
// wants the adherence side-effect; the legacy markMedicationTaken stays for
// backward-compat with anything still calling it.
export async function markMedicationTakenWithEvent(
  userId: string,
  id: string,
  source: AdherenceEventSource = 'tap'
): Promise<MedicationReminder> {
  const reminder = medicationReminders.find(m => m.id === id);
  if (!reminder) throw new Error('Medication reminder not found');
  const now = new Date();
  const slot = reminder.taken_today.length;
  const scheduledTime = reminder.reminder_times[slot] ?? reminder.reminder_times[0] ?? '08:00';
  const [hh, mm] = scheduledTime.split(':').map(Number);
  const scheduledAt = new Date(now);
  scheduledAt.setHours(hh ?? 0, mm ?? 0, 0, 0);

  mockAdherenceEvents.push({
    id: `mock-adh-take-${mockAdherenceEventIdCounter++}`,
    user_id: userId,
    reminder_id: id,
    scheduled_at: scheduledAt.toISOString(),
    taken_at: now.toISOString(),
    skipped_at: null,
    source,
    created_at: now.toISOString(),
  });
  return markMedicationTaken(userId, id);
}

// ── Clinician-patient linking (mock) ──────────────────────────
// Backed by an in-memory list scoped to the session. Mock clinicians
// start with no pending requests; submitting one creates a row that
// shows up in the queue as greyed pending until the demo expires.

let mockPendingLinks: ClinicianPatientLink[] = [];
let mockLinkIdCounter = 1;

export async function requestPatientLink(
  clinicianId: string,
  patientId: string
): Promise<RequestLinkResult> {
  const trimmed = patientId.trim();
  if (!trimmed) return { ok: false, error: { kind: 'NOT_FOUND' } };

  // Mock universe: any HC- code resolves to a fake user; reject anything else.
  if (!/^HC-/i.test(trimmed)) return { ok: false, error: { kind: 'NOT_FOUND' } };

  const fakeUserId = `mock-patient-${trimmed.toLowerCase()}`;
  const existing = mockPendingLinks.find(
    l => l.clinician_id === clinicianId && l.patient_user_id === fakeUserId
  );
  if (existing) {
    if (existing.status === 'active') return { ok: false, error: { kind: 'ALREADY_ACTIVE' } };
    if (existing.status === 'pending') return { ok: false, error: { kind: 'ALREADY_PENDING' } };
    existing.status = 'pending';
    existing.requested_at = new Date().toISOString();
    return { ok: true, link: { ...existing } };
  }
  const link: ClinicianPatientLink = {
    id: `mock-link-${mockLinkIdCounter++}`,
    clinician_id: clinicianId,
    patient_user_id: fakeUserId,
    status: 'pending',
    requested_at: new Date().toISOString(),
    consented_at: null,
    revoked_at: null,
    share_full_name: true,
  };
  mockPendingLinks.push(link);
  return { ok: true, link: { ...link } };
}

export async function cancelLinkRequest(linkId: string): Promise<void> {
  mockPendingLinks = mockPendingLinks.filter(l => l.id !== linkId);
}

export async function getPendingPatientLinks(
  clinicianId: string
): Promise<PendingPatientLinkRow[]> {
  return mockPendingLinks
    .filter(l => l.clinician_id === clinicianId && l.status === 'pending')
    .map(link => ({
      link: { ...link },
      // Derive a display id from the mock user_id (mock-patient-hc-123456 → HC-123456)
      patientDisplayId: link.patient_user_id.replace(/^mock-patient-/, '').toUpperCase(),
    }));
}
