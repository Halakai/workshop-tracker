import { beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, service, signIn, testEmail, uniqueText, type Client } from './helpers';
import { toPostStockMovementArgs } from '@/features/inventory/rpc';
import { buildPurchase, buildReturnFromCar, buildUseOnCar, type MovementInput } from '@/domain/stock';
import { toMilli } from '@/domain/quantity';

// R6 · V2: services, parts on our own cars, workshop stock on a member's car (docs/PLAN.md §13)

let ownerId: string;
let otherId: string;
let asOwner: Client;
let asOther: Client;
let asAdmin: Client;
let wallet: string;
let external: string;
let smallService: string;
let categoryId: string;
let litres: string;

const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  const eo = testEmail('services-owner');
  const ex = testEmail('services-other');
  const ea = testEmail('services-admin');
  ownerId = await createAuthUser(eo);
  otherId = await createAuthUser(ex);
  const adminId = await createAuthUser(ea);
  const { error } = await service.from('profiles').insert([
    { id: ownerId, display_name: 'Services Owner', email: eo, role: 'member', default_share_bp: 0 },
    { id: otherId, display_name: 'Services Other', email: ex, role: 'member', default_share_bp: 0 },
    { id: adminId, display_name: 'Services Admin', email: ea, role: 'admin', default_share_bp: 0 },
  ]);
  if (error) throw error;
  asOwner = await signIn(eo);
  asOther = await signIn(ex);
  asAdmin = await signIn(ea);
  const { data: accounts } = await service.from('accounts').select('id, kind');
  wallet = accounts!.find((a) => a.kind === 'wallet')!.id;
  external = accounts!.find((a) => a.kind === 'external')!.id;
  smallService = (await service.from('service_types').select('id').eq('name', 'Small service').single()).data!.id;
  categoryId = (await service.from('item_categories').select('id').eq('code', 'FLD').single()).data!.id;
  litres = (await service.from('units').select('id').eq('name', 'L').single()).data!.id;
});

async function addCar(values: Record<string, unknown>, client: Client = asOwner) {
  const { data, error } = await client.from('cars').insert({ ref: uniqueText('S'), make: 'Opel', model: 'Astra', ...values }).select().single();
  if (error) throw error;
  return data;
}
const privateCar = () => addCar({ owner_kind: 'member', owner_member_id: ownerId, is_private: true });
const workshopCar = () => addCar({});
async function customerCar() {
  const { data: c } = await service.from('contacts').insert({ name: uniqueText('Services customer') }).select().single();
  return addCar({ owner_kind: 'customer', owner_contact_id: c!.id });
}

async function addService(carId: string, values: Record<string, unknown> = {}, client: Client = asOwner) {
  return client.from('car_services').insert({ car_id: carId, service_type_id: smallService, mileage_km: 187400, ...values }).select().single();
}

async function stockedOil() {
  const { data: item, error } = await asOwner
    .from('items')
    .insert({ name: 'Oil 5W-40', category_id: categoryId, unit_id: litres, part_number: uniqueText('OIL') })
    .select()
    .single();
  if (error) throw error;
  await post(item.id, buildPurchase({ qty: 10000, totalCost: 8000, paidBy: wallet, occurredOn: today }));
  return item;
}
async function itemStock(id: string) {
  const { data } = await service.from('items').select('qty_on_hand, stock_value_cents, version').eq('id', id).single();
  return { qty: toMilli(data!.qty_on_hand), value: data!.stock_value_cents, version: data!.version };
}
async function post(itemId: string, input: MovementInput, client: Client = asOwner) {
  const { version } = await itemStock(itemId);
  return client.rpc('post_stock_movement', toPostStockMovementArgs(itemId, version, input));
}

describe('service types', () => {
  it('are a list members add to and admins rename', async () => {
    const { data: added, error } = await asOwner.from('service_types').insert({ name: uniqueText('Clutch') }).select().single();
    expect(error).toBeNull();
    expect((await asOwner.from('service_types').update({ name: uniqueText('x') }).eq('id', added!.id).select()).data).toEqual([]);
    expect((await asAdmin.from('service_types').update({ name: uniqueText('Clutch kit') }).eq('id', added!.id).select()).data).toHaveLength(1);
    // in use: can't go
    const car = await privateCar();
    await addService(car.id, { service_type_id: added!.id });
    expect((await asAdmin.from('service_types').delete().eq('id', added!.id)).error?.code).toBe('23503');
  });
});

