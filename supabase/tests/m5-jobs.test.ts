import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createAuthUser, service, signIn, testEmail, uniqueText, type Client } from './helpers';
import { toPostStockMovementArgs } from '@/features/inventory/rpc';
import { toAddJobStockLineArgs, toRemoveJobStockLineArgs } from '@/features/jobs/rpc';
import { toRecordSettlementArgs } from '@/features/settlement/rpc';
import { buildPurchase, issueDelta, onCar, returnDelta } from '@/domain/stock';
import { jobFunding, settle } from '@/domain/settlement';
import { toMilli } from '@/domain/quantity';

let aId: string;
let bId: string;
let asA: Client;
let asOutsider: Client;
let wallet: string;
let external: string;
let accA: string;
let accB: string;
let customerId: string;
let categoryId: string;
let litres: string;
const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  const ea = testEmail('jobs-a');
  const eb = testEmail('jobs-b');
  const eo = testEmail('jobs-outsider');
  aId = await createAuthUser(ea);
  bId = await createAuthUser(eb);
  await createAuthUser(eo);
  const { error } = await service.from('profiles').insert([
    { id: aId, display_name: 'Jobs A', email: ea, role: 'member', default_share_bp: 5000 },
    { id: bId, display_name: 'Jobs B', email: eb, role: 'member', default_share_bp: 5000 },
  ]);
  if (error) throw error;
  asA = await signIn(ea);
  asOutsider = await signIn(eo);
  const { data: accounts } = await service.from('accounts').select('id, kind, partner_id');
  wallet = accounts!.find((a) => a.kind === 'wallet')!.id;
  external = accounts!.find((a) => a.kind === 'external')!.id;
  accA = accounts!.find((a) => a.partner_id === aId)!.id;
  accB = accounts!.find((a) => a.partner_id === bId)!.id;
  customerId = (await asA.from('contacts').insert({ name: uniqueText('Customer') }).select().single()).data!.id;
  categoryId = (await service.from('item_categories').select('id').eq('code', 'FLD').single()).data!.id;
  litres = (await service.from('units').select('id').eq('name', 'L').single()).data!.id;
});

async function newJob() {
  const { data, error } = await asA
    .from('jobs')
    .insert({ ref: uniqueText('JOB'), customer_id: customerId, description: 'Oil change', labor_price_cents: 5000, car_plate: 'ZG-123-AB' })
    .select()
    .single();
  if (error) throw error;
  // keep just the two test partners' shares
  await service.from('job_shares').delete().eq('job_id', data.id);
  await service.from('job_shares').insert([
    { job_id: data.id, partner_id: aId, share_bp: 5000 },
    { job_id: data.id, partner_id: bId, share_bp: 5000 },
  ]);
  return data;
}

async function oil(qty = 10000, cost = 7000) {
  const { data: item } = await asA
    .from('items')
    .insert({ name: 'Job oil', category_id: categoryId, unit_id: litres, part_number: uniqueText('JO') })
    .select()
    .single();
  await asA.rpc('post_stock_movement', toPostStockMovementArgs(item!.id, 0, buildPurchase({ qty, totalCost: cost, paidBy: wallet, occurredOn: today })));
  return item!;
}

async function stockOf(itemId: string) {
  const { data } = await service.from('items').select('qty_on_hand, stock_value_cents, version').eq('id', itemId).single();
  return { qty: toMilli(data!.qty_on_hand), value: data!.stock_value_cents, version: data!.version };
}

async function summary(jobId: string) {
  return (await service.from('job_summaries').select('*').eq('job_id', jobId).single()).data!;
}

