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
