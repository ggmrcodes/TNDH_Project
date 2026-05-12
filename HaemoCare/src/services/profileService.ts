import { supabase } from '../config/supabase';
import { Profile } from '../types/database';

export function generatePatientId(): string {
  const num = Math.floor(Math.random() * 999999) + 1;
  return `HC-${num.toString().padStart(6, '0')}`;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

export async function createProfile(
  userId: string,
  data: Partial<Omit<Profile, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<Profile | null> {
  const { data: result, error } = await supabase
    .from('profiles')
    .insert({
      user_id: userId,
      patient_id: generatePatientId(),
      ...data,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return result as Profile;
}

export async function updateProfile(
  userId: string,
  data: Partial<Omit<Profile, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
): Promise<Profile | null> {
  const { data: result, error } = await supabase
    .from('profiles')
    .update(data)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return result as Profile;
}

export async function deleteAccount(userId: string): Promise<void> {
  // Delete all user data (cascading deletes handle related tables)
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('user_id', userId);

  if (error) throw new Error(error.message);

  // Sign out the user
  await supabase.auth.signOut();
}