describe('job lines', () => {
  it('a stock line uses parts at average cost and charges the customer its own price', async () => {
    const job = await newJob();
    const item = await oil();
    const stock = await stockOf(item.id);
    const res = await asA.rpc(
      'add_job_stock_line',
      toAddJobStockLineArgs({
        jobId: job.id,
        itemId: item.id,
        expectedVersion: stock.version,
        delta: issueDelta(stock, 4500),
        salePrice: 3500,
        description: 'Engine oil 5W-30',
        occurredOn: today,
      }),
    );
    expect(res.error).toBeNull();
    const { data: line } = await service.from('job_lines').select('*').eq('id', res.data!).single();
    expect(line).toMatchObject({ kind: 'stock', qty: 4.5, unit: 'L', sale_price_cents: 3500, created_by: aId });
    expect(await summary(job.id)).toMatchObject({ stock_cents: 3150, lines_cents: 3500, labor_cents: 5000 });

    // taking it off returns the oil at what the job was charged
    const now = await stockOf(item.id);
    const back = returnDelta(onCar([issueDelta(stock, 4500)]), 4500);
    const remove = await asA.rpc('remove_job_stock_line', toRemoveJobStockLineArgs(res.data!, now.version, back));
    expect(remove.error).toBeNull();
    expect(await stockOf(item.id)).toMatchObject({ qty: 10000, value: 7000 });
    expect(await summary(job.id)).toMatchObject({ stock_cents: 0, lines_cents: 0 });
  });

  it('stock and bought lines can not be inserted directly; other lines can', async () => {
    const job = await newJob();
    const direct = await asA.from('job_lines').insert({ job_id: job.id, kind: 'stock', description: 'x', sale_price_cents: 1 });
    expect(direct.error).not.toBeNull();
    const other = await asA.from('job_lines').insert({ job_id: job.id, kind: 'other', description: 'Disposal fee', sale_price_cents: 500 });
    expect(other.error).toBeNull();
  });

  it('a bought part records who paid and its line; deleting the purchase removes the line', async () => {
    const job = await newJob();
    const res = await asA.rpc('save_job_bought_line', {
      p_line_id: null as unknown as string,
      p_job_id: job.id,
      p_description: 'Wiper blades',
      p_qty: 2,
      p_cost_cents: 2400,
      p_paid_by: accB,
      p_supplier: 'Auto shop',
      p_sale_price_cents: 2800,
      p_occurred_on: today,
    });
    expect(res.error).toBeNull();
    const { data: line } = await service.from('job_lines').select('*').eq('id', res.data!).single();
    const { data: txn } = await service.from('transactions').select('*').eq('id', line!.transaction_id!).single();
    expect(txn).toMatchObject({ category: 'job_part', amount_cents: 2400, from_account_id: accB, job_id: job.id });
    expect(await summary(job.id)).toMatchObject({ parts_cents: 2400, lines_cents: 2800 });

    const edit = await asA.rpc('save_job_bought_line', {
      p_line_id: res.data!,
      p_job_id: job.id,
      p_description: 'Wiper blades (pair)',
      p_qty: 2,
      p_cost_cents: 2600,
      p_paid_by: wallet,
      p_supplier: 'Auto shop',
      p_sale_price_cents: 3000,
      p_occurred_on: today,
    });
    expect(edit.error).toBeNull();
    expect(await summary(job.id)).toMatchObject({ parts_cents: 2600, lines_cents: 3000 });

    await asA.from('transactions').delete().eq('id', line!.transaction_id!);
    const { data: gone } = await service.from('job_lines').select('id').eq('id', res.data!);
    expect(gone).toEqual([]);
  });
});

describe('invoices', () => {
  it('numbers are assigned once, per year, without gaps', async () => {
    const year = String(new Date().getFullYear());
    const j1 = await newJob();
    const j2 = await newJob();
    const n1 = (await asA.rpc('issue_invoice_number', { p_job_id: j1.id })).data!;
    const again = (await asA.rpc('issue_invoice_number', { p_job_id: j1.id })).data!;
    const n2 = (await asA.rpc('issue_invoice_number', { p_job_id: j2.id })).data!;
    expect(n1).toMatch(new RegExp(`^${year}-\\d{3}$`));
    expect(again).toBe(n1);
    expect(Number(n2.slice(5))).toBe(Number(n1.slice(5)) + 1);
    const { data } = await service.from('jobs').select('invoice_number, invoice_date').eq('id', j1.id).single();
    expect(data).toEqual({ invoice_number: n1, invoice_date: today });
  });

  it('members can not set invoice numbers directly', async () => {
    const job = await newJob();
    const res = await asA.from('jobs').update({ invoice_number: '1999-999' } as never).eq('id', job.id);
    expect(res.error?.code).toBe('42501');
  });
});

