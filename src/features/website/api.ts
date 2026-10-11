// The public website's content: cars and jobs on it, their photos, and the texts (docs/PLAN.md §10).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/database.types';
import { fileKeys, type Attachment, type EntityType } from '@/features/files/api';

export const websiteKeys = {
  settings: ['website-settings'] as const,
  hours: ['website-hours'] as const,
  list: (table: WebsiteList) => ['website', table] as const,
  cars: ['website-cars'] as const,
  status: ['website-status'] as const,
};

// ---------------------------------------------------------------------------
// Publishing: the files function starts the website build on GitHub (about 2–3 minutes)
// ---------------------------------------------------------------------------
export interface PublishRun {
  status: 'queued' | 'in_progress' | 'waiting' | 'requested' | 'pending' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | null;
  started: string;
  updated: string;
  url: string;
}

export async function publishWebsite() {
  const { error } = await supabase.functions.invoke('files/site-publish', { body: {} });
  if (error) throw new Error(await errorMessage(error));
}

/** The latest website build; asks again every 10 s while `poll` (a build is starting or running). */
export function useWebsiteStatus(poll: boolean) {
  return useQuery({
    queryKey: websiteKeys.status,
    retry: false,
    refetchInterval: poll ? 10_000 : false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('files/site-status', { body: {} });
      if (error) throw new Error(await errorMessage(error));
      return data as PublishRun | null;
    },
  });
}

export function usePublishWebsite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: publishWebsite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['activity'] }),
  });
}

// ---------------------------------------------------------------------------
// Texts (admins edit; RLS turns a member's edit into "no rows")
// ---------------------------------------------------------------------------
export type WebsiteSettings = Tables<'website_settings'>;

export function useWebsiteSettings() {
  return useQuery({
    queryKey: websiteKeys.settings,
    queryFn: async () => {
      const { data, error } = await supabase.from('website_settings').select('*').single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateWebsiteSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: TablesUpdate<'website_settings'>) => {
      const { data, error } = await supabase.from('website_settings').update(values).eq('id', true).select();
      if (error) throw error;
      if (!data.length) throw new Error('Only an admin can change the website.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: websiteKeys.settings }),
  });
}

export type WebsiteHours = Tables<'website_hours'>;

export function useWebsiteHours() {
  return useQuery({
    queryKey: websiteKeys.hours,
    queryFn: async () => {
      const { data, error } = await supabase.from('website_hours').select('*').order('weekday');
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateWebsiteHours() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Pick<WebsiteHours, 'weekday' | 'opens' | 'closes'>[]) => {
      for (const row of rows) {
        const { data, error } = await supabase
          .from('website_hours')
          .update({ opens: row.opens, closes: row.closes })
          .eq('weekday', row.weekday)
          .select();
        if (error) throw error;
        if (!data.length) throw new Error('Only an admin can change the website.');
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: websiteKeys.hours }),
  });
}

// ---------------------------------------------------------------------------
// Contact buttons, services, reviews: small ordered lists
// ---------------------------------------------------------------------------
export type WebsiteList = 'website_contacts' | 'website_services' | 'website_reviews';
export type WebsiteContact = Tables<'website_contacts'>;
export type WebsiteService = Tables<'website_services'>;
export type WebsiteReview = Tables<'website_reviews'>;
type RowOf<T extends WebsiteList> = Tables<T>;
// supabase-js can't type one query over a choice of tables; the callers' values are typed per table
const listTable = (table: WebsiteList) => supabase.from(table as 'website_services');
type AnyListUpdate = TablesUpdate<'website_services'>;

export function useWebsiteList<T extends WebsiteList>(table: T) {
  return useQuery({
    queryKey: websiteKeys.list(table),
    queryFn: async () => {
      const { data, error } = await listTable(table).select('*').order('sort_order').order('created_at');
      if (error) throw error;
      return data as unknown as RowOf<T>[];
    },
  });
}

/** Adds (no id yet; it goes last) or changes a row. */
export function useSaveWebsiteRow<T extends WebsiteList>(table: T) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, values, lastSort }: { id?: string; values: Omit<TablesInsert<T>, 'id'>; lastSort?: number }) => {
      const { data, error } = id
        ? await listTable(table).update(values as AnyListUpdate).eq('id', id).select()
        : await listTable(table).insert({ ...values, sort_order: (lastSort ?? 0) + 10 } as unknown as TablesInsert<'website_services'>).select();
      if (error) throw error;
      if (!data?.length) throw new Error('Only an admin can change the website.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: websiteKeys.list(table) }),
  });
}

