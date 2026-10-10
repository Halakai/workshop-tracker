// Tools & equipment: the list, one tool and its history, saving, and paying for a tool from workshop money.
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TablesInsert, TablesUpdate } from '@/lib/database.types';
import { allocateByShares } from '@/domain/stock';
import type { Cents } from '@/domain/money';
import type { Share } from '@/domain/shares';
import { useProfiles } from '@/features/auth/profiles';
import { useContacts } from '@/features/contacts/api';
import { useItems, useSuppliers } from '@/features/inventory/api';

/** Tools always come with their category, brand and (if paid from workshop money) the money entry. */
const TOOL_SELECT =
  '*, category:tool_categories(id, name, sort_order), brand:brands(id, name, code), payment:transactions(id, amount_cents, from_account_id, occurred_on)';

async function fetchTools() {
  const { data, error } = await supabase.from('tools').select(TOOL_SELECT).order('name');
  if (error) throw error;
  return data;
}
export type Tool = Awaited<ReturnType<typeof fetchTools>>[number];

export const toolKeys = {
  all: ['tools'] as const,
  history: (id: string) => ['tool-history', id] as const,
};

/** All tools (a workshop has a few hundred at most; filtering happens on the phone). */
export function useTools() {
  return useQuery({ queryKey: toolKeys.all, queryFn: fetchTools });
}

export function useTool(id: string | undefined) {
  const tools = useTools();
  return { ...tools, data: tools.data?.find((t) => t.id === id) };
}

/** What happened to a tool: added, lent, back, repairs, gone (from the activity log). */
export function useToolHistory(id: string | undefined) {
  return useQuery({
    queryKey: toolKeys.history(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('entity_type', 'tool')
        .eq('entity_id', id!)
        .order('at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
}

/** Type-ahead for the tool form and the lend drawer. */
export function useToolSuggestions() {
  const tools = useTools();
  const items = useItems();
  const contacts = useContacts();
  const profiles = useProfiles();
  const suppliers = useSuppliers();
  return useMemo(() => {
    const unique = (values: (string | null | undefined)[]) =>
      [...new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));
    const list = tools.data ?? [];
    return {
      locations: unique([...list.map((t) => t.location), ...(items.data ?? []).map((i) => i.location)]),
      borrowers: unique([
        ...list.map((t) => t.lent_to),
        ...(profiles.data ?? []).filter((p) => p.is_active).map((p) => p.display_name),
        ...(contacts.data ?? []).map((c) => c.name),
      ]),
      sellers: unique([...list.map((t) => t.bought_from), ...(suppliers.data ?? [])]),
    };
  }, [tools.data, items.data, contacts.data, profiles.data, suppliers.data]);
}

function useInvalidateTools() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: toolKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['tool-history'] }),
      queryClient.invalidateQueries({ queryKey: ['activity'] }),
      // saving can add a new brand on the way
      queryClient.invalidateQueries({ queryKey: ['brands'] }),
    ]);
}

function codeError(error: { code?: string; message: string }) {
  return error.code === '23505' && error.message.includes('tools_code_key') ? new Error('This ID is already used by another tool.') : error;
}

export function useSaveTool() {
  const invalidate = useInvalidateTools();
  return useMutation({
    mutationFn: async (args: { id?: string; values: TablesUpdate<'tools'> }) => {
      if (args.id) {
        const { data, error } = await supabase.from('tools').update(args.values).eq('id', args.id).select().single();
        if (error) throw codeError(error);
        return data;
      }
      const { data, error } = await supabase.from('tools').insert(args.values as TablesInsert<'tools'>).select().single();
      if (error) throw codeError(error);
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTool() {
  const invalidate = useInvalidateTools();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('tools').delete().eq('id', id).select();
      if (error) throw error;
      if (!data.length) throw new Error('This tool can’t be deleted.');
    },
    onSuccess: invalidate,
  });
}

/**
 * Puts the tool's price into Money as a workshop expense (cost type "Tools") paid by the wallet or a partner,
 * split by the default profit shares; or updates the entry it already has.
 */
export function useSaveToolPayment() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTools();
  return useMutation({
    mutationFn: async (args: { toolId: string; accountId: string; amount: Cents; shares: Share[] }) => {
      const allocations = allocateByShares(-args.amount, args.shares);
      const { data, error } = await supabase.rpc('save_tool_payment', {
        p_tool_id: args.toolId,
        p_account_id: args.accountId,
        p_allocations: allocations.map((a) => ({ partner_id: a.partnerId, amount_cents: a.amount })),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['allocations'] }),
        queryClient.invalidateQueries({ queryKey: ['expense_categories'] }),
      ]),
  });
}

/** Takes a tool's payment out of Money (the tool stays). */
export function useRemoveToolPayment() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTools();
  return useMutation({
    mutationFn: async (transactionId: string) => {
      const { data, error } = await supabase.from('transactions').delete().eq('id', transactionId).select();
      if (error) throw error;
      if (!data.length) throw new Error('This money entry can’t be removed here.');
    },
    onSuccess: () =>
      Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['allocations'] }),
      ]),
  });
}
