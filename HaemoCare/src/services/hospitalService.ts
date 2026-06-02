// src/services/hospitalService.ts
import { supabase } from '../config/supabase';
import type { Hospital } from '../types/database';

export async function getHospitals(): Promise<Hospital[]> {
  const { data, error } = await supabase
    .from('hospitals')
    .select('*')
    .eq('is_active', true)
    .order('region', { ascending: true })
    .order('name_th', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Hospital[];
}

export async function createOrGetHospital(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_or_get_hospital', { p_name: name.trim() });
  if (error) throw new Error(error.message);
  return data as string;
}

// ── Admin curation ────────────────────────────────────────────────
// Admin-only writes are gated server-side by the policies added in
// 2026-06-02-hospitals-admin-write.sql (using public.is_admin()).
// Non-admin callers get a 403 from PostgREST. No need for a client-side
// admin check before calling — RLS is the source of truth.

export type HospitalRegion = NonNullable<Hospital['region']>;

export interface AdminHospitalInput {
  name_th: string;
  name_en: string;
  code: string | null;
  region: HospitalRegion | null;
}

/** Admin variant of getHospitals — returns BOTH active and inactive
 *  rows so the curation list can show retired hospitals too. The
 *  "Admin reads all hospitals" policy unlocks this for admins; non-
 *  admins still only see active rows. */
export async function adminListAllHospitals(): Promise<Hospital[]> {
  const { data, error } = await supabase
    .from('hospitals')
    .select('*')
    .order('is_active', { ascending: false })
    .order('region', { ascending: true })
    .order('name_th', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Hospital[];
}

export async function adminCreateHospital(input: AdminHospitalInput): Promise<Hospital> {
  const { data, error } = await supabase
    .from('hospitals')
    .insert({ ...input, is_active: true })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Hospital;
}

export async function adminUpdateHospital(
  id: string,
  patch: Partial<AdminHospitalInput>,
): Promise<Hospital> {
  const { data, error } = await supabase
    .from('hospitals')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Hospital;
}

/** Soft-deactivate / reactivate. Hard delete is not exposed — both
 *  profiles.hospital_id and clinician_profiles.hospital_id FK this
 *  table, so dropping a row would either fail or break existing links. */
export async function adminSetHospitalActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('hospitals')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
