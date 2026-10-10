import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createAuthUser, service, signIn, testEmail, uniqueText, type Client } from './helpers';
import { toPostStockMovementArgs, STALE_STOCK } from '@/features/inventory/rpc';
import { buildAdjustment, buildOverheadUse, buildPurchase, issueDelta, type MovementInput } from '@/domain/stock';
import { toMilli } from '@/domain/quantity';

let memberId: string;
let otherId: string;
let memberAccount: string;
let walletAccount: string;
let externalAccount: string;
let asMember: Client;
let asOutsider: Client;
let shares: { id: string; bp: number }[];
let categoryId: string;
let unitIds: Record<string, string>;

beforeAll(async () => {
  const memberEmail = testEmail('stock-member');
  const otherEmail = testEmail('stock-other');
  const outsiderEmail = testEmail('stock-outsider');
  memberId = await createAuthUser(memberEmail);
  otherId = await createAuthUser(otherEmail);
  await createAuthUser(outsiderEmail);
  const { error } = await service.from('profiles').insert([
    { id: memberId, display_name: 'Stock Member', email: memberEmail, role: 'member', default_share_bp: 5000 },
    { id: otherId, display_name: 'Stock Other', email: otherEmail, role: 'member', default_share_bp: 5000 },
  ]);
  if (error) throw error;
  shares = [
    { id: memberId, bp: 5000 },
    { id: otherId, bp: 5000 },
  ];

  const { data: accounts } = await service.from('accounts').select('id, kind, partner_id');
  memberAccount = accounts!.find((a) => a.partner_id === memberId)!.id;
  walletAccount = accounts!.find((a) => a.kind === 'wallet')!.id;
  externalAccount = accounts!.find((a) => a.kind === 'external')!.id;

  const { data: categories } = await service.from('item_categories').select('id, code');
  categoryId = categories!.find((c) => c.code === 'FLD')!.id;
  const { data: units } = await service.from('units').select('id, name');
  unitIds = Object.fromEntries(units!.map((u) => [u.name, u.id]));

  asMember = await signIn(memberEmail);
  asOutsider = await signIn(outsiderEmail);
});