describe('payment and settling up a job', () => {
  it('a paid job splits its profit; once settled it is locked; undo opens it again', async () => {
    const job = await newJob();
    await asA.from('job_lines').insert({ job_id: job.id, kind: 'other', description: 'Diagnostics', sale_price_cents: 1500 });
    await asA.rpc('save_job_bought_line', {
      p_line_id: null as unknown as string,
      p_job_id: job.id,
      p_description: 'Filter',
      p_qty: 1,
      p_cost_cents: 1000,
      p_paid_by: accA,
      p_supplier: null as unknown as string,
      p_sale_price_cents: 1200,
      p_occurred_on: today,
    });
    // due: 1500 + 1200 + 5000 labor = 7700; customer pays B
    const pay = await asA.from('transactions').insert({
      job_id: job.id,
      category: 'job_payment',
      kind: 'income',
      amount_cents: 7700,
      from_account_id: external,
      to_account_id: accB,
      occurred_on: today,
    });
    expect(pay.error).toBeNull();

    const notPaid = await asA.rpc('record_settlement', {
      p_job_id: job.id,
      p_payout_mode: 'retain',
      p_reimburse: true,
      p_settled_on: today,
      p_allocations: [],
      p_transfers: [],
    });
    expect(notPaid.error?.message).toMatch(/paid job/);

    await asA.from('jobs').update({ status: 'paid' }).eq('id', job.id);
    const { data: rows } = await service.from('transactions').select('category, from_account_id, to_account_id, amount_cents').eq('job_id', job.id);
    const s = await summary(job.id);
    const input = {
      walletAccountId: wallet,
      shares: [
        { partnerId: aId, accountId: accA, bp: 5000 },
        { partnerId: bId, accountId: accB, bp: 5000 },
      ],
      ...jobFunding(rows!.map((r) => ({ category: r.category, from: r.from_account_id, to: r.to_account_id, amount: r.amount_cents })), s.stock_cents ?? 0, wallet),
      mode: 'payout' as const,
      reimburse: true,
    };
    const result = settle(input);
    expect(result.profit).toBe(6700);
    const res = await asA.rpc('record_settlement', toRecordSettlementArgs({ jobId: job.id }, input, result, today));
    expect(res.error).toBeNull();

    const locked = await asA.from('job_lines').insert({ job_id: job.id, kind: 'other', description: 'Late', sale_price_cents: 1 });
    expect(locked.error).not.toBeNull();
    const lockedPay = await asA.from('transactions').insert({
      job_id: job.id,
      category: 'job_payment',
      kind: 'income',
      amount_cents: 1,
      from_account_id: external,
      to_account_id: wallet,
    });
    expect(lockedPay.error).not.toBeNull();
    const lockedEdit = await asA.from('jobs').update({ description: 'changed' }).eq('id', job.id).select();
    expect(lockedEdit.data ?? []).toEqual([]);

    const undo = await asA.rpc('undo_settlement', { p_job_id: job.id });
    expect(undo.error).toBeNull();
    const { data: open } = await service.from('jobs').select('settled_at').eq('id', job.id).single();
    expect(open?.settled_at).toBeNull();
  });

  it('job shares: "all to one person" works and must add up to 100 %', async () => {
    const job = await newJob();
    const bad = await asA.rpc('set_job_shares', { p_job_id: job.id, p_shares: [{ partner_id: aId, share_bp: 5000 }] });
    expect(bad.error).not.toBeNull();
    const ok = await asA.rpc('set_job_shares', { p_job_id: job.id, p_shares: [{ partner_id: aId, share_bp: 10000 }] });
    expect(ok.error).toBeNull();
    const { data } = await service.from('job_shares').select('partner_id, share_bp').eq('job_id', job.id);
    expect(data).toEqual([{ partner_id: aId, share_bp: 10000 }]);
  });
});

describe('who can see jobs', () => {
  it.each(['jobs', 'job_lines', 'job_shares', 'job_summaries'] as const)('signed-out users and non-members see no %s', async (table) => {
    const anon = await anonClient().from(table as 'jobs').select('*');
    expect(anon.error).not.toBeNull();
    const outsider = await asOutsider.from(table as 'jobs').select('*');
    expect(outsider.data ?? []).toEqual([]);
  });

  it('counters are invisible to everyone but the database', async () => {
    const res = await asA.from('counters' as 'jobs').select('*');
    expect(res.error).not.toBeNull();
  });
});
