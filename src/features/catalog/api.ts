// The editable lists: item categories, units, brands, suppliers, cost types, tool categories and photo albums.
// Everyone can add entries; only admins can rename or delete them (enforced by RLS).
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/database.types';
import { deriveCode } from '@/domain/codes';

export type Category = Tables<'item_categories'>;
export type UnitEntry = Tables<'units'>;
export type Brand = Tables<'brands'>;
export type ExpenseCategory = Tables<'expense_categories'>;
export type ToolCategory = Tables<'tool_categories'>;
export type PhotoAlbum = Tables<'photo_albums'>;

export type ListTable = 'item_categories' | 'units' | 'brands' | 'expense_categories' | 'tool_categories' | 'photo_albums' | 'service_types';

export const catalogKeys: Record<ListTable, readonly string[]> = {
  item_categories: ['item_categories'],
  units: ['units'],
  brands: ['brands'],
  expense_categories: ['expense_categories'],
  tool_categories: ['tool_categories'],
  photo_albums: ['photo_albums'],
  service_types: ['service_types'],
};

export function useCategories() {
  return useQuery({
    queryKey: catalogKeys.item_categories,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('item_categories').select('*').order('sort_order').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useUnits() {
  return useQuery({
    queryKey: catalogKeys.units,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('units').select('*').order('sort_order').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useBrands() {
  return useQuery({
    queryKey: catalogKeys.brands,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('brands').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: catalogKeys.expense_categories,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_categories').select('*').order('sort_order').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useToolCategories() {
  return useQuery({
    queryKey: catalogKeys.tool_categories,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('tool_categories').select('*').order('sort_order').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useAddToolCategory() {
  const invalidate = useInvalidate('tool_categories');
  return useMutation({
    mutationFn: async (values: TablesInsert<'tool_categories'>) => {
      const { data, error } = await supabase.from('tool_categories').insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useAddServiceType() {
  const invalidate = useInvalidate('service_types');
  return useMutation({
    mutationFn: async (values: TablesInsert<'service_types'>) => {
      const { data, error } = await supabase.from('service_types').insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function usePhotoAlbums() {
  return useQuery({
    queryKey: catalogKeys.photo_albums,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('photo_albums').select('*').order('sort_order').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useAddPhotoAlbum() {
  const invalidate = useInvalidate('photo_albums');
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.from('photo_albums').insert({ name: name.trim() }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useAddExpenseCategory() {
  const invalidate = useInvalidate('expense_categories');
  return useMutation({
    mutationFn: async (values: TablesInsert<'expense_categories'>) => {
      const { data, error } = await supabase.from('expense_categories').insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

function useInvalidate(table: ListTable) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: catalogKeys[table] }),
      // items and tools embed category / unit / brand names, car money shows cost categories
      queryClient.invalidateQueries({ queryKey: ['items'] }),
      queryClient.invalidateQueries({ queryKey: ['tools'] }),
      queryClient.invalidateQueries({ queryKey: ['car-money'] }),
    ]);
}

export function useAddCategory() {
  const invalidate = useInvalidate('item_categories');
  return useMutation({
    mutationFn: async (values: TablesInsert<'item_categories'>) => {
      const { data, error } = await supabase.from('item_categories').insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useAddUnit() {
  const invalidate = useInvalidate('units');
  return useMutation({
    mutationFn: async (values: TablesInsert<'units'>) => {
      const { data, error } = await supabase.from('units').insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Suppliers: purchases keep the name as text; the database adds new names to this list by itself
// and renames them on every purchase when an admin renames one here.
// ---------------------------------------------------------------------------

export interface Supplier {
  id: string;
  name: string;
  /** purchases (stock, car parts, job parts, tools) that name it */
  uses: number;
}

export const supplierKeys = { all: ['suppliers'] as const };

/** The suppliers list, most used first (that's the order type-ahead suggests them in). */
export const supplierListQuery = queryOptions({
  queryKey: supplierKeys.all,
  staleTime: 5 * 60_000,
  queryFn: async (): Promise<Supplier[]> => {
    const { data, error } = await supabase.from('supplier_usage').select('*').order('uses', { ascending: false }).order('name');
    if (error) throw error;
    return data.map((s) => ({ id: s.id!, name: s.name!, uses: s.uses ?? 0 }));
  },
});

export function useSupplierList() {
  return useQuery(supplierListQuery);
}

export function useAddSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.from('suppliers').insert({ name: name.trim() }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supplierKeys.all }),
  });
}

/** Renames it on every purchase too; renaming to a name already on the list merges the two. */
export function useRenameSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.rpc('rename_supplier', { p_id: id, p_name: name.trim() });
      if (error) throw error;
    },
    // the name shows up on purchases all over the app
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('suppliers').delete().eq('id', id).select();
      if (error) throw error.code === '23503' ? new Error('Still used by a purchase. Rename it instead.') : error;
      if (!data.length) throw new Error('Only an admin can delete suppliers.');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supplierKeys.all }),
  });
}

/**
 * Finds the brand with exactly this name (case-sensitive) or adds it with a generated code.
 * Used when saving an item, so typing a new brand name is enough to add it.
 */
export async function ensureBrand(name: string): Promise<Brand> {
  const trimmed = name.trim();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: brands, error } = await supabase.from('brands').select('*');
    if (error) throw error;
    const existing = brands.find((b) => b.name === trimmed);
    if (existing) return existing;
    const code = deriveCode(trimmed, brands.map((b) => b.code), 4);
    const { data, error: insertError } = await supabase.from('brands').insert({ name: trimmed, code }).select().single();
    if (!insertError) return data;
    if (insertError.code !== '23505') throw insertError; // someone added it at the same moment: look again
  }
  throw new Error(`Could not add the brand “${trimmed}”`);
}

export function useUpdateEntry(table: ListTable) {
  const invalidate = useInvalidate(table);
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: TablesUpdate<ListTable> }) => {
      const { data, error } = await supabase
        .from(table as 'brands')
        .update(values as TablesUpdate<'brands'>)
        .eq('id', id)
        .select();
      if (error) throw error;
      if (!data.length) throw new Error('Only an admin can change list entries.');
    },
    onSuccess: invalidate,
  });
}

export function useDeleteEntry(table: ListTable) {
  const invalidate = useInvalidate(table);
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from(table as 'brands').delete().eq('id', id).select();
      if (error) {
        if (error.code === '23503') throw new Error('Still in use. Change the items or tools that use it first.');
        throw error;
      }
      if (!data.length) throw new Error('Only an admin can delete list entries.');
    },
    onSuccess: invalidate,
  });
}