async function newItem(name: string, unit: 'pcs' | 'L' = 'L') {
  const { data, error } = await asMember
    .from('items')
    .insert({ name, unit_id: unitIds[unit], category_id: categoryId, part_number: uniqueText('T') })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function readItem(id: string) {
  const { data, error } = await service.from('items').select('*').eq('id', id).single();
  if (error) throw error;
  return { ...data, stock: { qty: toMilli(data.qty_on_hand), value: data.stock_value_cents } };
}

async function post(client: Client, itemId: string, input: MovementInput, version?: number) {
  const item = await readItem(itemId);
  return client.rpc('post_stock_movement', toPostStockMovementArgs(itemId, version ?? item.version, input));
}

const today = new Date().toISOString().slice(0, 10);

describe('items', () => {
  it('members can create and edit item details', async () => {
    const item = await newItem('Brake cleaner');
    expect(item.created_by).toBe(memberId);
    const { error } = await asMember.from('items').update({ location: 'Shelf A', min_qty: 2 }).eq('id', item.id);
    expect(error).toBeNull();
  });

  it('quantity, value and version can never be written directly', async () => {
    const insert = await asMember.from('items').insert({
      name: 'Cheat',
      category_id: categoryId,
      unit_id: unitIds.pcs,
      part_number: uniqueText('C'),
      qty_on_hand: 100,
      stock_value_cents: 1,
    });
    expect(insert.error?.code).toBe('42501');

    const item = await newItem('Gloves', 'pcs');
    for (const patch of [{ qty_on_hand: 50 }, { stock_value_cents: 999 }, { version: 7 }]) {
      const res = await asMember.from('items').update(patch).eq('id', item.id);
      expect(res.error?.code, JSON.stringify(patch)).toBe('42501');
    }
    expect((await readItem(item.id)).stock).toEqual({ qty: 0, value: 0 });
  });

  it('stock movements, transactions and allocations can only be written through the functions', async () => {
    const item = await newItem('Direct write');
    const movement = await asMember
      .from('stock_movements')
      .insert({ item_id: item.id, type: 'purchase', qty_delta: 1, value_delta_cents: 100 });
    expect(movement.error?.code).toBe('42501');
    const txn = await asMember.from('transactions').insert({
      amount_cents: 100,
      kind: 'expense',
      category: 'other',
      from_account_id: walletAccount,
      to_account_id: externalAccount,
    });
    expect(txn.error?.code).toBe('42501');
    const alloc = await asMember.from('allocations').insert({ partner_id: memberId, amount_cents: 100, occurred_on: today });
    expect(alloc.error?.code).toBe('42501');
  });

  it('signed-out users and non-members cannot read or post', async () => {
    const item = await newItem('Secret oil');
    const anonRead = await anonClient().from('items').select('*');
    expect(anonRead.error).not.toBeNull();
    const outsiderRead = await asOutsider.from('items').select('*');
    expect(outsiderRead.data).toEqual([]);

    const input = buildPurchase({ qty: 1000, totalCost: 500, paidBy: walletAccount, occurredOn: today });
    const anonPost = await post(anonClient(), item.id, input);
    expect(anonPost.error).not.toBeNull();
    const outsiderPost = await post(asOutsider, item.id, input);
    expect(outsiderPost.error?.code).toBe('42501');
    expect((await readItem(item.id)).stock).toEqual({ qty: 0, value: 0 });
  });
});

describe('purchases', () => {
  it('adds stock and records who paid', async () => {
    const item = await newItem('Engine oil 5W-30');
    const { data: movementId, error } = await post(
      asMember,
      item.id,
      buildPurchase({ qty: 5000, totalCost: 3000, paidBy: memberAccount, occurredOn: today, supplier: 'Auto shop' }),
    );
    expect(error).toBeNull();
    const after = await readItem(item.id);
    expect(after.stock).toEqual({ qty: 5000, value: 3000 });
    expect(after.version).toBe(1);

    const { data: movement } = await service.from('stock_movements').select('*').eq('id', movementId!).single();
    expect(movement).toMatchObject({ type: 'purchase', supplier: 'Auto shop', created_by: memberId });
    const { data: txn } = await service.from('transactions').select('*').eq('id', movement!.transaction_id!).single();
    expect(txn).toMatchObject({
      kind: 'expense',
      category: 'stock_purchase',
      amount_cents: 3000,
      from_account_id: memberAccount,
      to_account_id: externalAccount,
      counterparty: 'Auto shop',
    });

    const { data: log } = await service.from('activity_log').select('summary').eq('entity_id', item.id);
    expect(log?.map((l) => l.summary)).toContain('Bought 5 L Engine oil 5W-30 for 30.00€');
  });

  it('needs a valid payer when it cost money', async () => {
    const item = await newItem('Coolant');
    const noPayer = await asMember.rpc('post_stock_movement', {
      ...toPostStockMovementArgs(item.id, 0, buildPurchase({ qty: 1000, totalCost: 0, paidBy: null, occurredOn: today })),
      p_value_delta_cents: 500,
    });
    expect(noPayer.error?.message).toMatch(/who paid/);
    const external = await post(asMember, item.id, buildPurchase({ qty: 1000, totalCost: 500, paidBy: externalAccount, occurredOn: today }));
    expect(external.error?.message).toMatch(/who paid/);
  });

  it('refuses a stale version (someone else changed the stock)', async () => {
    const item = await newItem('Wipers', 'pcs');
    await post(asMember, item.id, buildPurchase({ qty: 2000, totalCost: 2000, paidBy: walletAccount, occurredOn: today }));
    const stale = await post(asMember, item.id, buildPurchase({ qty: 1000, totalCost: 1000, paidBy: walletAccount, occurredOn: today }), 0);
    expect(stale.error?.code).toBe(STALE_STOCK);
    expect((await readItem(item.id)).stock).toEqual({ qty: 2000, value: 2000 });
  });
});

describe('workshop use and corrections', () => {
  it('overhead use leaves at average cost and is split between partners', async () => {
    const item = await newItem('Degreaser');
    await post(asMember, item.id, buildPurchase({ qty: 3000, totalCost: 1001, paidBy: walletAccount, occurredOn: today }));
    const before = await readItem(item.id);
    const input = buildOverheadUse({ stock: before.stock, qty: 1000, shares, occurredOn: today });
    const { data: movementId, error } = await post(asMember, item.id, input);
    expect(error).toBeNull();
    expect((await readItem(item.id)).stock).toEqual({ qty: 2000, value: 667 });

    const { data: allocations } = await service.from('allocations').select('partner_id, amount_cents').eq('stock_movement_id', movementId!);
    expect(allocations?.reduce((s, a) => s + a.amount_cents, 0)).toBe(-334);
    expect(allocations).toHaveLength(2);
  });

  it('rejects a cost that does not match the average', async () => {
    const item = await newItem('Rags', 'pcs');
    await post(asMember, item.id, buildPurchase({ qty: 4000, totalCost: 1000, paidBy: walletAccount, occurredOn: today }));
    const input = buildOverheadUse({ stock: (await readItem(item.id)).stock, qty: 1000, shares, occurredOn: today });
    const cheap: MovementInput = {
      ...input,
      delta: { qty: -1000, value: -1 },
      allocations: [{ partnerId: memberId, amount: -1 }],
    };
    const res = await post(asMember, item.id, cheap);
    expect(res.error?.message).toMatch(/Cost mismatch/);
  });

  it('rejects using more than is in stock', async () => {
    const item = await newItem('Fuses', 'pcs');
    await post(asMember, item.id, buildPurchase({ qty: 1000, totalCost: 100, paidBy: walletAccount, occurredOn: today }));
    const res = await asMember.rpc('post_stock_movement', {
      ...toPostStockMovementArgs(item.id, 1, {
        type: 'overhead',
        delta: { qty: -2000, value: -100 },
        occurredOn: today,
        allocations: [{ partnerId: memberId, amount: -100 }],
      }),
    });
    expect(res.error?.message).toMatch(/Only 1 pcs/);
  });

  it('rejects allocations that do not add up', async () => {
    const item = await newItem('Sealant');
    await post(asMember, item.id, buildPurchase({ qty: 2000, totalCost: 1000, paidBy: walletAccount, occurredOn: today }));
    const input = buildOverheadUse({ stock: (await readItem(item.id)).stock, qty: 1000, shares, occurredOn: today });
    const res = await post(asMember, item.id, { ...input, allocations: [{ partnerId: memberId, amount: -1 }] });
    expect(res.error?.message).toMatch(/don't add up/);
  });

  it('a correction needs a reason; opening stock uses an entered unit cost', async () => {
    const item = await newItem('Bulbs H7', 'pcs');
    const empty = { qty: 0, value: 0 };
    const noReason = await post(asMember, item.id, {
      ...buildAdjustment({ stock: empty, mode: 'count', amount: 4000, unitCostIfEmpty: 550, shares, occurredOn: today }),
      reason: '',
    });
    expect(noReason.error).not.toBeNull();

    const opening = buildAdjustment({ stock: empty, mode: 'count', amount: 4000, unitCostIfEmpty: 550, shares, occurredOn: today });
    const res = await post(asMember, item.id, opening);
    expect(res.error).toBeNull();
    expect((await readItem(item.id)).stock).toEqual({ qty: 4000, value: 2200 });
    const { data: allocations } = await service.from('allocations').select('amount_cents').eq('stock_movement_id', res.data!);
    expect(allocations?.reduce((s, a) => s + a.amount_cents, 0)).toBe(2200);

    const damaged = await post(asMember, item.id, buildAdjustment({ stock: (await readItem(item.id)).stock, mode: 'damaged', amount: 1000, shares, occurredOn: today }));
    expect(damaged.error).toBeNull();
    expect((await readItem(item.id)).stock).toEqual({ qty: 3000, value: 1650 });
    const { data: movement } = await service.from('stock_movements').select('reason').eq('id', damaged.data!).single();
    expect(movement?.reason).toBe('Damaged');
  });

  it('whole-number units refuse fractions', async () => {
    const item = await newItem('Bolts', 'pcs');
    const res = await post(asMember, item.id, buildPurchase({ qty: 1500, totalCost: 100, paidBy: walletAccount, occurredOn: today }));
    expect(res.error?.message).toMatch(/whole pcs/);
  });

  it('using everything up leaves exactly zero value', async () => {
    const item = await newItem('Clips', 'pcs');
    await post(asMember, item.id, buildPurchase({ qty: 3000, totalCost: 1000, paidBy: walletAccount, occurredOn: today }));
    for (let i = 0; i < 3; i++) {
      const stock = (await readItem(item.id)).stock;
      const res = await post(asMember, item.id, buildOverheadUse({ stock, qty: 1000, shares, occurredOn: today }));
      expect(res.error).toBeNull();
    }
    expect((await readItem(item.id)).stock).toEqual({ qty: 0, value: 0 });
    expect(issueDelta({ qty: 1000, value: 333 }, 1000).value).toBe(-333);
  });
});

describe('undo', () => {
  it('undoing the latest movement restores the exact previous state, including payment', async () => {
    const item = await newItem('Spark plugs', 'pcs');
    await post(asMember, item.id, buildPurchase({ qty: 4000, totalCost: 2400, paidBy: memberAccount, occurredOn: today }));
    const first = await readItem(item.id);
    const second = await post(asMember, item.id, buildPurchase({ qty: 4000, totalCost: 3000, paidBy: memberAccount, occurredOn: today }));
    const { data: secondRow } = await service.from('stock_movements').select('transaction_id').eq('id', second.data!).single();

    const undo = await asMember.rpc('undo_stock_movement', { p_movement_id: second.data! });
    expect(undo.error).toBeNull();
    const after = await readItem(item.id);
    expect(after.stock).toEqual(first.stock);
    const { data: txn } = await service.from('transactions').select('id').eq('id', secondRow!.transaction_id!);
    expect(txn).toEqual([]);
  });

  it('only the latest movement can be undone', async () => {
    const item = await newItem('Fuel filter', 'pcs');
    const a = await post(asMember, item.id, buildPurchase({ qty: 1000, totalCost: 900, paidBy: walletAccount, occurredOn: today }));
    await post(asMember, item.id, buildPurchase({ qty: 1000, totalCost: 1100, paidBy: walletAccount, occurredOn: today }));
    const res = await asMember.rpc('undo_stock_movement', { p_movement_id: a.data! });
    expect(res.error?.message).toMatch(/latest/);
  });

  it('undoing overhead removes its allocations', async () => {
    const item = await newItem('Cable ties', 'pcs');
    await post(asMember, item.id, buildPurchase({ qty: 2000, totalCost: 300, paidBy: walletAccount, occurredOn: today }));
    const use = await post(asMember, item.id, buildOverheadUse({ stock: (await readItem(item.id)).stock, qty: 1000, shares, occurredOn: today }));
    await asMember.rpc('undo_stock_movement', { p_movement_id: use.data! });
    const { data } = await service.from('allocations').select('id').eq('stock_movement_id', use.data!);
    expect(data).toEqual([]);
    expect((await readItem(item.id)).stock).toEqual({ qty: 2000, value: 300 });
  });

  it('items with movements cannot be deleted (archive instead); fresh ones can', async () => {
    const used = await newItem('Old part', 'pcs');
    await post(asMember, used.id, buildPurchase({ qty: 1000, totalCost: 100, paidBy: walletAccount, occurredOn: today }));
    const del = await asMember.from('items').delete().eq('id', used.id);
    expect(del.error?.code).toBe('23503');
    const fresh = await newItem('Typo item', 'pcs');
    const ok = await asMember.from('items').delete().eq('id', fresh.id).select();
    expect(ok.data).toHaveLength(1);
  });
});
