import { supabase } from '../config/supabase';
import type {
  ClinicianProfile,
  PendingClinician,
  Profile,
  Transfusion,
  SymptomLog,
  Appointment,
  EmergencyContact,
  MedicationAdherenceEvent,
  ClinicianPatientLink,
} from '../types/database';

export type RequestLinkError =
  | { kind: 'NOT_FOUND' }
  | { kind: 'ALREADY_ACTIVE' }
  | { kind: 'ALREADY_PENDING' }
  | { kind: 'UNKNOWN'; message: string };

export type RequestLinkResult =
  | { ok: true; link: ClinicianPatientLink }
  | { ok: false; error: RequestLinkError };

export interface PendingPatientLinkRow {
  link: ClinicianPatientLink;
  patientDisplayId: string | null;
}

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

// ── Clinician-patient linking ────────────────────────────────

// Resolve the publicly-shareable patient_id (HC-XXXXXX) to a user_id and
// upsert a link row. Treats existing declined/revoked/expired rows as
// "re-request" — UPDATEs the row back to pending. Existing active rows
// return ALREADY_ACTIVE; existing pending rows return ALREADY_PENDING.
export async function requestPatientLink(
  clinicianId: string,
  patientId: string
): Promise<RequestLinkResult> {
  const trimmed = patientId.trim();
  if (!trimmed) return { ok: false, error: { kind: 'NOT_FOUND' } };

  const { data: userId, error: rpcError } = await supabase.rpc(
    'find_user_by_patient_id',
    { p_patient_id: trimmed }
  );
  if (rpcError) return { ok: false, error: { kind: 'UNKNOWN', message: rpcError.message } };
  if (!userId) return { ok: false, error: { kind: 'NOT_FOUND' } };

  const { data: existing } = await supabase
    .from('clinician_patient_links')
    .select('*')
    .eq('clinician_id', clinicianId)
    .eq('patient_user_id', userId)
    .maybeSingle();

  if (existing) {
    const link = existing as ClinicianPatientLink;
    if (link.status === 'active') return { ok: false, error: { kind: 'ALREADY_ACTIVE' } };
    if (link.status === 'pending') return { ok: false, error: { kind: 'ALREADY_PENDING' } };
    // Re-request: declined / revoked / expired → pending
    const { data: updated, error: updErr } = await supabase
      .from('clinician_patient_links')
      .update({
        status: 'pending',
        requested_at: new Date().toISOString(),
        consented_at: null,
        revoked_at: null,
        initiated_by: 'clinician',
      })
      .eq('id', link.id)
      .select()
      .single();
    if (updErr) return { ok: false, error: { kind: 'UNKNOWN', message: updErr.message } };
    return { ok: true, link: updated as ClinicianPatientLink };
  }

  const { data: inserted, error: insErr } = await supabase
    .from('clinician_patient_links')
    .insert({
      clinician_id: clinicianId,
      patient_user_id: userId,
      status: 'pending',
      initiated_by: 'clinician',
    })
    .select()
    .single();
  if (insErr) return { ok: false, error: { kind: 'UNKNOWN', message: insErr.message } };
  return { ok: true, link: inserted as ClinicianPatientLink };
}

export async function cancelLinkRequest(linkId: string): Promise<void> {
  const { error } = await supabase
    .from('clinician_patient_links')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', linkId);
  if (error) throw new Error(error.message);
}

export async function getPendingPatientLinks(
  clinicianId: string
): Promise<PendingPatientLinkRow[]> {
  const { data, error } = await supabase
    .from('clinician_patient_links')
    .select('*')
    .eq('clinician_id', clinicianId)
    .eq('status', 'pending')
    .eq('initiated_by', 'clinician')
    .order('requested_at', { ascending: false });
  if (error) throw new Error(error.message);

  const links = (data ?? []) as ClinicianPatientLink[];
  // Resolve display IDs in parallel — each via the SECURITY DEFINER RPC.
  // Patient display_id is non-secret and the RPC is gated on link party.
  const rows = await Promise.all(
    links.map(async (link) => {
      const { data: displayId } = await supabase.rpc('get_patient_display_id', {
        p_user_id: link.patient_user_id,
      });
      return { link, patientDisplayId: (displayId as string | null) ?? null };
    })
  );
  return rows;
}

export interface IncomingPatientRequest {
  link: ClinicianPatientLink;
  patientDisplayId: string | null;
  patientFullName: string | null; // null if share_full_name = false at request time
}

export async function getIncomingPatientRequests(
  clinicianId: string
): Promise<IncomingPatientRequest[]> {
  const { data: linkRows, error: linkErr } = await supabase
    .from('clinician_patient_links')
    .select('*')
    .eq('clinician_id', clinicianId)
    .eq('status', 'pending')
    .eq('initiated_by', 'patient')
    .order('requested_at', { ascending: false });
  if (linkErr) throw new Error(linkErr.message);
  const links = (linkRows ?? []) as ClinicianPatientLink[];
  if (links.length === 0) return [];

  // Resolve display id only — full name deferred until post-approval RLS allows it
  const rows = await Promise.all(
    links.map(async (link) => {
      const { data: displayId } = await supabase.rpc('get_patient_display_id', {
        p_user_id: link.patient_user_id,
      });
      return {
        link,
        patientDisplayId: (displayId as string | null) ?? null,
        patientFullName: null,
      };
    })
  );
  return rows;
}

export async function approveIncomingRequest(linkId: string): Promise<void> {
  const { error } = await supabase
    .from('clinician_patient_links')
    .update({ status: 'active', consented_at: new Date().toISOString() })
    .eq('id', linkId);
  if (error) throw new Error(error.message);
}

export async function declineIncomingRequest(linkId: string): Promise<void> {
  const { error } = await supabase
    .from('clinician_patient_links')
    .update({ status: 'declined' })
    .eq('id', linkId);
  if (error) throw new Error(error.message);
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

export async function getPendingClinicians(): Promise<PendingClinician[]> {
  const { data, error } = await supabase
    .from('clinician_profiles')
    .select('user_id, full_name, license_number, hospital_affiliation, hospital_id, created_at')
    .eq('verified', false)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PendingClinician[];
}

export async function approveClinician(userId: string): Promise<void> {
  const { error } = await supabase
    .from('clinician_profiles')
    .update({ verified: true, verified_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('verified', false);
  if (error) throw new Error(error.message);
}
