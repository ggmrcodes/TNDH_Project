import { supabase } from '../config/supabase';
import type { ClinicianPatientLink } from '../types/database';

export interface PendingLinkRequest {
  linkId: string;
  clinicianUserId: string;
  clinicianFullName: string;
  clinicianHospital: string | null;
  requestedAt: string;
}

// Patient-facing read of pending link requests directed at them. The
// link row stores clinician_id (referencing auth.users), not the
// clinician_profiles row id, so we batch-fetch the profiles in a
// second query. RLS on clinician_profiles allows the patient to read
// these rows via the "Patients view linked clinicians" policy that
// fires for any pending or active link.
export async function getPendingLinkRequests(userId: string): Promise<PendingLinkRequest[]> {
  const { data: linkRows, error: linkErr } = await supabase
    .from('clinician_patient_links')
    .select('id, clinician_id, requested_at')
    .eq('patient_user_id', userId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: true });
  if (linkErr) throw new Error(linkErr.message);
  const links = linkRows ?? [];
  if (links.length === 0) return [];

  const clinicianIds = Array.from(new Set(links.map((l) => l.clinician_id)));
  const { data: profileRows, error: profileErr } = await supabase
    .from('clinician_profiles')
    .select('user_id, full_name, hospital_affiliation')
    .in('user_id', clinicianIds);
  if (profileErr) throw new Error(profileErr.message);

  const profileMap = new Map<string, { full_name: string; hospital_affiliation: string }>();
  (profileRows ?? []).forEach((p) => {
    profileMap.set(p.user_id as string, {
      full_name: (p.full_name as string) || '',
      hospital_affiliation: (p.hospital_affiliation as string) || '',
    });
  });

  return links.map((l) => {
    const profile = profileMap.get(l.clinician_id as string);
    return {
      linkId: l.id as string,
      clinicianUserId: l.clinician_id as string,
      clinicianFullName: profile?.full_name?.trim() || 'Clinician',
      clinicianHospital: profile?.hospital_affiliation?.trim() || null,
      requestedAt: l.requested_at as string,
    };
  });
}

export async function acceptLinkRequest(
  linkId: string,
  shareFullName: boolean
): Promise<ClinicianPatientLink> {
  const { data, error } = await supabase
    .from('clinician_patient_links')
    .update({
      status: 'active',
      consented_at: new Date().toISOString(),
      share_full_name: shareFullName,
    })
    .eq('id', linkId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ClinicianPatientLink;
}

export async function declineLinkRequest(linkId: string): Promise<void> {
  const { error } = await supabase
    .from('clinician_patient_links')
    .update({ status: 'declined' })
    .eq('id', linkId);
  if (error) throw new Error(error.message);
}

export interface ConnectedClinician {
  linkId: string;
  clinicianUserId: string;
  clinicianFullName: string;
  clinicianHospital: string | null;
  shareFullName: boolean;
  consentedAt: string | null;
}

// Active clinicians the patient has approved. Same two-query pattern as
// getPendingLinkRequests — the link FK is to auth.users, not
// clinician_profiles, so we batch-fetch the profiles.
export async function getConnectedClinicians(userId: string): Promise<ConnectedClinician[]> {
  const { data: linkRows, error: linkErr } = await supabase
    .from('clinician_patient_links')
    .select('id, clinician_id, share_full_name, consented_at')
    .eq('patient_user_id', userId)
    .eq('status', 'active')
    .order('consented_at', { ascending: false });
  if (linkErr) throw new Error(linkErr.message);
  const links = linkRows ?? [];
  if (links.length === 0) return [];

  const clinicianIds = Array.from(new Set(links.map((l) => l.clinician_id)));
  const { data: profileRows, error: profileErr } = await supabase
    .from('clinician_profiles')
    .select('user_id, full_name, hospital_affiliation')
    .in('user_id', clinicianIds);
  if (profileErr) throw new Error(profileErr.message);

  const profileMap = new Map<string, { full_name: string; hospital_affiliation: string }>();
  (profileRows ?? []).forEach((p) => {
    profileMap.set(p.user_id as string, {
      full_name: (p.full_name as string) || '',
      hospital_affiliation: (p.hospital_affiliation as string) || '',
    });
  });

  return links.map((l) => {
    const profile = profileMap.get(l.clinician_id as string);
    return {
      linkId: l.id as string,
      clinicianUserId: l.clinician_id as string,
      clinicianFullName: profile?.full_name?.trim() || 'Clinician',
      clinicianHospital: profile?.hospital_affiliation?.trim() || null,
      shareFullName: Boolean(l.share_full_name),
      consentedAt: (l.consented_at as string | null) ?? null,
    };
  });
}

export async function revokeClinicianLink(linkId: string): Promise<void> {
  const { error } = await supabase
    .from('clinician_patient_links')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', linkId);
  if (error) throw new Error(error.message);
}

export interface CliniciansAtHospital {
  user_id: string;
  full_name: string;
  hospital_id: string;
}

export async function getCliniciansAtHospital(hospitalId: string): Promise<CliniciansAtHospital[]> {
  const { data, error } = await supabase
    .from('clinician_profiles')
    .select('user_id, full_name, hospital_id')
    .eq('hospital_id', hospitalId)
    .eq('verified', true)
    .order('full_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CliniciansAtHospital[];
}

export async function requestClinicianLink(
  clinicianId: string,
  patientUserId: string,
  shareFullName: boolean
): Promise<ClinicianPatientLink> {
  // Upsert pattern: existing declined/revoked rows get flipped back to pending.
  const { data: existing } = await supabase
    .from('clinician_patient_links')
    .select('*')
    .eq('clinician_id', clinicianId)
    .eq('patient_user_id', patientUserId)
    .maybeSingle();

  if (existing) {
    const link = existing as ClinicianPatientLink;
    if (link.status === 'active') throw new Error('ALREADY_ACTIVE');
    if (link.status === 'pending') throw new Error('ALREADY_PENDING');
    // declined / revoked / expired → flip back to pending
    const { data: updated, error: updErr } = await supabase
      .from('clinician_patient_links')
      .update({
        status: 'pending',
        initiated_by: 'patient',
        requested_at: new Date().toISOString(),
        consented_at: null,
        revoked_at: null,
        share_full_name: shareFullName,
      })
      .eq('id', link.id)
      .select()
      .single();
    if (updErr) throw new Error(updErr.message);
    return updated as ClinicianPatientLink;
  }

  const { data: inserted, error: insErr } = await supabase
    .from('clinician_patient_links')
    .insert({
      clinician_id: clinicianId,
      patient_user_id: patientUserId,
      status: 'pending',
      initiated_by: 'patient',
      share_full_name: shareFullName,
    })
    .select()
    .single();
  if (insErr) throw new Error(insErr.message);
  return inserted as ClinicianPatientLink;
}
