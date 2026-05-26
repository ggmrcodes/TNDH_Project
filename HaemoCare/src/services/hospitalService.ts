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
