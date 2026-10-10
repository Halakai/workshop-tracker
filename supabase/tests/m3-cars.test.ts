import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createAuthUser, service, signIn, testEmail, uniqueText, type Client } from './helpers';
import { toPostStockMovementArgs } from '@/features/inventory/rpc';
import { buildOverheadUse, buildPurchase, buildReturnFromCar, buildUseOnCar, onCar, type MovementInput } from '@/domain/stock';
import { toMilli } from '@/domain/quantity';

let adminId: string;
let memberId: string;
let asAdmin: Client;
let asMember: Client;
let asOutsider: Client;
let wallet: string;
let external: string;
let memberAccount: string;
let otherCategory: string;
let categoryId: string;
let litres: string;

const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  const emails = { admin: testEmail('cars-admin'), member: testEmail('cars-member'), outsider: testEmail('cars-outsider') };
  adminId = await createAuthUser(emails.admin);
  memberId = await createAuthUser(emails.member);
  await createAuthUser(emails.outsider);
  const { error } = await service.from('profiles').insert([
    { id: adminId, display_name: 'Cars Admin', email: emails.admin, role: 'admin', default_share_bp: 5000 },
    { id: memberId, display_name: 'Cars Member', email: emails.member, role: 'member', default_share_bp: 5000 },
  ]);
  if (error) throw error;
  asAdmin = await signIn(emails.admin);
  asMember = await signIn(emails.member);
  asOutsider = await signIn(emails.outsider);

  const { data: accounts } = await service.from('accounts').select('id, kind, partner_id');
  wallet = accounts!.find((a) => a.kind === 'wallet')!.id;
  external = accounts!.find((a) => a.kind === 'external')!.id;
  memberAccount = accounts!.find((a) => a.partner_id === memberId)!.id;
  otherCategory = (await service.from('expense_categories').select('id').eq('name', 'Other').single()).data!.id;
  categoryId = (await service.from('item_categories').select('id').eq('code', 'FLD').single()).data!.id;
  litres = (await service.from('units').select('id').eq('name', 'L').single()).data!.id;
});

async function newCar(client: Client = asMember) {
  const { data, error } = await client
    .from('cars')
    .insert({ ref: uniqueText('CAR'), make: 'Škoda', model: 'Octavia', year: 2012, purchase_date: today })
    .select()
    .single();
  if (error) throw error;
  return data;
}

function expense(carId: string, category: string, amount: number, extra: Record<string, unknown> = {}) {
  return {
    car_id: carId,
    category,
    kind: 'expense' as const,
    amount_cents: amount,
    from_account_id: wallet,
    to_account_id: external,
    occurred_on: today,
    ...extra,
  };
}

async function summary(carId: string) {
  const { data, error } = await service.from('car_summaries').select('*').eq('car_id', carId).single();
  if (error) throw error;
  return data;
}

async function newStockedItem(qtyMilli: number, totalCents: number) {
  const { data: item, error } = await asMember
    .from('items')
    .insert({ name: 'Oil for cars', category_id: categoryId, unit_id: litres, part_number: uniqueText('OIL') })
    .select()
    .single();
  if (error) throw error;
  await post(item.id, buildPurchase({ qty: qtyMilli, totalCost: totalCents, paidBy: wallet, occurredOn: today }));
  return item;
}

async function itemStock(id: string) {
  const { data } = await service.from('items').select('qty_on_hand, stock_value_cents, version').eq('id', id).single();
  return { qty: toMilli(data!.qty_on_hand), value: data!.stock_value_cents, version: data!.version };
}

async function post(itemId: string, input: MovementInput, client: Client = asMember) {
  const { version } = await itemStock(itemId);
  return client.rpc('post_stock_movement', toPostStockMovementArgs(itemId, version, input));
}

