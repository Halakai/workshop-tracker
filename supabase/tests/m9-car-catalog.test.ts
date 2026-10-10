import { beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, service, signIn, testEmail, uniqueText, type Client } from './helpers';

let memberId: string;
let asAdmin: Client;
let asMember: Client;

beforeAll(async () => {
  const ea = testEmail('catalog-admin');
  const em = testEmail('catalog-member');
  const adminId = await createAuthUser(ea);
  memberId = await createAuthUser(em);
  const { error } = await service.from('profiles').insert([
    { id: adminId, display_name: 'Catalog Admin', email: ea, role: 'admin', default_share_bp: 0 },
    { id: memberId, display_name: 'Catalog Member', email: em, role: 'member', default_share_bp: 0 },
  ]);
  if (error) throw error;
  asAdmin = await signIn(ea);
  asMember = await signIn(em);
});

describe('starting data', () => {
  it('has makes with logos, models, generations and engines', async () => {
    const { data: vw } = await asMember.from('car_makes').select('id, name, logo').eq('name', 'Volkswagen').single();
    expect(vw!.logo).toBe('volkswagen.svg');
    const { data: golf } = await asMember
      .from('car_models')
      .select('id, car_generations(name, year_from, year_to, car_engines(name, fuel, power_kw))')
      .eq('make_id', vw!.id)
      .eq('name', 'Golf')
      .single();
    const iv = golf!.car_generations.find((g) => g.name === 'IV (1J)')!;
    expect([iv.year_from, iv.year_to]).toEqual([1997, 2003]);
    expect(iv.car_engines).toContainEqual({ name: '1.9 TDI 81 kW (110 HP)', fuel: 'Diesel', power_kw: 81 });
  });

  it('covers the common European makes', async () => {
    const { data } = await asMember.from('car_makes').select('name');
    const names = data!.map((m) => m.name);
    for (const make of ['Škoda', 'Opel', 'Renault', 'Peugeot', 'Fiat', 'Ford', 'BMW', 'Mercedes-Benz', 'Toyota', 'Dacia', 'Zastava']) {
      expect(names).toContain(make);
    }
  });
});

describe('who can change the catalogue', () => {
  it('members add makes, models, generations and engines; the list stays unique ignoring case', async () => {
    const name = uniqueText('Make');
    const { data: make, error } = await asMember.from('car_makes').insert({ name }).select().single();
    expect(error).toBeNull();
    expect(make!.created_by).toBe(memberId);
    expect((await asMember.from('car_makes').insert({ name: name.toLowerCase() })).error?.code).toBe('23505');

    const { data: model } = await asMember.from('car_models').insert({ make_id: make!.id, name: 'Testmodel' }).select().single();
    const { data: gen } = await asMember
      .from('car_generations')
      .insert({ model_id: model!.id, name: 'I', year_from: 2001, year_to: 2008 })
      .select()
      .single();
    const engine = await asMember.from('car_engines').insert({ generation_id: gen!.id, name: '1.6 74 kW (100 HP)', fuel: 'Petrol', power_kw: 74 });
    expect(engine.error).toBeNull();
    // same engine name with another fuel is a different entry (e.g. the LPG version)
    expect((await asMember.from('car_engines').insert({ generation_id: gen!.id, name: '1.6 74 kW (100 HP)', fuel: 'LPG' })).error).toBeNull();
    expect((await asMember.from('car_engines').insert({ generation_id: gen!.id, name: '1.6 74 KW (100 HP)', fuel: 'Petrol' })).error?.code).toBe('23505');
  });

  it('rejects generations that end before they start', async () => {
    const { data: model } = await service.from('car_models').select('id').limit(1).single();
    const { error } = await asMember.from('car_generations').insert({ model_id: model!.id, name: uniqueText('G'), year_from: 2010, year_to: 2001 });
    expect(error).not.toBeNull();
  });

  it('members cannot rename or delete; admins can, and deleting a make removes its models', async () => {
    const { data: make } = await asMember.from('car_makes').insert({ name: uniqueText('Make') }).select().single();
    const { data: model } = await asMember.from('car_models').insert({ make_id: make!.id, name: 'X' }).select().single();

    const rename = await asMember.from('car_makes').update({ name: 'Hacked' }).eq('id', make!.id).select();
    expect(rename.data).toEqual([]);
    const del = await asMember.from('car_models').delete().eq('id', model!.id).select();
    expect(del.data).toEqual([]);

    const adminRename = await asAdmin.from('car_makes').update({ logo: 'audi.svg' }).eq('id', make!.id).select();
    expect(adminRename.data).toHaveLength(1);
    expect((await asAdmin.from('car_makes').update({ logo: '../evil.js' }).eq('id', make!.id)).error).not.toBeNull();

    await asAdmin.from('car_makes').delete().eq('id', make!.id);
    const { data: left } = await service.from('car_models').select('id').eq('id', model!.id);
    expect(left).toEqual([]);
  });
});

describe('cars and jobs', () => {
  it('cars keep a generation; customers’ cars a generation, year and engine', async () => {
    const { data: car, error } = await asMember
      .from('cars')
      .insert({ ref: uniqueText('CAT'), make: 'Volkswagen', model: 'Golf', generation: 'IV (1J)', engine: '1.9 TDI 81 kW (110 HP)' })
      .select()
      .single();
    expect(error).toBeNull();
    expect(car!.generation).toBe('IV (1J)');

    const { data: customer } = await asMember.from('contacts').insert({ name: uniqueText('Catalog customer') }).select().single();
    const { data: job, error: jobError } = await asMember
      .from('jobs')
      .insert({
        ref: uniqueText('CJ'),
        customer_id: customer!.id,
        description: 'Timing belt',
        car_make: 'Škoda',
        car_model: 'Octavia',
        car_generation: 'II (1Z)',
        car_year: 2008,
        car_engine: '1.9 TDI 77 kW (105 HP)',
      })
      .select()
      .single();
    expect(jobError).toBeNull();
    expect([job!.car_generation, job!.car_year, job!.car_engine]).toEqual(['II (1Z)', 2008, '1.9 TDI 77 kW (105 HP)']);
  });
});
