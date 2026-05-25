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