export function useDeleteWebsiteRow(table: WebsiteList) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await listTable(table).delete().eq('id', id).select();
      if (error) throw error;
      if (!data.length) throw new Error('Only an admin can change the website.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: websiteKeys.list(table) }),
  });
}

/** Swaps two neighbours' places (the ↑ ↓ buttons). */
export function useSwapWebsiteRows(table: WebsiteList) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ([a, b]: [{ id: string; sort_order: number }, { id: string; sort_order: number }]) => {
      // equal numbers (rows added at the same time) would swap to the same place
      const [first, second] = a.sort_order === b.sort_order ? [b.sort_order + 1, a.sort_order] : [b.sort_order, a.sort_order];
      for (const [id, sort_order] of [[a.id, first], [b.id, second]] as const) {
        const { error } = await listTable(table).update({ sort_order }).eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: websiteKeys.list(table) }),
  });
}

// ---------------------------------------------------------------------------
// Cars and jobs on the website (any member)
// ---------------------------------------------------------------------------
async function fetchWebsiteCars() {
  const { data, error } = await supabase
    .from('website_cars')
    .select('*, car:cars(id, ref, make, model, status), job:jobs(id, ref, car_make, car_model)')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}
export type WebsiteCar = Awaited<ReturnType<typeof fetchWebsiteCars>>[number];

export function useWebsiteCars() {
  return useQuery({ queryKey: websiteKeys.cars, queryFn: fetchWebsiteCars });
}

export function useWebsiteCar(target: { carId: string } | { jobId: string }) {
  const cars = useWebsiteCars();
  const data = cars.data?.find((w) => ('carId' in target ? w.car_id === target.carId : w.job_id === target.jobId)) ?? null;
  return { ...cars, data };
}

export type WebsiteCarValues = Omit<TablesInsert<'website_cars'>, 'id' | 'car_id' | 'job_id'>;

export function useSaveWebsiteCar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, target, values }: { id?: string; target: { car_id: string } | { job_id: string }; values: WebsiteCarValues }) => {
      const { error } = id
        ? await supabase.from('website_cars').update(values).eq('id', id)
        : await supabase.from('website_cars').insert({ ...values, ...target });
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: websiteKeys.cars }),
        queryClient.invalidateQueries({ queryKey: ['activity'] }),
      ]),
  });
}

export function useDeleteWebsiteCar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('website_cars').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: websiteKeys.cars }),
  });
}

/** Shows a car's or job's photo on the website, or takes it off. */
export function useSetPhotoOnWebsite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ photo, on }: { photo: Attachment; on: boolean }) => {
      const { error } = await supabase.rpc('set_photo_on_website', { p_attachment_id: photo.id, p_on: on });
      if (error) throw error;
    },
    onMutate: async ({ photo, on }) => {
      // tapping through a grid of photos should feel instant
      const key = fileKeys.list(photo.entity_type as EntityType, photo.entity_id);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<Attachment[]>(key, (rows) => rows?.map((r) => (r.id === photo.id ? { ...r, on_website: on } : r)));
    },
    onSettled: (_d, _e, { photo }) => queryClient.invalidateQueries({ queryKey: fileKeys.list(photo.entity_type as EntityType, photo.entity_id) }),
  });
}
