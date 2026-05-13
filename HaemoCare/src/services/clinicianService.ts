import { supabase } from '../config/supabase';
import type {
  ClinicianProfile,
  Profile,
  Transfusion,
  SymptomLog,
  Appointment,
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
