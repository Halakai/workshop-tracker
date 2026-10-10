// Sellers and buyers (later customers): a shared list with type-ahead.
// Members add and edit; only admins delete (RLS). Names are unique ignoring case.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';

export type Contact = Tables<'contacts'>;

export const contactKeys = { all: ['contacts'] as const };

export function useContacts() {
  return useQuery({
    queryKey: contactKeys.all,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('contacts').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Finds a contact by name (ignoring case) or adds it. A phone number, when given, is saved too.
 * Returns null for an empty name.
 */
export async function ensureContact(name: string, phone?: string): Promise<Contact | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const cleanPhone = phone?.trim() || null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: found, error } = await supabase.from('contacts').select('*').ilike('name', trimmed.replace(/[%_\\]/g, '\\$&'));
    if (error) throw error;
    const existing = found[0];
    if (existing) {
      if (cleanPhone && cleanPhone !== existing.phone) {
        const { data, error: updateError } = await supabase
          .from('contacts')
          .update({ phone: cleanPhone })
          .eq('id', existing.id)
          .select()
          .single();
        if (updateError) throw updateError;
        return data;
      }
      return existing;
    }
    const { data, error: insertError } = await supabase
      .from('contacts')
      .insert({ name: trimmed, phone: cleanPhone })
      .select()
      .single();
    if (!insertError) return data;
    if (insertError.code !== '23505') throw insertError; // added by someone else just now: look again
  }
  throw new Error(`Could not save the contact “${trimmed}”`);
}
