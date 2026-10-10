import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/lib/database.types';
import { toMilli } from '@/domain/quantity';
import { isLowStock, type MovementInput, type StockLevel } from '@/domain/stock';
import { STALE_STOCK, toPostStockMovementArgs } from './rpc';

export type ItemRow = Tables<'items'>;
export type Movement = Tables<'stock_movements'>;

/** Items always come with their category, unit and brand. */
const ITEM_SELECT = '*, category:item_categories(id, name, code), unit:units(id, name, whole_only), brand:brands(id, name, code)';

async function fetchItems() {
  const { data, error } = await supabase.from('items').select(ITEM_SELECT).order('name');
  if (error) throw error;
  return data;
}
export type Item = Awaited<ReturnType<typeof fetchItems>>[number];
export type MovementWithPayment = Movement & { transaction: { from_account_id: string } | null };

export const inventoryKeys = {
  items: ['items'] as const,
  movements: (itemId: string) => ['movements', itemId] as const,
  lastPurchases: ['item-last-purchases'] as const,
  suppliers: ['suppliers'] as const,
};

export function stockOf(item: Pick<ItemRow, 'qty_on_hand' | 'stock_value_cents'>): StockLevel {
  return { qty: toMilli(item.qty_on_hand), value: item.stock_value_cents };
}

export function itemIsLow(item: ItemRow): boolean {
  return !item.archived_at && isLowStock(toMilli(item.qty_on_hand), toMilli(item.min_qty));
}

/** All items (the whole list is small; filtering happens on the phone). */
export function useItems() {
  return useQuery({
    queryKey: inventoryKeys.items,
    queryFn: fetchItems,
  });
}

export function useItem(id: string | undefined) {
  const items = useItems();
  return { ...items, data: items.data?.find((i) => i.id === id) };
}

export function useLowStockItems() {
  const items = useItems();
  return useMemo(() => (items.data ?? []).filter(itemIsLow), [items.data]);
}

export function useItemMovements(itemId: string | undefined) {
  return useQuery({
    queryKey: inventoryKeys.movements(itemId ?? ''),
    enabled: Boolean(itemId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*, transaction:transactions(from_account_id)')
        .eq('item_id', itemId!)
        .order('seq', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });
}

export function useLastPurchases() {
  return useQuery({
    queryKey: inventoryKeys.lastPurchases,
    queryFn: async () => {
      const { data, error } = await supabase.from('item_last_purchases').select('*');
      if (error) throw error;
      return new Map(data.map((p) => [p.item_id!, p]));
    },
  });
}

/** Suppliers we've bought from (stock and car parts), most frequent first (for type-ahead). */
export function useSuppliers() {
  return useQuery({
    queryKey: inventoryKeys.suppliers,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('counterparty')
        .in('category', ['stock_purchase', 'car_part'])
        .not('counterparty', 'is', null);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const row of data) counts.set(row.counterparty!, (counts.get(row.counterparty!) ?? 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    },
  });
}

export function useSaveItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id?: string; values: TablesUpdate<'items'> }) => {
      if (args.id) {
        const { data, error } = await supabase.from('items').update(args.values).eq('id', args.id).select().single();
        if (error) throw partNumberError(error);
        return data;
      }
      const { data, error } = await supabase.from('items').insert(args.values as TablesInsert<'items'>).select().single();
      if (error) throw partNumberError(error);
      return data;
    },
    // saving can add a new brand on the way
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: inventoryKeys.items }),
        queryClient.invalidateQueries({ queryKey: ['brands'] }),
      ]),
  });
}

function partNumberError(error: { code?: string; message: string }) {
  return error.code === '23505' && error.message.includes('part_number')
    ? new Error('This part number is already used by another item.')
    : error;
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: inventoryKeys.items }),
  });
}

function invalidateStock(queryClient: ReturnType<typeof useQueryClient>, itemId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: inventoryKeys.items }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.movements(itemId) }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.lastPurchases }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.suppliers }),
    queryClient.invalidateQueries({ queryKey: ['transactions'] }),
    queryClient.invalidateQueries({ queryKey: ['allocations'] }),
    queryClient.invalidateQueries({ queryKey: ['activity'] }),
    queryClient.invalidateQueries({ queryKey: ['cars'] }),
    queryClient.invalidateQueries({ queryKey: ['car-stock'] }),
  ]);
}

/**
 * Records a stock movement. `build` gets the item as it is in the database RIGHT NOW, so the
 * average-cost math always uses fresh numbers; if someone else changed the item in between,
 * the database refuses (version check) and we simply rebuild and try again.
 */
export function usePostMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, build }: { itemId: string; build: (item: ItemRow) => MovementInput }) => {
      for (let attempt = 0; ; attempt++) {
        const { data: item, error } = await supabase.from('items').select('*').eq('id', itemId).single();
        if (error) throw error;
        const input = build(item);
        const { data, error: rpcError } = await supabase.rpc(
          'post_stock_movement',
          toPostStockMovementArgs(itemId, item.version, input),
        );
        if (!rpcError) return data;
        if (rpcError.code === STALE_STOCK && attempt < 2) continue;
        throw rpcError;
      }
    },
    onSettled: (_data, _error, { itemId }) => invalidateStock(queryClient, itemId),
  });
}

export function useUndoMovement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (movement: Movement) => {
      const { error } = await supabase.rpc('undo_stock_movement', { p_movement_id: movement.id });
      if (error) throw error;
    },
    onSettled: (_data, _error, movement) => invalidateStock(queryClient, movement.item_id),
  });
}

/** The item's unit symbol and whether it only takes whole numbers. */
export function unitOf(item: Item): { name: string; wholeOnly: boolean } {
  return { name: item.unit?.name ?? '', wholeOnly: item.unit?.whole_only ?? false };
}
