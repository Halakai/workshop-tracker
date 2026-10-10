import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { TablesInsert, TablesUpdate } from '@/lib/database.types';
import { jobTotals, type JobMoney } from '@/domain/jobs';
import { returnDelta, onCar, issueDelta, type StockDelta } from '@/domain/stock';
import { toMilli } from '@/domain/quantity';
import type { Cents } from '@/domain/money';
import { stockOf } from '@/features/inventory/api';
import { STALE_STOCK } from '@/features/inventory/rpc';
import { toAddJobStockLineArgs, toRemoveJobStockLineArgs } from './rpc';

const JOB_SELECT = '*, customer:contacts!jobs_customer_id_fkey(id, name, phone)';

async function fetchJobs() {
  const [jobs, summaries] = await Promise.all([
    supabase.from('jobs').select(JOB_SELECT).order('created_at', { ascending: false }),
    supabase.from('job_summaries').select('*'),
  ]);
  if (jobs.error) throw jobs.error;
  if (summaries.error) throw summaries.error;
  const byJob = new Map(summaries.data.map((s) => [s.job_id, s]));
  return jobs.data.map((job) => {
    const s = byJob.get(job.id);
    const money: JobMoney = {
      linesCents: s?.lines_cents ?? 0,
      laborCents: job.labor_price_cents,
      paymentsCents: s?.payments_cents ?? 0,
      stockCents: s?.stock_cents ?? 0,
      partsCents: s?.parts_cents ?? 0,
    };
    return { ...job, money, totals: jobTotals(money) };
  });
}
export type Job = Awaited<ReturnType<typeof fetchJobs>>[number];

export const jobKeys = {
  all: ['jobs'] as const,
  lines: (jobId: string) => ['job-lines', jobId] as const,
  money: (jobId: string) => ['job-money', jobId] as const,
};

export function useJobs() {
  return useQuery({ queryKey: jobKeys.all, queryFn: fetchJobs });
}

export function useJob(id: string | undefined) {
  const jobs = useJobs();
  return { ...jobs, data: jobs.data?.find((j) => j.id === id) };
}

/** What the customer is charged, with the cost behind each line. */
export function useJobLines(jobId: string | undefined) {
  return useQuery({
    queryKey: jobKeys.lines(jobId ?? ''),
    enabled: Boolean(jobId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_lines')
        .select(
          '*, movement:stock_movements(id, item_id, qty_delta, value_delta_cents), purchase:transactions(id, amount_cents, from_account_id, counterparty, occurred_on)',
        )
        .eq('job_id', jobId!)
        .order('created_at');
      if (error) throw error;
      return data.map((line) => ({
        ...line,
        cost: line.movement ? -line.movement.value_delta_cents : line.purchase ? line.purchase.amount_cents : 0,
      }));
    },
  });
}
export type JobLine = NonNullable<ReturnType<typeof useJobLines>['data']>[number];

/** The job's ledger rows: bought parts and payments. */
export function useJobMoney(jobId: string | undefined) {
  return useQuery({
    queryKey: jobKeys.money(jobId ?? ''),
    enabled: Boolean(jobId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('job_id', jobId!)
        .order('occurred_on', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useInvalidateJob() {
  const queryClient = useQueryClient();
  return (jobId?: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: jobKeys.all }),
      jobId ? queryClient.invalidateQueries({ queryKey: jobKeys.lines(jobId) }) : null,
      jobId ? queryClient.invalidateQueries({ queryKey: jobKeys.money(jobId) }) : null,
      queryClient.invalidateQueries({ queryKey: ['contacts'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['items'] }),
      queryClient.invalidateQueries({ queryKey: ['movements'] }),
    ]);
}

function refError(error: { code?: string; message: string }) {
  return error.code === '23505' && error.message.includes('ref') ? new Error('This job ID is already used.') : error;
}

export function useSaveJob() {
  const invalidate = useInvalidateJob();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: TablesInsert<'jobs'> }) => {
      if (id) {
        const { data, error } = await supabase.from('jobs').update(values as TablesUpdate<'jobs'>).eq('id', id).select();
        if (error) throw refError(error);
        if (!data.length) throw new Error('This job is settled and can’t be changed anymore.');
        return data[0];
      }
      const { data, error } = await supabase.from('jobs').insert(values).select().single();
      if (error) throw refError(error);
      return data;
    },
    onSuccess: (job) => invalidate(job.id),
  });
}

