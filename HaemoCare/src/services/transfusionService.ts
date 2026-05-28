import { decode as decodeBase64 } from 'base64-arraybuffer';
import { supabase } from '../config/supabase';
import { Transfusion } from '../types/database';

const DOC_BUCKET = 'transfusion-documents';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export async function getTransfusions(userId: string): Promise<Transfusion[]> {
  const { data, error } = await supabase
    .from('transfusions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Transfusion[];
}

export async function getTransfusionById(id: string): Promise<Transfusion | null> {
  const { data, error } = await supabase
    .from('transfusions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data as Transfusion;
}

export async function getLatestTransfusion(userId: string): Promise<Transfusion | null> {
  const { data, error } = await supabase
    .from('transfusions')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .single();

  if (error) return null;
  return data as Transfusion;
}

export async function createTransfusion(
  userId: string,
  data: Omit<Transfusion, 'id' | 'user_id' | 'created_at'>
): Promise<Transfusion> {
  const { data: result, error } = await supabase
    .from('transfusions')
    .insert({ user_id: userId, ...data })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return result as Transfusion;
}

// ── Scanned-document photo ─────────────────────────────────────────
// The scan flow captures one image per transfusion; we keep it in a
// private storage bucket and store its path on the row. Read access
// is granted to the owning patient + any active linked clinician
// (see 2026-06-09-transfusion-document-photo.sql).

/** Upload the scanned-document JPEG and return the storage path.
 *  Caller is expected to follow up with setTransfusionDocumentPhotoUrl(). */
export async function uploadTransfusionDocumentPhoto(
  userId: string,
  transfusionId: string,
  base64Jpeg: string,
): Promise<string> {
  const path = `${userId}/${transfusionId}.jpg`;
  // RN/Expo: fetch(uri).blob() uploads 0 bytes through supabase-storage-js,
  // so we decode the base64 to an ArrayBuffer (same pattern as chat).
  const body = decodeBase64(base64Jpeg);
  const { error } = await supabase.storage
    .from(DOC_BUCKET)
    .upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

/** Persist the photo storage path (or clear it) on the transfusion row. */
export async function setTransfusionDocumentPhotoUrl(
  transfusionId: string,
  storedValue: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('transfusions')
    .update({ document_photo_url: storedValue })
    .eq('id', transfusionId);
  if (error) throw new Error(error.message);
}

/** Mint a fresh signed URL for display. Returns null on error so callers
 *  can render a graceful placeholder without throwing.
 *  Accepts the value stored on `document_photo_url` and short-circuits
 *  any already-resolvable form (`data:`, `http`, `file:`) for mock mode. */
export async function getTransfusionDocumentPhotoSignedUrl(
  storedValue: string,
): Promise<string | null> {
  if (
    storedValue.startsWith('data:') ||
    storedValue.startsWith('http') ||
    storedValue.startsWith('file:')
  ) {
    return storedValue;
  }
  const { data, error } = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(storedValue, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Best-effort delete from storage. Callers should also clear the
 *  row's document_photo_url separately via setTransfusionDocumentPhotoUrl. */
export async function deleteTransfusionDocumentPhoto(storedPath: string): Promise<void> {
  // data: / http: values aren't backed by storage — nothing to delete.
  if (
    storedPath.startsWith('data:') ||
    storedPath.startsWith('http') ||
    storedPath.startsWith('file:')
  ) {
    return;
  }
  await supabase.storage.from(DOC_BUCKET).remove([storedPath]);
}
