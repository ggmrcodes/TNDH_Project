import { supabase } from '../config/supabase';
import type {
  ClinicianProfile,
  Profile,
  Transfusion,
  SymptomLog,
  Appointment,
  EmergencyContact,
  MedicationAdherenceEvent,
} from '../types/database';

export async function getClinicianProfile(userId: string): Promise<ClinicianProfile | null> {
  const { data, error } = await supabase
    .from('clinician_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ClinicianProfile | null) ?? null;
}

export async function getAssignedPatients(clinicianId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('clinician_patient_links')
    .select('patient_user_id, profiles!inner(*)')
    .eq('clinician_id', clinicianId)
    .eq('status', 'active');
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row: any) => (row.profiles ? [row.profiles as Profile] : []));
}

export async function getTransfusionsForPatient(userId: string): Promise<Transfusion[]> {
  const { data, error } = await supabase
    .from('transfusions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Transfusion[];
}

export async function getLatestTransfusionForPatient(
  userId: string
): Promise<Transfusion | null> {
  const { data, error } = await supabase
    .from('transfusions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Transfusion | null) ?? null;
}

export async function getSymptomLogsForPatient(userId: string): Promise<SymptomLog[]> {
  const { data, error } = await supabase
    .from('symptom_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SymptomLog[];
}

export async function getProfileForPatient(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile | null) ?? null;
}

export async function getMostRecentPastAppointmentForPatient(
  userId: string
): Promise<Appointment | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .lt('scheduled_date', new Date().toISOString())
    .order('scheduled_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Appointment | null) ?? null;
}

export async function getPastAppointmentsForPatient(
  userId: string,
  sinceISO: string
): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .gte('scheduled_date', sinceISO)
    .lt('scheduled_date', new Date().toISOString())
    .order('scheduled_date', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Appointment[];
}

// Reads adherence events for an assigned patient over the given window.
// RLS gates this via is_active_clinician_for(). The caller computes
// aggregation in the service layer for parity with mock-mode behavior.
export async function getAdherenceEventsForPatient(
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

export async function getMedicationRemindersForPatient(
  userId: string
): Promise<import('../types/database').MedicationReminder[]> {
  const { data, error } = await supabase
    .from('medication_reminders')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as import('../types/database').MedicationReminder[];
}

// RLS must allow clinician reads on emergency_contacts via clinician_patient_links.
// If RLS denies access, Supabase returns an empty result set (not an error), and
// this function returns []. We deliberately do not throw on access-denied so
// the detail UI can render the "contacts hidden by patient" empty state.
export async function getEmergencyContactsForPatient(
  userId: string
): Promise<EmergencyContact[]> {
  const { data, error } = await supabase
    .from('emergency_contacts')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EmergencyContact[];
}
