import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { toRecordSettlementArgs } from './rpc';

export const settlementKeys = {
  shares: (carId: string) => ['car-shares', carId] as const,
  settlement: (carId: string) => ['settlement', carId] as const,
};

export function useCarShares(carId: string | undefined) {
  return useQuery({
    queryKey: settlementKeys.shares(carId ?? ''),
    enabled: Boolean(carId),
    queryFn: async () => {
      const { data, error } = await supabase.from('car_shares').select('partner_id, share_bp').eq('car_id', carId!);
      if (error) throw error;
      return data;
    },
  });
}

export function useSetCarShares() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ carId, shares }: { carId: string; shares: { partnerId: string; bp: number }[] }) => {
      const { error } = await supabase.rpc('set_car_shares', {
        p_car_id: carId,
        p_shares: shares.map((s) => ({ partner_id: s.partnerId, share_bp: s.bp })),
      });
      if (error) throw error;
    },
    onSuccess: (_d, { carId }) => queryClient.invalidateQueries({ queryKey: settlementKeys.shares(carId) }),
  });
}

/** The car's settlement (if any) with its profit split and transfers. */
export function useSettlement(carId: string | undefined) {
  return useQuery({
    queryKey: settlementKeys.settlement(carId ?? ''),
    enabled: Boolean(carId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements')
        .select('*, allocations(partner_id, amount_cents), transactions(id, from_account_id, to_account_id, amount_cents)')
        .eq('car_id', carId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useInvalidateSettlement() {
  const queryClient = useQueryClient();
  return (carId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: settlementKeys.settlement(carId) }),
      queryClient.invalidateQueries({ queryKey: settlementKeys.shares(carId) }),
      queryClient.invalidateQueries({ queryKey: ['cars'] }),
      queryClient.invalidateQueries({ queryKey: ['car-money', carId] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['allocations'] }),
    ]);
}

export function useRecordSettlement() {
  const invalidate = useInvalidateSettlement();
  return useMutation({
    mutationFn: async (args: ReturnType<typeof toRecordSettlementArgs>) => {
      const { data, error } = await supabase.rpc('record_settlement', args);
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, args) => invalidate(args.p_car_id),
  });
}

export function useUndoSettlement() {
  const invalidate = useInvalidateSettlement();
  return useMutation({
    mutationFn: async (carId: string) => {
      const { error } = await supabase.rpc('undo_settlement', { p_car_id: carId });
      if (error) throw error;
    },
    onSuccess: (_d, carId) => invalidate(carId),
  });
}

/** A partner's profit-share entries with where they came from. */
export function usePartnerAllocations(partnerId: string | undefined) {
  return useQuery({
    queryKey: ['allocations', 'partner', partnerId],
    enabled: Boolean(partnerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('allocations')
        .select(
          'id, amount_cents, occurred_on, created_at, settlement:settlements(car:cars(id, ref, make, model, year)), transaction:transactions(description, category), stock_movement:stock_movements(reason, type, item:items(id, name))',
        )
        .eq('partner_id', partnerId!)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
}