describe('cars and their money', () => {
  it('a new car gets the default profit shares', async () => {
    const car = await newCar();
    const { data: shares } = await service.from('car_shares').select('partner_id, share_bp').eq('car_id', car.id);
    expect(shares).toEqual(expect.arrayContaining([{ partner_id: memberId, share_bp: 5000 }]));
    expect(car.created_by).toBe(memberId);
  });

  it('car ids are unique ignoring case', async () => {
    const car = await newCar();
    const dup = await asMember.from('cars').insert({ ref: car.ref.toLowerCase(), make: 'VW', model: 'Golf' });
    expect(dup.error?.code).toBe('23505');
  });

  it('records purchase, parts, other costs and sale, and sums them per car', async () => {
    const car = await newCar();
    const rows = [
      expense(car.id, 'car_purchase', 150000, { from_account_id: memberAccount, counterparty: 'Seller' }),
      expense(car.id, 'car_part', 12000, { description: 'Brake pads' }),
      expense(car.id, 'car_cost', 4500, { expense_category_id: otherCategory, description: 'Towing' }),
      {
        car_id: car.id,
        category: 'car_sale',
        kind: 'income' as const,
        amount_cents: 230000,
        from_account_id: external,
        to_account_id: wallet,
        occurred_on: today,
      },
    ];
    const { error } = await asMember.from('transactions').insert(rows);
    expect(error).toBeNull();
    expect(await summary(car.id)).toMatchObject({
      purchase_cents: 150000,
      parts_cents: 12000,
      other_costs_cents: 4500,
      sale_cents: 230000,
      sale_count: 1,
      stock_cents: 0,
    });
  });

  it('only one purchase per car', async () => {
    const car = await newCar();
    await asMember.from('transactions').insert(expense(car.id, 'car_purchase', 1000));
    const second = await asMember.from('transactions').insert(expense(car.id, 'car_purchase', 2000));
    expect(second.error?.code).toBe('23505');
  });

  it('enforces the money rules', async () => {
    const car = await newCar();
    const noCategory = await asMember.from('transactions').insert(expense(car.id, 'car_cost', 100));
    expect(noCategory.error?.code).toBe('23514');
    const saleAsExpense = await asMember.from('transactions').insert(expense(car.id, 'car_sale', 100));
    expect(saleAsExpense.error?.code).toBe('23514');
    const wrongDirection = await asMember
      .from('transactions')
      .insert({ ...expense(car.id, 'car_part', 100), from_account_id: external, to_account_id: wallet });
    expect(wrongDirection.error).not.toBeNull();
    const noCar = await asMember.from('transactions').insert({ ...expense(car.id, 'car_part', 100), car_id: null });
    expect(noCar.error).not.toBeNull();
  });

  it('members cannot write non-car money directly', async () => {
    const stock = await asMember.from('transactions').insert({ ...expense('', 'stock_purchase', 100), car_id: undefined });
    expect(stock.error).not.toBeNull();
  });

  it('members can edit and delete car money; it records who changed it', async () => {
    const car = await newCar();
    const { data: row } = await asMember.from('transactions').insert(expense(car.id, 'car_part', 5000)).select().single();
    const { data: edited, error } = await asAdmin
      .from('transactions')
      .update({ amount_cents: 5500, from_account_id: memberAccount })
      .eq('id', row!.id)
      .select()
      .single();
    expect(error).toBeNull();
    expect(edited).toMatchObject({ amount_cents: 5500, created_by: memberId, updated_by: adminId });
    const del = await asMember.from('transactions').delete().eq('id', row!.id).select();
    expect(del.data).toHaveLength(1);
  });
});

describe('parts from stock on cars', () => {
  it('use on a car charges the average cost to the car', async () => {
    const car = await newCar();
    const item = await newStockedItem(10000, 7000);
    const res = await post(item.id, buildUseOnCar({ stock: await itemStock(item.id), qty: 4500, carId: car.id, occurredOn: today }));
    expect(res.error).toBeNull();
    expect(await itemStock(item.id)).toMatchObject({ qty: 5500, value: 3850 });
    expect((await summary(car.id)).stock_cents).toBe(3150);
    const { data: allocations } = await service.from('allocations').select('id').eq('stock_movement_id', res.data!);
    expect(allocations).toEqual([]);
  });

  it('a car is required for use_car, and overhead can not name a car', async () => {
    const car = await newCar();
    const item = await newStockedItem(2000, 1000);
    const stock = await itemStock(item.id);
    const noCar = await post(item.id, { ...buildUseOnCar({ stock, qty: 1000, carId: car.id, occurredOn: today }), carId: undefined });
    expect(noCar.error?.message).toMatch(/Choose a car/);
    const overheadWithCar = await post(item.id, {
      ...buildOverheadUse({ stock, qty: 1000, shares: [{ id: memberId, bp: 10000 }], occurredOn: today }),
      carId: car.id,
    });
    expect(overheadWithCar.error).not.toBeNull();
  });

  it('returns come back at what the car was charged, never more than was used', async () => {
    const car = await newCar();
    const item = await newStockedItem(3000, 1000);
    await post(item.id, buildUseOnCar({ stock: await itemStock(item.id), qty: 3000, carId: car.id, occurredOn: today }));
    // someone buys more at a different price in between
    await post(item.id, buildPurchase({ qty: 1000, totalCost: 900, paidBy: wallet, occurredOn: today }));

    const fromCar = onCar([{ qty: -3000, value: -1000 }]);
    const tooMuch = await post(item.id, { ...buildReturnFromCar({ fromCar, qty: 1000, carId: car.id, occurredOn: today }), delta: { qty: 4000, value: 1000 } });
    expect(tooMuch.error?.message).toMatch(/Only 3 L/);
    const wrongValue = await post(item.id, { ...buildReturnFromCar({ fromCar, qty: 1000, carId: car.id, occurredOn: today }), delta: { qty: 1000, value: 300 } });
    expect(wrongValue.error?.message).toMatch(/Cost mismatch/);

    const ok = await post(item.id, buildReturnFromCar({ fromCar, qty: 1000, carId: car.id, occurredOn: today }));
    expect(ok.error).toBeNull();
    expect((await summary(car.id)).stock_cents).toBe(667);
    expect(await itemStock(item.id)).toMatchObject({ qty: 2000, value: 1233 });
  });
});

