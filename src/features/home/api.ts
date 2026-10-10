import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { MoneyRow } from '@/domain/dashboard';

/** Light money rows since a date, for the dashboard charts (refreshed with every other money change). */
export function useMoneyFlow(since: string) {
  return useQuery({
    queryKey: ['transactions', 'flow', since],
    queryFn: async () => {
      const rows: (MoneyRow & { jobId: string | null })[] = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const { data, error } = await supabase
          .from('transactions')
          .select('occurred_on, kind, category, amount_cents, job_id')
          .gte('occurred_on', since)
          .order('occurred_on')
          .order('id')
          .range(from, from + page - 1);
        if (error) throw error;
        rows.push(
          ...data.map((t) => ({ occurredOn: t.occurred_on, kind: t.kind, category: t.category, amount: t.amount_cents, jobId: t.job_id })),
        );
        if (data.length < page) return rows;
      }
    },
  });
}
