import { beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, service, signIn, testEmail, uniqueText, type Client } from './helpers';

let asMember: Client;
let wallet: string;
let external: string;
const today = new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  const email = testEmail('keys3-member');
  const id = await createAuthUser(email);
  const { error } = await service.from('profiles').insert([{ id, display_name: 'Keys3 Member', email, role: 'member' }]);
  if (error) throw error;
  asMember = await signIn(email);
  const { data: accounts } = await service.from('accounts').select('id, kind');
  wallet = accounts!.find((a) => a.kind === 'wallet')!.id;
  external = accounts!.find((a) => a.kind === 'external')!.id;
});

async function newCar(extra: Record<string, unknown> = {}) {
  const { data, error } = await service
    .from('cars')
    .insert({
      ref: uniqueText('CAR'),
      make: 'BMW',
      model: '3 Series',
      generation: 'E46',
      year: 2003,
      engine: '330d',
      fuel: 'Diesel',
      mileage_km: 210000,
      vin: 'WBASECRETVIN12345',
      plate: 'ZG-1234-AB',
      notes: 'SECRET-CAR-NOTE',
      asking_price_cents: 650000,
      ...extra,
    })
    .select()
    .single();
  if (error) throw error;
  // what it cost us and a part bought for it: neither price may reach a key
  const money = (category: string, amount: number, more: Record<string, unknown>) => ({
    car_id: data.id,
    category,
    kind: 'expense' as const,
    amount_cents: amount,
    from_account_id: wallet,
    to_account_id: external,
    occurred_on: today,
    ...more,
  });
  const { error: moneyError } = await service.from('transactions').insert([
    money('car_purchase', 424242, { counterparty: 'Secret Seller' }),
    money('car_part', 13579, { description: 'Clutch kit', counterparty: 'Secret Parts Shop' }),
  ]);
  if (moneyError) throw moneyError;
  const photo = async (on: boolean) => {
    const { data: row } = await service
      .from('attachments')
      .insert({ entity_type: 'car', entity_id: data.id, kind: 'photo', drive_file_id: uniqueText('drive'), file_name: 'p.jpg', mime_type: 'image/jpeg', on_website: on })
      .select()
      .single();
    return row!;
  };
  return { car: data, shown: await photo(true), hidden: await photo(false) };
}

