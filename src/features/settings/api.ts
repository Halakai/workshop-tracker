import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TablesUpdate } from '@/lib/database.types';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').single();
      if (error) throw error;
      return data;
    },
  });
}
export type Settings = NonNullable<ReturnType<typeof useSettings>['data']>;

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: TablesUpdate<'settings'>) => {
      const { data, error } = await supabase.from('settings').update(values).eq('id', true).select();
      if (error) throw error;
      if (!data.length) throw new Error('Only an admin can change the settings.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
}