export function useDeleteJob() {
  const invalidate = useInvalidateJob();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { count } = await supabase.from('job_lines').select('id', { count: 'exact', head: true }).eq('job_id', jobId);
      if (count) throw new Error('Remove the job’s lines first.');
      const { error: moneyError } = await supabase.from('transactions').delete().eq('job_id', jobId);
      if (moneyError) throw moneyError;
      const { error } = await supabase.from('jobs').delete().eq('id', jobId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

/** Parts from stock on a job; reads the item fresh and retries if it changed meanwhile. */
export function useAddJobStockLine() {
  const invalidate = useInvalidateJob();
  return useMutation({
    mutationFn: async (args: {
      jobId: string;
      itemId: string;
      qty: number;
      salePrice: (cost: Cents) => Cents;
      description: string;
      occurredOn: string;
    }) => {
      for (let attempt = 0; ; attempt++) {
        const { data: item, error } = await supabase.from('items').select('*').eq('id', args.itemId).single();
        if (error) throw error;
        const delta: StockDelta = issueDelta(stockOf(item), args.qty);
        const { data, error: rpcError } = await supabase.rpc(
          'add_job_stock_line',
          toAddJobStockLineArgs({
            jobId: args.jobId,
            itemId: args.itemId,
            expectedVersion: item.version,
            delta,
            salePrice: args.salePrice(-delta.value),
            description: args.description,
            occurredOn: args.occurredOn,
          }),
        );
        if (!rpcError) return data;
        if (rpcError.code === STALE_STOCK && attempt < 2) continue;
        throw rpcError;
      }
    },
    onSettled: (_d, _e, args) => invalidate(args.jobId),
  });
}

/** Takes a stock line off: the parts go back at what the job was charged for them. */
export function useRemoveJobStockLine() {
  const invalidate = useInvalidateJob();
  return useMutation({
    mutationFn: async (line: JobLine) => {
      if (!line.movement) throw new Error('Not a stock line');
      const itemId = line.movement.item_id;
      for (let attempt = 0; ; attempt++) {
        const [{ data: item, error }, { data: onJob, error: movesError }] = await Promise.all([
          supabase.from('items').select('version').eq('id', itemId).single(),
          supabase.from('stock_movements').select('qty_delta, value_delta_cents').eq('item_id', itemId).eq('job_id', line.job_id),
        ]);
        if (error) throw error;
        if (movesError) throw movesError;
        const fromJob = onCar(onJob.map((m) => ({ qty: toMilli(m.qty_delta), value: m.value_delta_cents })));
        const back = returnDelta(fromJob, -toMilli(line.movement.qty_delta));
        const { error: rpcError } = await supabase.rpc('remove_job_stock_line', toRemoveJobStockLineArgs(line.id, item.version, back));
        if (!rpcError) return;
        if (rpcError.code === STALE_STOCK && attempt < 2) continue;
        throw rpcError;
      }
    },
    onSettled: (_d, _e, line) => invalidate(line.job_id),
  });
}

export function useSaveBoughtLine() {
  const invalidate = useInvalidateJob();
  return useMutation({
    mutationFn: async (args: {
      lineId?: string;
      jobId: string;
      description: string;
      qty: number;
      cost: Cents;
      paidBy: string;
      supplier: string;
      salePrice: Cents;
      occurredOn: string;
    }) => {
      const { data, error } = await supabase.rpc('save_job_bought_line', {
        p_line_id: (args.lineId ?? null) as unknown as string,
        p_job_id: args.jobId,
        p_description: args.description,
        p_qty: args.qty,
        p_cost_cents: args.cost,
        p_paid_by: args.paidBy,
        p_supplier: args.supplier,
        p_sale_price_cents: args.salePrice,
        p_occurred_on: args.occurredOn,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, args) => invalidate(args.jobId),
  });
}

export function useSaveOtherLine() {
  const invalidate = useInvalidateJob();
  return useMutation({
    mutationFn: async (args: { lineId?: string; jobId: string; description: string; qty: number; salePrice: Cents }) => {
      if (args.lineId) {
        const { data, error } = await supabase
          .from('job_lines')
          .update({ description: args.description, qty: args.qty, sale_price_cents: args.salePrice })
          .eq('id', args.lineId)
          .select();
        if (error) throw error;
        if (!data.length) throw new Error('This job is settled; it can’t be changed anymore.');
        return;
      }
      const { error } = await supabase
        .from('job_lines')
        .insert({ job_id: args.jobId, kind: 'other', description: args.description, qty: args.qty, sale_price_cents: args.salePrice });
      if (error) throw error;
    },
    onSuccess: (_d, args) => invalidate(args.jobId),
  });
}

/** Removes a line: other lines directly, bought ones with their purchase. Stock lines use useRemoveJobStockLine. */
export function useDeleteLine() {
  const invalidate = useInvalidateJob();
  return useMutation({
    mutationFn: async (line: JobLine) => {
      const { data, error } =
        line.kind === 'bought' && line.transaction_id
          ? await supabase.from('transactions').delete().eq('id', line.transaction_id).select()
          : await supabase.from('job_lines').delete().eq('id', line.id).select();
      if (error) throw error;
      if (!data.length) throw new Error('This job is settled; it can’t be changed anymore.');
    },
    onSuccess: (_d, line) => invalidate(line.job_id),
  });
}

export function useSavePayment() {
  const invalidate = useInvalidateJob();
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: TablesInsert<'transactions'> }) => {
      if (id) {
        const { job_id: _j, category: _c, kind: _k, ...editable } = values;
        const { data, error } = await supabase.from('transactions').update(editable).eq('id', id).select();
        if (error) throw error;
        if (!data.length) throw new Error('This job is settled; it can’t be changed anymore.');
        return;
      }
      const { error } = await supabase.from('transactions').insert(values);
      if (error) throw error;
    },
    onSuccess: (_d, { values }) => invalidate(values.job_id ?? undefined),
  });
}