async function listing(carId: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await asMember
    .from('website_cars')
    .insert({ car_id: carId, slug: uniqueText('car').toLowerCase(), title_hr: 'BMW E46 330d', story_hr: 'Nova spojka', is_public: true, ...extra })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function makeKey(args: { kind: string; carId?: string; note?: string; expiresAt?: string; shows?: object }) {
  const { data, error } = await asMember.rpc('create_access_key', {
    p_kind: args.kind,
    p_car_id: args.carId,
    p_note: args.note,
    p_expires_at: args.expiresAt,
    p_shows: args.shows as never,
  });
  if (error) throw error;
  return data;
}

const open = async (code: string) => (await service.rpc('open_access_key', { p_code: code })).data as any;
const SECRETS = ['424242', '13579', 'Secret Seller', 'Secret Parts Shop', 'SECRET-CAR-NOTE', 'WBASECRETVIN'];

describe('car keys', () => {
  it('a buyer sees the car like on the website, with the asking price while it is for sale', async () => {
    const { car, shown, hidden } = await newCar({ status: 'listed' });
    await listing(car.id);
    const key = await makeKey({ kind: 'buyer', carId: car.id, note: 'Marko' });
    expect(key).toMatchObject({ kind: 'buyer', car_id: car.id, job_id: null, note: 'Marko' });
    const view = await open(key.code);
    expect(view).toMatchObject({
      kind: 'buyer',
      car: { status: 'listed', title_hr: 'BMW E46 330d', story_hr: 'Nova spojka', year: 2003, price_cents: 650000, plate: null },
      parts: [],
    });
    expect(view.car.photos.map((p: { id: string }) => p.id)).toEqual([shown.id]);
    const text = JSON.stringify(view);
    for (const secret of [...SECRETS, hidden.id, 'ZG-1234-AB']) expect(text).not.toContain(secret);
  });

  it('without a website listing the title comes from the car; after the sale there is no price', async () => {
    const { car } = await newCar({ status: 'sold' });
    const view = await open((await makeKey({ kind: 'buyer', carId: car.id })).code);
    expect(view.car).toMatchObject({ title_hr: 'BMW 3 Series E46', status: 'sold', price_cents: null });
  });

  it('the owner sees the history: parts fitted (no prices) and the plate', async () => {
    const { car } = await newCar({ status: 'sold' });
    const view = await open((await makeKey({ kind: 'owner', carId: car.id })).code);
    expect(view).toMatchObject({ kind: 'owner', car: { plate: 'ZG-1234-AB', price_cents: null } });
    expect(view.parts).toEqual([{ date: today, description: 'Clutch kit', qty: null, unit: null }]);
    const text = JSON.stringify(view);
    for (const secret of SECRETS) expect(text).not.toContain(secret);
  });

  it('a car key can switch between buyer and owner, but not leave its car', async () => {
    const { car } = await newCar();
    const key = await makeKey({ kind: 'buyer', carId: car.id });
    expect((await asMember.from('access_keys').update({ kind: 'owner' }).eq('id', key.id)).error).toBeNull();
    expect((await open(key.code)).kind).toBe('owner');
    expect((await asMember.from('access_keys').update({ kind: 'website' }).eq('id', key.id)).error).not.toBeNull();
    expect((await asMember.from('access_keys').update({ kind: 'job' }).eq('id', key.id)).error).not.toBeNull();
  });
});

describe('website keys', () => {
  it('a public key (no name) shows the whole website', async () => {
    const { car } = await newCar({ status: 'listed' });
    const row = await listing(car.id);
    const key = await makeKey({ kind: 'website' });
    expect(key.shows).toEqual({ sections: ['for_sale', 'work', 'services', 'about', 'reviews', 'contact'], cars: 'all', car_ids: [], prices: true });
    const view = await open(key.code);
    expect(view.kind).toBe('website');
    expect(view.hidden).toEqual([]);
    expect(view.cars.find((c: { id: string }) => c.id === row.id)).toMatchObject({ price_cents: 650000 });
  });

  it('a personal key shows only what was chosen: sections, cars, prices; the rest is never sent', async () => {
    const a = await newCar({ status: 'listed' });
    const b = await newCar({ status: 'listed' });
    const done = await newCar({ status: 'sold' });
    const rowA = await listing(a.car.id);
    const rowB = await listing(b.car.id);
    const rowDone = await listing(done.car.id);
    const key = await makeKey({
      kind: 'website',
      note: 'Marko',
      shows: { sections: ['for_sale', 'contact', 'nonsense'], cars: 'chosen', car_ids: [rowA.id, rowDone.id, 'not-a-uuid'], prices: false },
    });
    expect(key.shows).toEqual({ sections: ['for_sale', 'contact'], cars: 'chosen', car_ids: expect.arrayContaining([rowA.id, rowDone.id]), prices: false });
    const view = await open(key.code);
    // B wasn't chosen; the sold car is "our work", which this key doesn't show
    expect(view.cars.map((c: { id: string }) => c.id)).toEqual([rowA.id]);
    expect(view.cars[0].price_cents).toBeNull();
    expect(view.services).toEqual([]);
    expect(view.reviews).toEqual([]);
    expect(view.site.about_hr).toBeNull();
    expect(view.hidden).toEqual(['work', 'services', 'about', 'reviews']);
    expect(JSON.stringify(view)).not.toContain(rowB.id);
  });

  it('members change what a key shows while it is in use', async () => {
    const key = await makeKey({ kind: 'website' });
    const { error } = await asMember.from('access_keys').update({ shows: { sections: ['reviews'], prices: 'yes' } }).eq('id', key.id);
    expect(error).toBeNull();
    const { data } = await asMember.from('access_keys').select('shows').eq('id', key.id).single();
    expect(data!.shows).toEqual({ sections: ['reviews'], cars: 'all', car_ids: [], prices: true });
    expect((await open(key.code)).cars).toEqual([]);
  });
});

describe('every key', () => {
  it('stops working after its end date; the date can be moved', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const key = await makeKey({ kind: 'website', expiresAt: yesterday });
    expect(await open(key.code)).toBeNull();
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString();
    expect((await asMember.from('access_keys').update({ expires_at: nextWeek }).eq('id', key.id)).error).toBeNull();
    expect((await open(key.code)).expires_at).not.toBeNull();
    expect((await asMember.from('access_keys').update({ expires_at: null }).eq('id', key.id)).error).toBeNull();
    expect(await open(key.code)).not.toBeNull();
  });

  it('only known kinds, and only for something that exists', async () => {
    expect((await asMember.rpc('create_access_key', { p_kind: 'everything' })).error?.message).toMatch(/Unknown kind/);
    expect((await asMember.rpc('create_access_key', { p_kind: 'buyer', p_car_id: crypto.randomUUID() })).error?.message).toMatch(/Car not found/);
    expect((await asMember.rpc('create_access_key', { p_kind: 'job', p_job_id: crypto.randomUUID() })).error?.message).toMatch(/Job not found/);
  });

  it('making a car or website key is in the activity log', async () => {
    const { car } = await newCar();
    await makeKey({ kind: 'owner', carId: car.id });
    const { data } = await service.from('activity_log').select('summary').eq('entity_id', car.id).eq('action', 'key');
    expect(data!.map((r) => r.summary)).toEqual([`Made an owner key for ${car.ref}`]);
  });
});
