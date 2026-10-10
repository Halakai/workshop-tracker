import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createAuthUser, service, signIn, testEmail, uniqueText, type Client } from './helpers';
import { carFunding, settle } from '@/domain/settlement';
import { toRecordSettlementArgs } from '@/features/settlement/rpc';

let aId: string;
let bId: string;
let asA: Client;
let asB: Client;
let wallet: string;
let external: string;
let accA: string;
let accB: string;
let otherCategory: string;
const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  const ea = testEmail('ledger-a');
  const eb = testEmail('ledger-b');
  aId = await createAuthUser(ea);
  bId = await createAuthUser(eb);
  const { error } = await service.from('profiles').insert([
    { id: aId, display_name: 'Ledger A', email: ea, role: 'member', default_share_bp: 5000 },
    { id: bId, display_name: 'Ledger B', email: eb, role: 'member', default_share_bp: 5000 },
  ]);
  if (error) throw error;
  asA = await signIn(ea);
  asB = await signIn(eb);
  const { data: accounts } = await service.from('accounts').select('id, kind, partner_id');
  wallet = accounts!.find((a) => a.kind === 'wallet')!.id;
  external = accounts!.find((a) => a.kind === 'external')!.id;
  accA = accounts!.find((a) => a.partner_id === aId)!.id;
  accB = accounts!.find((a) => a.partner_id === bId)!.id;
  otherCategory = (await service.from('expense_categories').select('id').eq('name', 'Other').single()).data!.id;
});

const half = () => [
  { partner_id: aId, amount_cents: 0 },
  { partner_id: bId, amount_cents: 0 },
];

describe('direct ledger entries', () => {
  it('members record deposits, withdrawals and transfers', async () => {
    const { error } = await asA.from('transactions').insert([
      { kind: 'deposit', category: 'deposit', amount_cents: 100000, from_account_id: accA, to_account_id: wallet, occurred_on: today },
      { kind: 'withdrawal', category: 'withdrawal', amount_cents: 20000, from_account_id: wallet, to_account_id: accB, occurred_on: today },
      { kind: 'transfer', category: 'transfer', amount_cents: 5000, from_account_id: accA, to_account_id: accB, occurred_on: today },
    ]);
    expect(error).toBeNull();
  });

  it('refuses wrong directions and categories', async () => {
    const backwards = await asA
      .from('transactions')
      .insert({ kind: 'deposit', category: 'deposit', amount_cents: 1, from_account_id: wallet, to_account_id: accA });
    expect(backwards.error).not.toBeNull();
    const mismatch = await asA
      .from('transactions')
      .insert({ kind: 'withdrawal', category: 'deposit', amount_cents: 1, from_account_id: accA, to_account_id: wallet });
    expect(mismatch.error?.code).toBe('23514');
    const sneaky = await asA.from('transactions').insert({
      kind: 'expense',
      category: 'workshop_expense',
      amount_cents: 1,
      from_account_id: wallet,
      to_account_id: external,
      expense_category_id: otherCategory,
    });
    expect(sneaky.error?.code).toBe('42501');
    const fakeSettlement = await asA
      .from('transactions')
      .insert({ kind: 'transfer', category: 'settlement', amount_cents: 1, from_account_id: accA, to_account_id: wallet });
    expect(fakeSettlement.error).not.toBeNull();
  });
});

