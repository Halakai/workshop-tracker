import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';
import { useProfiles } from '@/features/auth/profiles';

export type Account = Tables<'accounts'>;

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('accounts').select('*');
      if (error) throw error;
      return data;
    },
  });
}

export interface PayerOption {
  accountId: string;
  label: string;
  partnerId: string | null;
}

/** Who can pay or receive money: the wallet and every active partner. */
export function usePayerOptions(): PayerOption[] {
  const accounts = useAccounts();
  const profiles = useProfiles();
  return useMemo(() => {
    if (!accounts.data || !profiles.data) return [];
    const wallet = accounts.data.find((a) => a.kind === 'wallet');
    const partners = profiles.data
      .filter((p) => p.is_active)
      .map((p): PayerOption | null => {
        const account = accounts.data.find((a) => a.partner_id === p.id);
        return account ? { accountId: account.id, label: p.display_name, partnerId: p.id } : null;
      })
      .filter((o): o is PayerOption => o !== null);
    return wallet ? [{ accountId: wallet.id, label: 'Wallet', partnerId: null }, ...partners] : partners;
  }, [accounts.data, profiles.data]);
}

/** Default profit shares of active partners, for splitting overhead. */
export function useDefaultShares() {
  const profiles = useProfiles();
  return useMemo(
    () => (profiles.data ?? []).filter((p) => p.is_active).map((p) => ({ id: p.id, bp: p.default_share_bp })),
    [profiles.data],
  );
}

const LAST_PAYER_KEY = 'wt.lastPayer';

/** Remembered per phone: whoever usually pays is preselected next time. */
export function getLastPayer(): string | null {
  try {
    return localStorage.getItem(LAST_PAYER_KEY);
  } catch {
    return null;
  }
}

export function setLastPayer(accountId: string) {
  try {
    localStorage.setItem(LAST_PAYER_KEY, accountId);
  } catch {
    // private mode etc.
  }
}
