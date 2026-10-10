import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TablesInsert, TablesUpdate } from '@/lib/database.types';
import { accountBalance, capitalShares, partnerPositions, type PartnerPosition } from '@/domain/ledger';
import { allocateByShares } from '@/domain/stock';
import type { Cents } from '@/domain/money';
import type { Share } from '@/domain/shares';
import { useProfiles } from '@/features/auth/profiles';
import { useAccounts } from './accounts';

export const moneyKeys = {
  ledger: ['transactions', 'ledger'] as const,
  list: ['transactions', 'list'] as const,
  allocations: ['allocations'] as const,
};

/** Every transaction and allocation, light: enough to compute all balances. */
export function useLedger() {
  const transactions = useQuery({
    queryKey: moneyKeys.ledger,
    queryFn: async () => {
      const { data, error } = await supabase.from('transactions').select('id, from_account_id, to_account_id, amount_cents');
      if (error) throw error;
      return data.map((t) => ({ from: t.from_account_id, to: t.to_account_id, amount: t.amount_cents }));
    },
  });
  const allocations = useQuery({
    queryKey: moneyKeys.allocations,
    queryFn: async () => {
      const { data, error } = await supabase.from('allocations').select('partner_id, amount_cents');
      if (error) throw error;
      return data.map((a) => ({ partnerId: a.partner_id, amount: a.amount_cents }));
    },
  });
  return { transactions, allocations, isPending: transactions.isPending || allocations.isPending };
}

export function useWalletBalance(): Cents | null {
  const { transactions } = useLedger();
  const accounts = useAccounts();
  return useMemo(() => {
    const wallet = accounts.data?.find((a) => a.kind === 'wallet');
    if (!wallet || !transactions.data) return null;
    return accountBalance(wallet.id, transactions.data);
  }, [accounts.data, transactions.data]);
}

export interface PartnerRow extends PartnerPosition {
  name: string;
  isActive: boolean;
  capitalBp: number;
}

export function usePartnerPositions(): PartnerRow[] | null {
  const { transactions, allocations } = useLedger();
  const accounts = useAccounts();
  const profiles = useProfiles();
  return useMemo(() => {
    if (!transactions.data || !allocations.data || !accounts.data || !profiles.data) return null;
    const partners = profiles.data
      .map((p) => ({ profile: p, account: accounts.data.find((a) => a.partner_id === p.id) }))
      .filter((x) => x.account);
    const positions = partnerPositions(
      partners.map((x) => ({ partnerId: x.profile.id, accountId: x.account!.id })),
      transactions.data,
      allocations.data,
    );
    const shares = capitalShares(positions);
    return positions
      .map((pos) => {
        const profile = partners.find((x) => x.profile.id === pos.partnerId)!.profile;
        return { ...pos, name: profile.display_name, isActive: profile.is_active, capitalBp: shares.get(pos.partnerId) ?? 0 };
      })
      .filter((p) => p.isActive || p.putIn || p.takenOut || p.profitShare);
  }, [transactions.data, allocations.data, accounts.data, profiles.data]);
}

/** Transactions with what they belong to, newest first. */
export function useTransactions() {
  return useQuery({
    queryKey: moneyKeys.list,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*, car:cars(id, ref, make, model, year), expense_category:expense_categories(name)')
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });
}
export type TransactionRow = NonNullable<ReturnType<typeof useTransactions>['data']>[number];

/** "Wallet", a partner's name or "outside" for an account id. */
export function useAccountLabels(): (accountId: string) => string {
  const accounts = useAccounts();
  const profiles = useProfiles();
  return useMemo(() => {
    const labels = new Map<string, string>();
    for (const a of accounts.data ?? []) {
      if (a.kind === 'wallet') labels.set(a.id, 'Wallet');
      else if (a.kind === 'external') labels.set(a.id, 'outside');
      else labels.set(a.id, profiles.data?.find((p) => p.id === a.partner_id)?.display_name ?? 'partner');
    }
    return (id: string) => labels.get(id) ?? '—';
  }, [accounts.data, profiles.data]);
}

function useInvalidateMoney() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: moneyKeys.allocations }),
      queryClient.invalidateQueries({ queryKey: ['cars'] }),
      queryClient.invalidateQueries({ queryKey: ['car-money'] }),
    ]);
}

/** Deposits, withdrawals and transfers: plain rows, no profit split. */
export function useSaveDirectEntry() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: TablesInsert<'transactions'> }) => {
      if (id) {
        const { kind: _k, category: _c, ...editable } = values;
        const { data, error } = await supabase.from('transactions').update(editable as TablesUpdate<'transactions'>).eq('id', id).select();
        if (error) throw error;
        if (!data.length) throw new Error('This entry can’t be changed.');
        return data[0];
      }
      const { data, error } = await supabase.from('transactions').insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

/** A workshop expense or other income, split between partners by their default shares. */
export function useSaveWorkshopMoney() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async (args: {
      id?: string;
      kind: 'expense' | 'income';
      amount: Cents;
      accountId: string;
      occurredOn: string;
      expenseCategoryId?: string;
      description?: string;
      counterparty?: string;
      shares: Share[];
    }) => {
      const allocations = allocateByShares(args.kind === 'expense' ? -args.amount : args.amount, args.shares);
      const { data, error } = await supabase.rpc('save_workshop_money', {
        p_id: (args.id ?? null) as unknown as string,
        p_kind: args.kind,
        p_amount_cents: args.amount,
        p_account_id: args.accountId,
        p_occurred_on: args.occurredOn,
        p_expense_category_id: args.expenseCategoryId,
        p_description: args.description,
        p_counterparty: args.counterparty,
        p_allocations: allocations.map((a) => ({ partner_id: a.partnerId, amount_cents: a.amount })),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('transactions').delete().eq('id', id).select();
      if (error) throw error;
      if (!data.length) throw new Error('This entry can’t be deleted here.');
    },
    onSuccess: invalidate,
  });
}