export function useDeletePayment() {
  const invalidate = useInvalidateJob();
  return useMutation({
    mutationFn: async ({ id }: { id: string; jobId: string }) => {
      const { data, error } = await supabase.from('transactions').delete().eq('id', id).select();
      if (error) throw error;
      if (!data.length) throw new Error('This job is settled; it can’t be changed anymore.');
    },
    onSuccess: (_d, { jobId }) => invalidate(jobId),
  });
}

export function useIssueInvoiceNumber() {
  const invalidate = useInvalidateJob();
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data, error } = await supabase.rpc('issue_invoice_number', { p_job_id: jobId });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, jobId) => invalidate(jobId),
  });
}

/** Distinct values for type-ahead, and a customer's earlier cars. */
export function useJobSuggestions(customerName?: string) {
  const jobs = useJobs();
  return useMemo(() => {
    const list = jobs.data ?? [];
    const distinct = (values: (string | null | undefined)[]) =>
      [...new Set(values.filter((v): v is string => Boolean(v && v.trim())).map((v) => v.trim()))].sort((a, b) => a.localeCompare(b));
    const theirs = customerName?.trim()
      ? list.filter((j) => j.customer?.name.toLowerCase() === customerName.trim().toLowerCase())
      : [];
    const cars = new Map<string, { make: string; model: string; generation: string; year: string; engine: string; plate: string; vin: string }>();
    for (const j of theirs) {
      const key = `${j.car_plate ?? ''}|${j.car_make ?? ''}|${j.car_model ?? ''}`;
      if (key !== '||' && !cars.has(key)) {
        cars.set(key, {
          make: j.car_make ?? '',
          model: j.car_model ?? '',
          generation: j.car_generation ?? '',
          year: j.car_year ? String(j.car_year) : '',
          engine: j.car_engine ?? '',
          plate: j.car_plate ?? '',
          vin: j.car_vin ?? '',
        });
      }
    }
    return {
      refs: list.map((j) => j.ref),
      makes: distinct(list.map((j) => j.car_make)),
      models: distinct(list.map((j) => j.car_model)),
      customerCars: [...cars.values()],
    };
  }, [jobs.data, customerName]);
}
