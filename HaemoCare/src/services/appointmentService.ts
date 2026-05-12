import { supabase } from '../config/supabase';
import { Appointment, AppointmentSource } from '../types/database';

export interface AppointmentInput {
  scheduled_date: string;
  hospital: string;
  notes?: string;
  linked_transfusion_id?: string | null;
  source?: AppointmentSource;
  external_id?: string | null;
  external_source_name?: string | null;
}

export async function getUpcomingAppointments(userId: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .gte('scheduled_date', new Date().toISOString())
    .order('scheduled_date', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Appointment[];
}

export async function getPastAppointments(userId: string): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .lt('scheduled_date', new Date().toISOString())
    .order('scheduled_date', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Appointment[];
}

export async function getAppointmentById(id: string): Promise<Appointment | null> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data as Appointment;
}

export async function createAppointment(
  userId: string,
  appt: AppointmentInput
): Promise<Appointment> {
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      user_id: userId,
      scheduled_date: appt.scheduled_date,
      hospital: appt.hospital,
      notes: appt.notes ?? '',
      linked_transfusion_id: appt.linked_transfusion_id ?? null,
      source: appt.source ?? 'manual',
      external_id: appt.external_id ?? null,
      external_source_name: appt.external_source_name ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Appointment;
}

/**
 * Creates an appointment, or updates the existing row with the same
 * (user_id, source, external_id) triple. Used by ICS / FHIR importers
 * so re-syncing never produces duplicates.
 */
export async function upsertAppointmentByExternalId(
  userId: string,
  appt: AppointmentInput & { source: AppointmentSource; external_id: string }
): Promise<Appointment> {
  const { data: existing } = await supabase
    .from('appointments')
    .select('id')
    .eq('user_id', userId)
    .eq('source', appt.source)
    .eq('external_id', appt.external_id)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase
      .from('appointments')
      .update({
        scheduled_date: appt.scheduled_date,
        hospital: appt.hospital,
        notes: appt.notes ?? '',
        linked_transfusion_id: appt.linked_transfusion_id ?? null,
        external_source_name: appt.external_source_name ?? null,
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Appointment;
  }

  return createAppointment(userId, appt);
}