describe('settled cars are frozen', () => {
  it('no new money, no edits, no parts once settled', async () => {
    const car = await newCar();
    const { data: cost } = await asMember.from('transactions').insert(expense(car.id, 'car_part', 1000)).select().single();
    const item = await newStockedItem(2000, 2000);
    await service.from('cars').update({ settled_at: new Date().toISOString() }).eq('id', car.id);

    const add = await asMember.from('transactions').insert(expense(car.id, 'car_part', 1000));
    expect(add.error?.code).toBe('42501');
    const edit = await asMember.from('transactions').update({ amount_cents: 1 }).eq('id', cost!.id).select();
    expect(edit.data ?? []).toEqual([]);
    const del = await asMember.from('transactions').delete().eq('id', cost!.id).select();
    expect(del.data ?? []).toEqual([]);
    const carEdit = await asMember.from('cars').update({ notes: 'changed' }).eq('id', car.id).select();
    expect(carEdit.data ?? []).toEqual([]);
    const use = await post(item.id, buildUseOnCar({ stock: await itemStock(item.id), qty: 1000, carId: car.id, occurredOn: today }));
    expect(use.error?.message).toMatch(/settled/);
  });
});

describe('who can see and change what', () => {
  it.each(['cars', 'contacts', 'expense_categories', 'car_shares', 'car_summaries'] as const)(
    'signed-out users and non-members see no %s',
    async (table) => {
      const anon = await anonClient().from(table as 'cars').select('*');
      expect(anon.error).not.toBeNull();
      const outsider = await asOutsider.from(table as 'cars').select('*');
      expect(outsider.data ?? []).toEqual([]);
    },
  );

  it('members add and edit contacts; only admins delete them', async () => {
    const { data: contact, error } = await asMember.from('contacts').insert({ name: uniqueText('Marko'), phone: '091 111 222' }).select().single();
    expect(error).toBeNull();
    const edit = await asMember.from('contacts').update({ phone: '091 333 444' }).eq('id', contact!.id).select();
    expect(edit.data).toHaveLength(1);
    const memberDelete = await asMember.from('contacts').delete().eq('id', contact!.id).select();
    expect(memberDelete.data ?? []).toEqual([]);
    const adminDelete = await asAdmin.from('contacts').delete().eq('id', contact!.id).select();
    expect(adminDelete.data).toHaveLength(1);
  });

  it('contact names are unique ignoring case', async () => {
    const name = uniqueText('Ana');
    await asMember.from('contacts').insert({ name });
    const dup = await asMember.from('contacts').insert({ name: name.toLowerCase() });
    expect(dup.error?.code).toBe('23505');
  });

  it('members add expense categories; only admins rename them', async () => {
    const { data: cat, error } = await asMember.from('expense_categories').insert({ name: uniqueText('Parking') }).select().single();
    expect(error).toBeNull();
    const rename = await asMember.from('expense_categories').update({ name: 'x' }).eq('id', cat!.id).select();
    expect(rename.data ?? []).toEqual([]);
    const adminRename = await asAdmin.from('expense_categories').update({ name: cat!.name + ' fee' }).eq('id', cat!.id).select();
    expect(adminRename.data).toHaveLength(1);
  });

  it('car shares can not be written by members', async () => {
    const car = await newCar();
    const res = await asMember.from('car_shares').update({ share_bp: 10000 }).eq('car_id', car.id);
    expect(res.error).not.toBeNull();
  });
});
