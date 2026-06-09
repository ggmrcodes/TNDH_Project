// Pre-transfusion labs service — read/write `transfusions.pre_labs` and
// the `transfusion_lab_audit_log` table; upload optional lab-slip photos
// to the private `transfusion-lab-slips` Storage bucket.
//
// Photo compression: ≤1200px wide, ≤80% quality before upload, using
// expo-image-manipulator (already a dependency). See the photo helper in
// PreTransfusionLabsForm — services accept a finished URI / blob.

import { supabase } from '../config/supabase';
import type {
  PreTransfusionLabs,
  Transfusion,
  TransfusionLabAuditEntry,
} from '../types/database';
import { validateLabs } from '../utils/preTransfusionLabs';

export const LAB_SLIPS_BUCKET = 'transfusion-lab-slips';

/** Write a new `pre_labs` payload onto a transfusion. Also appends an
 * audit-log entry so the previous value is preserved per the brief.
 *
 * Clinician-edit path additionally writes `reaction_noted` /
 * `reaction_detail` when `reactions` is supplied. Reactions are not
 * audited in v1 (observational text, not safety-critical labs). The
 * column-lock trigger in 2026-06-09-clinician-transfusion-write.sql
 * enforces that clinician UPDATEs touch only pre_labs + the two
 * reaction columns.
 *
 * @param transfusionId  transfusion to update
 * @param patientUserId  owner of the transfusion (used for audit + bucket path)
 * @param actorUserId    auth.uid() of whoever is making the change
 * @param labs           full payload to persist (replaces existing pre_labs)
 * @param reactions      optional reaction_noted + reaction_detail update
 */
export async function savePreLabs(
  transfusionId: string,
  patientUserId: string,
  actorUserId: string,
  labs: PreTransfusionLabs,
  reactions?: { noted: boolean; detail: string }
): Promise<Transfusion> {
  // Defensive: never persist bad numbers, regardless of caller.
  const errors = validateLabs(labs);
  if (errors.length > 0) {
    throw new Error(
      `Invalid pre-transfusion labs: ${errors
        .map(e => `${e.field} ${e.code} (${e.min}–${e.max})`)
        .join(', ')}`
    );
  }

  const { data: prior, error: priorError } = await supabase
    .from('transfusions')
    .select('id, user_id, pre_labs')
    .eq('id', transfusionId)
    .single();
  if (priorError) throw new Error(priorError.message);
  if (!prior) throw new Error('Transfusion not found');
  if (prior.user_id !== patientUserId) {
    throw new Error('Transfusion ownership mismatch');
  }

  // Append audit row BEFORE mutating the transfusion. The brief is
  // explicit that prior values must be preserved; doing this first means
  // a failure to write the update leaves no orphaned audit row.
  const auditPayload = {
    transfusion_id: transfusionId,
    previous_value: prior.pre_labs ?? null,
    new_value: labs,
    changed_by_user_id: actorUserId,
  };
  const { error: auditError } = await supabase
    .from('transfusion_lab_audit_log')
    .insert(auditPayload);
  if (auditError) throw new Error(auditError.message);

  const updatePayload: {
    pre_labs: PreTransfusionLabs;
    reaction_noted?: boolean;
    reaction_detail?: string;
  } = { pre_labs: labs };
  if (reactions !== undefined) {
    updatePayload.reaction_noted = reactions.noted;
    updatePayload.reaction_detail = reactions.detail;
  }

  const { data: updated, error: updateError } = await supabase
    .from('transfusions')
    .update(updatePayload)
    .eq('id', transfusionId)
    .select()
    .single();
  if (updateError) throw new Error(updateError.message);
  return updated as Transfusion;
}

/** Read the audit history for one transfusion (clinician dashboard /
 * future detail view). Server enforces RLS — patients see their own,
 * clinicians see assigned. */
export async function listLabAuditEntries(
  transfusionId: string
): Promise<TransfusionLabAuditEntry[]> {
  const { data, error } = await supabase
    .from('transfusion_lab_audit_log')
    .select('*')
    .eq('transfusion_id', transfusionId)
    .order('changed_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TransfusionLabAuditEntry[];
}

/** Upload a compressed lab-slip photo to private storage. Returns the
 * object path inside the bucket (NOT a public URL — caller must create
 * a signed URL for display). */
export async function uploadLabSlipPhoto(
  patientUserId: string,
  transfusionId: string,
  data: ArrayBuffer,
  contentType: string = 'image/jpeg'
): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `${patientUserId}/${transfusionId}/${stamp}.jpg`;
  const { error } = await supabase.storage
    .from(LAB_SLIPS_BUCKET)
    .upload(path, data, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

/** Create a short-lived signed URL for rendering a stored lab slip in
 * the UI. Default TTL is one hour. */
export async function getLabSlipSignedUrl(
  storagePath: string,
  expiresInSeconds: number = 60 * 60
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(LAB_SLIPS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}
