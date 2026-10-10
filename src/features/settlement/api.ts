import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { toRecordSettlementArgs } from './rpc';

/** What is being settled: a car or a job. */
export type Target = { kind: 'car'; id: string } | { kind: 'job'; id: string };

export const settlementKeys = {
  shares: (t: Target) => ['shares', t.kind, t.id] as const,
  settlement: (t: Target) => ['settlement', t.kind, t.id] as const,
};

export function useShares(target: Target) {
  return useQuery({
    queryKey: settlementKeys.shares(target),
    queryFn: async () => {
      const query =
        target.kind === 'car'
          ? supabase.from('car_shares').select('partner_id, share_bp').eq('car_id', target.id)
          : supabase.from('job_shares').select('partner_id, share_bp').eq('job_id', target.id);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useSetShares() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ target, shares }: { target: Target; shares: { partnerId: string; bp: number }[] }) => {
      const p_shares = shares.map((s) => ({ partner_id: s.partnerId, share_bp: s.bp }));
      const { error } =
        target.kind === 'car'
          ? await supabase.rpc('set_car_shares', { p_car_id: target.id, p_shares })
          : await supabase.rpc('set_job_shares', { p_job_id: target.id, p_shares });
      if (error) throw error;
    },
    onSuccess: (_d, { target }) => queryClient.invalidateQueries({ queryKey: settlementKeys.shares(target) }),
  });
}

/** The settlement (if any) with its profit split and transfers. */
export function useSettlement(target: Target) {
  return useQuery({
    queryKey: settlementKeys.settlement(target),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settlements')
        .select('*, allocations(partner_id, amount_cents), transactions(id, from_account_id, to_account_id, amount_cents)')
        .eq(target.kind === 'car' ? 'car_id' : 'job_id', target.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useInvalidateSettlement() {
  const queryClient = useQueryClient();
  return (target: Target) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: settlementKeys.settlement(target) }),
      queryClient.invalidateQueries({ queryKey: settlementKeys.shares(target) }),
      queryClient.invalidateQueries({ queryKey: [target.kind === 'car' ? 'cars' : 'jobs'] }),
      queryClient.invalidateQueries({ queryKey: ['car-money'] }),
      queryClient.invalidateQueries({ queryKey: ['job-money'] }),
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
    onSuccess: (_d, args) =>
      invalidate(args.p_car_id ? { kind: 'car', id: args.p_car_id } : { kind: 'job', id: args.p_job_id! }),
  });
}

export function useUndoSettlement() {
  const invalidate = useInvalidateSettlement();
  return useMutation({
    mutationFn: async (target: Target) => {
      const { error } = await supabase.rpc(
        'undo_settlement',
        target.kind === 'car' ? { p_car_id: target.id } : { p_job_id: target.id },
      );
      if (error) throw error;
    },
    onSuccess: (_d, target) => invalidate(target),
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
          'id, amount_cents, occurred_on, created_at, settlement:settlements(car:cars(id, ref, make, model, year), job:jobs(id, ref, description)), transaction:transactions(description, category), stock_movement:stock_movements(reason, type, item:items(id, name))',
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
