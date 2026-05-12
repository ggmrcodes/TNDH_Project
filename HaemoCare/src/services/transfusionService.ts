import { supabase } from '../config/supabase';
import { Transfusion } from '../types/database';

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
