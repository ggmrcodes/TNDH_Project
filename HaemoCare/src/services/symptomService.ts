import { supabase } from '../config/supabase';
import { SymptomLog } from '../types/database';

export async function getSymptomLogs(userId: string, limit?: number): Promise<SymptomLog[]> {
  let query = supabase
    .from('symptom_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false });

  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as SymptomLog[];
}

export async function getSymptomLogsByTransfusion(transfusionId: string): Promise<SymptomLog[]> {
  const { data, error } = await supabase
    .from('symptom_logs')
    .select('*')
    .eq('transfusion_id', transfusionId)
    .order('logged_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as SymptomLog[];
}

export async function getSymptomLogsSinceDate(userId: string, sinceDate: string): Promise<SymptomLog[]> {
  const { data, error } = await supabase
    .from('symptom_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_at', sinceDate)
    .order('logged_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as SymptomLog[];
}

export async function getSymptomLogById(id: string): Promise<SymptomLog | null> {
  const { data, error } = await supabase
    .from('symptom_logs')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data as SymptomLog;
}

export async function createSymptomLog(
  userId: string,
  log: {
    transfusion_id?: string | null;
    symptoms: string[];
    severity_scores: Record<string, number>;
    outcome: 'normal' | 'monitor' | 'urgent';
    notes?: string;
  }
): Promise<SymptomLog> {
  const { data, error } = await supabase
    .from('symptom_logs')
    .insert({
      user_id: userId,
      transfusion_id: log.transfusion_id ?? null,
      symptoms: log.symptoms,
      severity_scores: log.severity_scores,
      outcome: log.outcome,
      notes: log.notes ?? '',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as SymptomLog;
}
