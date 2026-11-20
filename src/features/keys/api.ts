// Customer keys (docs/PLAN.md §11): members make them (the database makes the code) and switch them off.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';

export type AccessKey = Tables<'access_keys'>;
export type KeyTarget = { jobId: string } | { carId: string };

export const keyKeys = {
  list: (target: KeyTarget) => ['access-keys', 'jobId' in target ? `job:${target.jobId}` : `car:${target.carId}`] as const,
};

/** The keys of a job or car: working ones first, newest first. */
export function useAccessKeys(target: KeyTarget) {
  return useQuery({
    queryKey: keyKeys.list(target),
    queryFn: async () => {
      const query = supabase.from('access_keys').select('*').order('created_at', { ascending: false });
      const { data, error } = await ('jobId' in target ? query.eq('job_id', target.jobId) : query.eq('car_id', target.carId));
      if (error) throw error;
      return [...data].sort((a, b) => Number(Boolean(a.switched_off_at)) - Number(Boolean(b.switched_off_at)));
    },
  });
}

export function useCreateKey(target: KeyTarget) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (note: string) => {
      const { data, error } = await supabase.rpc('create_access_key', {
        p_kind: 'job',
        p_job_id: 'jobId' in target ? target.jobId : (null as unknown as string),
        p_car_id: 'carId' in target ? target.carId : (null as unknown as string),
        p_note: note.trim() || undefined,
      });
      if (error) throw error;
      return data as AccessKey;
    },
    onSuccess: () =>
      Promise.all([queryClient.invalidateQueries({ queryKey: keyKeys.list(target) }), queryClient.invalidateQueries({ queryKey: ['activity'] })]),
  });
}

/** Switch a key off (it stops opening anything) or on again. */
export function useSwitchKey(target: KeyTarget) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, on }: { key: AccessKey; on: boolean }) => {
      const { error } = await supabase
        .from('access_keys')
        .update({ switched_off_at: on ? null : new Date().toISOString() })
        .eq('id', key.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keyKeys.list(target) }),
  });
}
