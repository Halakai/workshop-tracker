// Customer keys (docs/PLAN.md §11): members make them (the database makes the code), change and switch them off.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Json, Tables, TablesUpdate } from '@/lib/database.types';
import type { KeyKind, KeyShows } from '@/domain/keys';

export type AccessKey = Tables<'access_keys'>;
export type KeyTarget = { jobId: string } | { carId: string } | { website: true };

export const keyKeys = {
  all: ['access-keys'] as const,
  list: (target: KeyTarget) =>
    ['access-keys', 'jobId' in target ? `job:${target.jobId}` : 'carId' in target ? `car:${target.carId}` : 'website'] as const,
  everything: ['access-keys', 'everything'] as const,
};

const working = (a: AccessKey, b: AccessKey) => Number(Boolean(a.switched_off_at)) - Number(Boolean(b.switched_off_at));

/** The keys of a job, a car or the website: working ones first, newest first. */
export function useAccessKeys(target: KeyTarget) {
  return useQuery({
    queryKey: keyKeys.list(target),
    queryFn: async () => {
      const query = supabase.from('access_keys').select('*').order('created_at', { ascending: false });
      const filtered = 'jobId' in target ? query.eq('job_id', target.jobId) : 'carId' in target ? query.eq('car_id', target.carId) : query.eq('kind', 'website');
      const { data, error } = await filtered;
      if (error) throw error;
      return [...data].sort(working);
    },
  });
}

async function fetchAllKeys() {
  const { data, error } = await supabase
    .from('access_keys')
    .select('*, job:jobs(id, ref, car_make, car_model, customer:contacts!jobs_customer_id_fkey(name)), car:cars(id, ref, make, model, generation)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
export type KeyWithTarget = Awaited<ReturnType<typeof fetchAllKeys>>[number];

/** Every key, with the job or car it opens (More → Keys). */
export function useAllKeys() {
  return useQuery({ queryKey: keyKeys.everything, queryFn: fetchAllKeys });
}

export interface NewKey {
  kind: KeyKind;
  note: string;
  expiresAt: string | null;
  shows?: KeyShows;
}

export function useCreateKey(target: KeyTarget) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (key: NewKey) => {
      const { data, error } = await supabase.rpc('create_access_key', {
        p_kind: key.kind,
        p_job_id: 'jobId' in target ? target.jobId : undefined,
        p_car_id: 'carId' in target ? target.carId : undefined,
        p_note: key.note.trim() || undefined,
        p_expires_at: key.expiresAt ?? undefined,
        p_shows: key.kind === 'website' ? (key.shows as unknown as Json) : undefined,
      });
      if (error) throw error;
      return data as AccessKey;
    },
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: keyKeys.all }), queryClient.invalidateQueries({ queryKey: ['activity'] })]),
  });
}

/** Change a key while it is in use: name, end date, buyer ↔ owner, what a website key shows, switch off / on. */
export function useUpdateKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, values }: { key: AccessKey; values: Pick<TablesUpdate<'access_keys'>, 'note' | 'expires_at' | 'kind' | 'shows' | 'switched_off_at'> }) => {
      const { data, error } = await supabase.from('access_keys').update(values).eq('id', key.id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keyKeys.all }),
  });
}