describe('general workshop money', () => {
  it('an expense is split between partners; a wrong split is refused', async () => {
    const oneSided = await asA.rpc('save_workshop_money', {
      p_id: null as unknown as string,
      p_kind: 'expense',
      p_amount_cents: 1001,
      p_account_id: accA,
      p_occurred_on: today,
      p_expense_category_id: otherCategory,
      p_description: 'Gloves',
      p_allocations: [{ partner_id: aId, amount_cents: -1001 }],
    });
    expect(oneSided.error).toBeNull(); // a 100 % split to one partner is allowed (sum matches)

    const bad = await asA.rpc('save_workshop_money', {
      p_id: null as unknown as string,
      p_kind: 'expense',
      p_amount_cents: 1001,
      p_account_id: accA,
      p_occurred_on: today,
      p_expense_category_id: otherCategory,
      p_allocations: [{ partner_id: aId, amount_cents: -500 }],
    });
    expect(bad.error?.message).toMatch(/don't add up/);

    const ok = await asA.rpc('save_workshop_money', {
      p_id: null as unknown as string,
      p_kind: 'expense',
      p_amount_cents: 1001,
      p_account_id: wallet,
      p_occurred_on: today,
      p_expense_category_id: otherCategory,
      p_description: 'Brake cleaner',
      p_allocations: [
        { partner_id: aId, amount_cents: -501 },
        { partner_id: bId, amount_cents: -500 },
      ],
    });
    expect(ok.error).toBeNull();
    const { data: txn } = await service.from('transactions').select('*').eq('id', ok.data!).single();
    expect(txn).toMatchObject({ category: 'workshop_expense', from_account_id: wallet, to_account_id: external, created_by: aId });

    // edit replaces the split
    const edit = await asB.rpc('save_workshop_money', {
      p_id: ok.data!,
      p_kind: 'expense',
      p_amount_cents: 2000,
      p_account_id: wallet,
      p_occurred_on: today,
      p_expense_category_id: otherCategory,
      p_allocations: [
        { partner_id: aId, amount_cents: -1000 },
        { partner_id: bId, amount_cents: -1000 },
      ],
    });
    expect(edit.error).toBeNull();
    const { data: allocations } = await service.from('allocations').select('amount_cents').eq('transaction_id', ok.data!);
    expect(allocations?.map((a) => a.amount_cents).sort()).toEqual([-1000, -1000]);

    // delete takes the split with it
    const del = await asB.from('transactions').delete().eq('id', ok.data!).select();
    expect(del.data).toHaveLength(1);
    const { data: gone } = await service.from('allocations').select('id').eq('transaction_id', ok.data!);
    expect(gone).toEqual([]);
  });

  it('income makes partners richer', async () => {
    const res = await asA.rpc('save_workshop_money', {
      p_id: null as unknown as string,
      p_kind: 'income',
      p_amount_cents: 3000,
      p_account_id: wallet,
      p_occurred_on: today,
      p_description: 'Scrap metal',
      p_allocations: [
        { partner_id: aId, amount_cents: 1500 },
        { partner_id: bId, amount_cents: 1500 },
      ],
    });
    expect(res.error).toBeNull();
    const { data: txn } = await service.from('transactions').select('from_account_id, to_account_id, category').eq('id', res.data!).single();
    expect(txn).toEqual({ from_account_id: external, to_account_id: wallet, category: 'other_income' });
  });
});

async function soldCar() {
  const { data: car } = await asA
    .from('cars')
    .insert({ ref: uniqueText('S'), make: 'VW', model: 'Golf', status: 'sold' })
    .select()
    .single();
  await asA.from('transactions').insert([
    { car_id: car!.id, category: 'car_purchase', kind: 'expense', amount_cents: 100000, from_account_id: wallet, to_account_id: external },
    { car_id: car!.id, category: 'car_part', kind: 'expense', amount_cents: 20000, from_account_id: accA, to_account_id: external },
    { car_id: car!.id, category: 'car_sale', kind: 'income', amount_cents: 200000, from_account_id: external, to_account_id: accA },
  ]);
  // the trigger copied every active partner's default share; keep just these two for the test
  await service.from('car_shares').delete().eq('car_id', car!.id);
  await service.from('car_shares').insert([
    { car_id: car!.id, partner_id: aId, share_bp: 5000 },
    { car_id: car!.id, partner_id: bId, share_bp: 5000 },
  ]);
  return car!;
}

async function settlementArgs(carId: string, mode: 'retain' | 'payout' = 'retain') {
  const { data: rows } = await service.from('transactions').select('category, from_account_id, to_account_id, amount_cents').eq('car_id', carId);
  const { data: summary } = await service.from('car_summaries').select('stock_cents').eq('car_id', carId).single();
  const funding = carFunding(
    rows!.map((r) => ({ category: r.category, from: r.from_account_id, to: r.to_account_id, amount: r.amount_cents })),
    summary!.stock_cents,
    wallet,
  );
  const input = {
    walletAccountId: wallet,
    shares: [
      { partnerId: aId, accountId: accA, bp: 5000 },
      { partnerId: bId, accountId: accB, bp: 5000 },
    ],
    ...funding,
    mode,
    reimburse: true,
  };
  const result = settle(input);
  return { args: toRecordSettlementArgs(carId, input, result, today), result };
}

describe('settling up a car', () => {
  it('records the profit split and the transfers, then locks the car; undo unlocks it', async () => {
    const car = await soldCar();
    const { args, result } = await settlementArgs(car.id);
    expect(result.profit).toBe(80000);
    expect(result.transfers).toEqual([{ from: accA, to: wallet, amount: 180000 }]);

    const res = await asB.rpc('record_settlement', args);
    expect(res.error).toBeNull();

    const { data: carAfter } = await service.from('cars').select('settled_at').eq('id', car.id).single();
    expect(carAfter?.settled_at).not.toBeNull();
    const { data: allocations } = await service.from('allocations').select('partner_id, amount_cents').eq('settlement_id', res.data!);
    expect(allocations?.reduce((s, a) => s + a.amount_cents, 0)).toBe(80000);
    const { data: transfers } = await service.from('transactions').select('category, from_account_id, to_account_id, amount_cents').eq('settlement_id', res.data!);
    expect(transfers).toEqual([{ category: 'settlement', from_account_id: accA, to_account_id: wallet, amount_cents: 180000 }]);

    // locked
    const again = await asB.rpc('record_settlement', args);
    expect(again.error?.message).toMatch(/already settled/);
    const deleteTransfer = await asA.from('transactions').delete().eq('settlement_id', res.data!).select();
    expect(deleteTransfer.data ?? []).toEqual([]);
    const shares = await asA.rpc('set_car_shares', { p_car_id: car.id, p_shares: half() });
    expect(shares.error).not.toBeNull();

    // undo
    const undo = await asA.rpc('undo_settlement', { p_car_id: car.id });
    expect(undo.error).toBeNull();
    const { data: open } = await service.from('cars').select('settled_at').eq('id', car.id).single();
    expect(open?.settled_at).toBeNull();
    const { data: none } = await service.from('transactions').select('id').eq('settlement_id', res.data!);
    expect(none).toEqual([]);
  });

  it('checks the numbers against the car', async () => {
    const car = await soldCar();
    const { args } = await settlementArgs(car.id);
    const wrongProfit = await asA.rpc('record_settlement', {
      ...args,
      p_allocations: [{ partner_id: aId, amount_cents: 1 }],
    });
    expect(wrongProfit.error?.message).toMatch(/doesn't add up/);

    const { data: outsiderShare } = await service.from('profiles').select('id').neq('id', aId).neq('id', bId).limit(1);
    if (outsiderShare?.length) {
      const toStranger = await asA.rpc('record_settlement', {
        ...args,
        p_allocations: [{ partner_id: outsiderShare[0].id, amount_cents: 80000 }],
      });
      expect(toStranger.error?.message).toMatch(/share in this car/);
    }

    const badTransfer = await asA.rpc('record_settlement', {
      ...args,
      p_transfers: [{ from_account_id: accA, to_account_id: external, amount_cents: 100 }],
    });
    expect(badTransfer.error?.message).toMatch(/Invalid transfer/);
  });

  it('only sold or scrapped cars with complete shares can be settled', async () => {
    const car = await soldCar();
    const { args } = await settlementArgs(car.id);
    await service.from('cars').update({ status: 'listed' }).eq('id', car.id);
    const notSold = await asA.rpc('record_settlement', args);
    expect(notSold.error?.message).toMatch(/sold or scrapped/);

    await service.from('cars').update({ status: 'sold' }).eq('id', car.id);
    await service.from('car_shares').update({ share_bp: 4000 }).eq('car_id', car.id).eq('partner_id', aId);
    const incomplete = await asA.rpc('record_settlement', args);
    expect(incomplete.error?.message).toMatch(/100/);
  });

  it('car shares can be changed while the car is open, and must add up to 100 %', async () => {
    const car = await soldCar();
    const bad = await asA.rpc('set_car_shares', { p_car_id: car.id, p_shares: [{ partner_id: aId, share_bp: 9000 }] });
    expect(bad.error?.message).toMatch(/100/);
    const ok = await asA.rpc('set_car_shares', {
      p_car_id: car.id,
      p_shares: [
        { partner_id: aId, share_bp: 10000 },
        { partner_id: bId, share_bp: 0 },
      ],
    });
    expect(ok.error).toBeNull();
    const { data } = await service.from('car_shares').select('partner_id, share_bp').eq('car_id', car.id);
    expect(data).toEqual([{ partner_id: aId, share_bp: 10000 }]);
  });

  it('signed-out users cannot read settlements or call the functions', async () => {
    const read = await anonClient().from('settlements').select('*');
    expect(read.error).not.toBeNull();
    const call = await anonClient().rpc('undo_settlement', { p_car_id: '00000000-0000-4000-8000-000000000000' });
    expect(call.error).not.toBeNull();
  });
});
