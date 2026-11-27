import { beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, service, signIn, testEmail, uniqueText, type Client } from './helpers';

// R6 · V1: car owners and private cars (docs/PLAN.md §13)

let ownerId: string;
let otherId: string;
let asOwner: Client;
let asOther: Client;
let asAdmin: Client;
let external: string;
let wallet: string;

beforeAll(async () => {
  const eo = testEmail('vehicles-owner');
  const ex = testEmail('vehicles-other');
  const ea = testEmail('vehicles-admin');
  ownerId = await createAuthUser(eo);
  otherId = await createAuthUser(ex);
  const adminId = await createAuthUser(ea);
  const { error } = await service.from('profiles').insert([
    { id: ownerId, display_name: 'Vehicles Owner', email: eo, role: 'member', default_share_bp: 0 },
    { id: otherId, display_name: 'Vehicles Other', email: ex, role: 'member', default_share_bp: 0 },
    { id: adminId, display_name: 'Vehicles Admin', email: ea, role: 'admin', default_share_bp: 0 },
  ]);
  if (error) throw error;
  asOwner = await signIn(eo);
  asOther = await signIn(ex);
  asAdmin = await signIn(ea);
  const { data: accounts } = await service.from('accounts').select('id, kind');
  external = accounts!.find((a) => a.kind === 'external')!.id;
  wallet = accounts!.find((a) => a.kind === 'wallet')!.id;
});

const car = (values: Record<string, unknown> = {}) => ({ ref: uniqueText('V'), make: 'Volkswagen', model: 'Golf', ...values });

async function addCar(client: Client, values: Record<string, unknown>) {
  const { data, error } = await client.from('cars').insert(car(values)).select().single();
  if (error) throw error;
  return data;
}

async function contact() {
  const { data, error } = await service.from('contacts').insert({ name: uniqueText('Vehicles customer') }).select().single();
  if (error) throw error;
  return data;
}

async function photo(carId: string) {
  const { error } = await service.from('attachments').insert({
    entity_type: 'car',
    entity_id: carId,
    kind: 'photo',
    drive_file_id: uniqueText('drive'),
    file_name: 'photo.jpg',
    mime_type: 'image/jpeg',
  });
  if (error) throw error;
}

