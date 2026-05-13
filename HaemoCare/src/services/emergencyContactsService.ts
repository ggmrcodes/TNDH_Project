import { supabase } from '../config/supabase';
import type { EmergencyContact } from '../types/database';

export async function listEmergencyContacts(userId: string): Promise<EmergencyContact[]> {
  const { data, error } = await supabase
    .from('emergency_contacts')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EmergencyContact[];
}

export async function addEmergencyContact(
  userId: string,
  input: { name: string; phone: string; role_label: string; priority: 1 | 2 | 3 }
): Promise<EmergencyContact> {
  const { data, error } = await supabase
    .from('emergency_contacts')
    .insert({ user_id: userId, ...input })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as EmergencyContact;
}

export async function updateEmergencyContact(
  id: string,
  input: Partial<Pick<EmergencyContact, 'name' | 'phone' | 'role_label'>>
): Promise<EmergencyContact> {
  const { data, error } = await supabase
    .from('emergency_contacts')
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as EmergencyContact;
}

export async function deleteEmergencyContact(id: string): Promise<void> {
  const { error } = await supabase
    .from('emergency_contacts')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function swapEmergencyContactPriorities(aId: string, bId: string): Promise<void> {
  const { error } = await supabase.rpc('swap_emergency_contact_priorities', {
    a_id: aId,
    b_id: bId,
  });
  if (error) throw new Error(error.message);
}