describe('services', () => {
  it('need a type or a description', async () => {
    const car = await privateCar();
    expect((await addService(car.id, { service_type_id: null })).error?.code).toBe('23514');
    expect((await addService(car.id, { service_type_id: null, description: 'Fixed the window regulator' })).error).toBeNull();
  });

  it('have a work price on our own and customers’ cars, but not on the workshop’s', async () => {
    expect((await addService((await privateCar()).id, { labor_cents: 5000, garage: 'Auto Kovač' })).error).toBeNull();
    expect((await addService((await customerCar()).id, { labor_cents: 12000, garage: 'Dealer' })).error).toBeNull();
    const flip = await workshopCar();
    expect((await addService(flip.id, { labor_cents: 5000 })).error?.message).toMatch(/costs what is filed under it/);
    expect((await addService(flip.id)).error).toBeNull();
  });

  it('on a private car stay with its owner, with their receipts and activity', async () => {
    const car = await privateCar();
    const { data: s } = await addService(car.id);
    const { error } = await service.from('attachments').insert({
      entity_type: 'car_service',
      entity_id: s!.id,
      kind: 'receipt',
      drive_file_id: uniqueText('drive'),
      file_name: 'receipt.jpg',
      mime_type: 'image/jpeg',
    });
    expect(error).toBeNull();
    expect((await asOther.from('car_services').select('id').eq('car_id', car.id)).data).toEqual([]);
    expect((await asOther.from('attachments').select('id').eq('entity_id', s!.id)).data).toEqual([]);
    expect((await asOwner.from('attachments').select('id').eq('entity_id', s!.id)).data).toHaveLength(1);
    expect((await addService(car.id, {}, asOther)).error).not.toBeNull();
    const { data: log } = await asOwner.from('activity_log').select('action, summary').eq('entity_id', car.id).eq('action', 'service');
    expect(log![0].summary).toMatch(/Small service on \d{2}\.\d{2}\.\d{4}$/);
    expect((await asOther.from('activity_log').select('id').eq('entity_id', car.id)).data).toEqual([]);
  });

  it('stay on their car', async () => {
    const { data: s } = await addService((await privateCar()).id);
    const other = await privateCar();
    expect((await asOwner.from('car_services').update({ car_id: other.id }).eq('id', s!.id)).error?.code).toBe('23514');
  });
});

describe('costs filed under a service', () => {
  it('belong to the same car, and drop out when the service is deleted', async () => {
    const flip = await workshopCar();
    const { data: s } = await addService(flip.id);
    const part = {
      car_id: flip.id,
      category: 'car_part',
      kind: 'expense' as const,
      amount_cents: 2500,
      from_account_id: wallet,
      to_account_id: external,
      description: 'Oil filter',
      service_id: s!.id,
    };
    const { data: cost, error } = await asOwner.from('transactions').insert(part).select().single();
    expect(error).toBeNull();
    const elsewhere = await workshopCar();
    const { data: s2 } = await addService(elsewhere.id);
    expect((await asOwner.from('transactions').update({ service_id: s2!.id }).eq('id', cost!.id)).error?.message).toMatch(/another car/);

    expect((await asOwner.from('car_services').delete().eq('id', s!.id)).error).toBeNull();
    expect((await service.from('transactions').select('service_id').eq('id', cost!.id).single()).data!.service_id).toBeNull();
  });

  it('parts from stock are filed with a function', async () => {
    const flip = await workshopCar();
    const { data: s } = await addService(flip.id);
    const oil = await stockedOil();
    const used = await post(oil.id, buildUseOnCar({ stock: await itemStock(oil.id), qty: 4000, carId: flip.id, occurredOn: today }));
    expect(used.error).toBeNull();
    expect((await asOwner.rpc('set_movement_service', { p_movement_id: used.data!, p_service_id: s!.id })).error).toBeNull();
    expect((await service.from('stock_movements').select('service_id').eq('id', used.data!).single()).data!.service_id).toBe(s!.id);
    const { data: s2 } = await addService((await workshopCar()).id);
    expect((await asOwner.rpc('set_movement_service', { p_movement_id: used.data!, p_service_id: s2!.id })).error?.message).toMatch(/another car/);
  });
});