describe('owners', () => {
  it('a car is the workshop’s unless said otherwise', async () => {
    const saved = await addCar(asOwner, {});
    expect(saved).toMatchObject({ owner_kind: 'workshop', owner_member_id: null, owner_contact_id: null, for_sale: true, is_private: false });
  });

  it('each kind of owner needs its own link, and only the workshop sells', async () => {
    const c = await contact();
    expect((await asOwner.from('cars').insert(car({ owner_kind: 'member' }))).error?.code).toBe('23514');
    expect((await asOwner.from('cars').insert(car({ owner_kind: 'customer' }))).error?.code).toBe('23514');
    expect((await asOwner.from('cars').insert(car({ owner_kind: 'workshop', owner_member_id: ownerId }))).error?.code).toBe('23514');
    expect((await asOwner.from('cars').insert(car({ owner_kind: 'driver' }))).error?.code).toBe('23514');
    // for_sale is switched off for anyone else's car
    const customers = await addCar(asOwner, { owner_kind: 'customer', owner_contact_id: c.id, for_sale: true });
    expect(customers.for_sale).toBe(false);
    const van = await addCar(asOwner, { for_sale: false });
    expect(van.for_sale).toBe(false);
  });

  it('profit shares belong to the workshop’s cars and follow the owner', async () => {
    const c = await contact();
    const flip = await addCar(asOwner, {});
    const theirs = await addCar(asOwner, { owner_kind: 'customer', owner_contact_id: c.id });
    const { data: flipShares } = await service.from('car_shares').select('partner_id').eq('car_id', flip.id);
    expect((await service.from('car_shares').select('partner_id').eq('car_id', theirs.id)).data).toEqual([]);

    expect((await asOwner.from('cars').update({ owner_kind: 'workshop', owner_contact_id: null }).eq('id', theirs.id)).error).toBeNull();
    const { data: after } = await service.from('car_shares').select('partner_id').eq('car_id', theirs.id);
    expect(after!.length).toBe(flipShares!.length);
    expect((await asOwner.from('cars').update({ owner_kind: 'member', owner_member_id: ownerId }).eq('id', theirs.id)).error).toBeNull();
    expect((await service.from('car_shares').select('partner_id').eq('car_id', theirs.id)).data).toEqual([]);
  });

  it('money goes only on the workshop’s cars, and ties a car to the workshop', async () => {
    const mine = await addCar(asOwner, { owner_kind: 'member', owner_member_id: ownerId });
    const part = (carId: string) => ({
      car_id: carId,
      category: 'car_part',
      kind: 'expense' as const,
      amount_cents: 1000,
      from_account_id: wallet,
      to_account_id: external,
      description: 'Wiper',
    });
    expect((await asOwner.from('transactions').insert(part(mine.id))).error?.message).toMatch(/Only the workshop's cars/);

    const flip = await addCar(asOwner, {});
    expect((await asOwner.from('transactions').insert(part(flip.id))).error).toBeNull();
    const moved = await asOwner.from('cars').update({ owner_kind: 'member', owner_member_id: ownerId }).eq('id', flip.id);
    expect(moved.error?.message).toMatch(/money entries/);
    // flip ↔ the workshop's own vehicle is fine
    expect((await asOwner.from('cars').update({ for_sale: false }).eq('id', flip.id)).error).toBeNull();
  });
});

describe('private cars', () => {
  it('are seen only by their owner, with everything on them', async () => {
    const mine = await addCar(asOwner, { owner_kind: 'member', owner_member_id: ownerId, is_private: true });
    expect(mine.is_private).toBe(true);
    await photo(mine.id);

    expect((await asOwner.from('cars').select('id').eq('id', mine.id)).data).toHaveLength(1);
    expect((await asOther.from('cars').select('id').eq('id', mine.id)).data).toEqual([]);
    expect((await asOther.from('car_summaries').select('car_id').eq('car_id', mine.id)).data).toEqual([]);
    expect((await asOwner.from('attachments').select('id').eq('entity_id', mine.id)).data).toHaveLength(1);
    expect((await asOther.from('attachments').select('id').eq('entity_id', mine.id)).data).toEqual([]);
    expect((await asOwner.from('activity_log').select('action').eq('entity_id', mine.id)).data).toEqual([{ action: 'add' }]);
    expect((await asOther.from('activity_log').select('action').eq('entity_id', mine.id)).data).toEqual([]);

    // the others can't change, delete, key or put a job on it
    expect((await asOther.from('cars').update({ notes: 'hi' }).eq('id', mine.id).select()).data).toEqual([]);
    expect((await asOther.from('cars').delete().eq('id', mine.id).select()).data).toEqual([]);
    expect((await asOther.rpc('create_access_key', { p_kind: 'owner', p_car_id: mine.id })).error?.message).toMatch(/Car not found/);
    const c = await contact();
    const job = await asOther.from('jobs').insert({ ref: uniqueText('VJ'), customer_id: c.id, description: 'Oil', car_id: mine.id });
    expect(job.error?.message).toMatch(/Car not found/);

    // the owner can
    const key = await asOwner.rpc('create_access_key', { p_kind: 'owner', p_car_id: mine.id });
    expect(key.error).toBeNull();
    expect((await asOther.from('access_keys').select('id').eq('car_id', mine.id)).data).toEqual([]);
    expect((await asOwner.from('access_keys').select('id').eq('car_id', mine.id)).data).toHaveLength(1);
  });

  it('can be shown to the others by the owner, and only by the owner', async () => {
    const mine = await addCar(asOwner, { owner_kind: 'member', owner_member_id: ownerId, is_private: true });
    expect((await asOwner.from('cars').update({ is_private: false }).eq('id', mine.id)).error).toBeNull();
    expect((await asOther.from('cars').select('id').eq('id', mine.id)).data).toHaveLength(1);
    // the other member sees it now, but can't hide it
    expect((await asOther.from('cars').update({ is_private: true }).eq('id', mine.id)).error?.code).toBe('42501');
    expect((await asOwner.from('cars').update({ is_private: true }).eq('id', mine.id)).error).toBeNull();
    expect((await asOther.from('cars').select('id').eq('id', mine.id)).data).toEqual([]);
  });

  it('only when the owner added it: a car added for another member stays visible', async () => {
    const forOther = await addCar(asOwner, { owner_kind: 'member', owner_member_id: otherId, is_private: true });
    expect(forOther.is_private).toBe(false);
    const tried = await asOther.from('cars').update({ is_private: true }).eq('id', forOther.id).select().single();
    expect(tried.error).toBeNull();
    expect(tried.data!.is_private).toBe(false);
    // nor can a workshop or customer car be private
    expect((await addCar(asOwner, { is_private: true })).is_private).toBe(false);
  });

  it('stop being private when they get another owner', async () => {
    const mine = await addCar(asOwner, { owner_kind: 'member', owner_member_id: ownerId, is_private: true });
    const c = await contact();
    const sold = await asOwner.from('cars').update({ owner_kind: 'customer', owner_member_id: null, owner_contact_id: c.id }).eq('id', mine.id).select().single();
    expect(sold.error).toBeNull();
    expect(sold.data!.is_private).toBe(false);
    expect((await asOther.from('cars').select('id').eq('id', mine.id)).data).toHaveLength(1);
  });
});

describe('jobs on cars', () => {
  it('keep the car and its mileage, and the car stays while it has jobs', async () => {
    const c = await contact();
    const theirs = await addCar(asOther, { owner_kind: 'customer', owner_contact_id: c.id });
    const { data: job, error } = await asOwner
      .from('jobs')
      .insert({ ref: uniqueText('VJ'), customer_id: c.id, description: 'Brakes', car_id: theirs.id, mileage_km: 187000 })
      .select()
      .single();
    expect(error).toBeNull();
    expect(job).toMatchObject({ car_id: theirs.id, mileage_km: 187000 });
    expect((await asOwner.from('jobs').update({ mileage_km: 187500 }).eq('id', job!.id)).error).toBeNull();
    expect((await asOwner.from('jobs').update({ mileage_km: -1 }).eq('id', job!.id)).error?.code).toBe('23514');
    expect((await asOwner.from('cars').delete().eq('id', theirs.id)).error?.code).toBe('23503');
  });
});

describe('backups', () => {
  it('read every row for an admin, private cars included, and nothing for members', async () => {
    const mine = await addCar(asOwner, { owner_kind: 'member', owner_member_id: ownerId, is_private: true });
    const { data, error } = await asAdmin.rpc('backup_table', { p_table: 'cars' });
    expect(error).toBeNull();
    expect((data as { id: string }[]).some((r) => r.id === mine.id)).toBe(true);
    // the same rows the table gives the service role
    const { count } = await service.from('cars').select('id', { count: 'exact', head: true });
    expect((data as unknown[]).length).toBe(count);

    expect((await asOwner.rpc('backup_table', { p_table: 'cars' })).error?.code).toBe('42501');
    expect((await asAdmin.rpc('backup_table', { p_table: 'counters' })).error?.message).toMatch(/Not a table in the backup/);
    expect((await asAdmin.rpc('backup_table', { p_table: 'cars; drop table cars' })).error?.message).toMatch(/Not a table in the backup/);
    expect((await asAdmin.rpc('backup_table', { p_table: 'profiles' })).error).toBeNull();
  });
});
