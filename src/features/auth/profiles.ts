import { createContext, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';

export type Profile = Tables<'profiles'>;

export const profileKeys = {
  me: (userId: string | undefined) => ['me', userId] as const,
  all: ['profiles'] as const,
};

/** The signed-in user's profile; null when signed in but not (or no longer) a member of this app. */
export function useMeQuery(userId: string | undefined) {
  return useQuery({
    queryKey: profileKeys.me(userId),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export const CurrentProfileContext = createContext<Profile | null>(null);

/** Inside the signed-in part of the app: the current member's profile (never null there). */
export function useCurrentProfile(): Profile {
  const profile = useContext(CurrentProfileContext);
  if (!profile) throw new Error('useCurrentProfile used outside RequireAuth');
  return profile;
}

export function useProfiles() {
  return useQuery({
    queryKey: profileKeys.all,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

/** id → display name, for "added by …" lines. */
export function useProfileNames(): Map<string, string> {
  const { data } = useProfiles();
  return useMemo(() => new Map((data ?? []).map((p) => [p.id, p.display_name])), [data]);
}