describe('workshop stock on a member’s car', () => {
  it('is charged to the owner at cost, and paid back when returned', async () => {
    const car = await privateCar();
    const oil = await stockedOil(); // 10 L for 80.00€
    const used = await post(oil.id, buildUseOnCar({ stock: await itemStock(oil.id), qty: 5000, carId: car.id, occurredOn: today }));
    expect(used.error).toBeNull();
    const { data: charged } = await service.from('allocations').select('partner_id, amount_cents').eq('stock_movement_id', used.data!);
    expect(charged).toEqual([{ partner_id: ownerId, amount_cents: -4000 }]);

    // the others see that oil went to a private car, not which one
    const { data: log } = await asOther.from('activity_log').select('summary').eq('entity_id', oil.id).eq('action', 'use_car');
    expect(log![0].summary).toMatch(/on a private car$/);
    expect(log![0].summary).not.toContain(car.ref);

    const back = await post(oil.id, buildReturnFromCar({ fromCar: { qty: 5000, value: 4000 }, qty: 1000, carId: car.id, occurredOn: today }));
    expect(back.error).toBeNull();
    const { data: refund } = await service.from('allocations').select('partner_id, amount_cents').eq('stock_movement_id', back.data!);
    expect(refund).toEqual([{ partner_id: ownerId, amount_cents: 800 }]);

    // undoing the return removes its refund
    expect((await asOwner.rpc('undo_stock_movement', { p_movement_id: back.data! })).error).toBeNull();
    expect((await service.from('allocations').select('id').eq('stock_movement_id', back.data!)).data).toEqual([]);

    // the car keeps its owner now
    const moved = await asOwner.from('cars').update({ owner_member_id: otherId, is_private: false }).eq('id', car.id);
    expect(moved.error?.message).toMatch(/owner can't change/);
  });

  it('is not for customers’ cars: their parts go on a job', async () => {
    const car = await customerCar();
    const oil = await stockedOil();
    const used = await post(oil.id, buildUseOnCar({ stock: await itemStock(oil.id), qty: 1000, carId: car.id, occurredOn: today }));
    expect(used.error?.message).toMatch(/go on a job/);
  });
});

describe('parts on our own cars', () => {
  it('are kept with their details, only on members’ cars', async () => {
    const car = await privateCar();
    const tyres = {
      car_id: car.id,
      kind: 'tyres',
      name: 'Winter tyres',
      price_cents: 36000,
      bought_from: uniqueText('Tyre shop'),
      fitted_km: 187400,
      state: 'stored',
      details: { size: '205/55 R16', season: 'winter', dot: '3823', count: 4 },
    };
    const { data, error } = await asOwner.from('car_parts').insert(tyres).select().single();
    expect(error).toBeNull();
    expect(data!.details).toEqual(tyres.details);
    expect((await asOwner.from('car_parts').insert({ ...tyres, kind: 'spaceship' })).error?.code).toBe('23514');
    expect((await asOwner.from('car_parts').insert({ ...tyres, state: 'lost' })).error?.code).toBe('23514');
    expect((await asOwner.from('car_parts').insert({ ...tyres, details: [1, 2] })).error?.code).toBe('23514');

    expect((await asOwner.from('car_parts').insert({ ...tyres, car_id: (await workshopCar()).id })).error?.message).toMatch(/our own cars/);
    expect((await asOwner.from('car_parts').insert({ ...tyres, car_id: (await customerCar()).id })).error?.message).toMatch(/our own cars/);

    // private: only the owner
    expect((await asOther.from('car_parts').select('id').eq('car_id', car.id)).data).toEqual([]);
    expect((await asOwner.from('car_parts').select('id').eq('car_id', car.id)).data).toHaveLength(1);
  });

  it('can be part of one of the car’s services', async () => {
    const car = await privateCar();
    const { data: s } = await addService(car.id, { labor_cents: 5000 });
    const part = { car_id: car.id, kind: 'oil', name: 'Engine oil', price_cents: 4500, service_id: s!.id };
    expect((await asOwner.from('car_parts').insert(part)).error).toBeNull();
    const { data: s2 } = await addService((await privateCar()).id);
    expect((await asOwner.from('car_parts').insert({ ...part, service_id: s2!.id })).error?.message).toMatch(/another car/);
  });

  it('add where they were bought to the suppliers, and follow a rename', async () => {
    const car = await privateCar();
    const shop = uniqueText('Battery shop');
    const { data: part } = await asOwner.from('car_parts').insert({ car_id: car.id, kind: 'battery', name: 'Battery', bought_from: shop }).select().single();
    const { data: supplier } = await service.from('suppliers').select('id').eq('name', shop).single();
    expect(supplier).not.toBeNull();
    const { data: usage } = await service.from('supplier_usage').select('uses').eq('id', supplier!.id).single();
    expect(usage!.uses).toBe(1);
    const renamed = uniqueText('Battery shop renamed');
    expect((await asAdmin.rpc('rename_supplier', { p_id: supplier!.id, p_name: renamed })).error).toBeNull();
    expect((await service.from('car_parts').select('bought_from').eq('id', part!.id).single()).data!.bought_from).toBe(renamed);
  });
});
