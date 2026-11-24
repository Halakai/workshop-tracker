import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createAuthUser, service, signIn, testEmail, uniqueText, url, type Client } from './helpers';

let asMember: Client;
let asOther: Client;
let asOutsider: Client;

beforeAll(async () => {
  const memberEmail = testEmail('manuals-member');
  const otherEmail = testEmail('manuals-other');
  const outsiderEmail = testEmail('manuals-outsider');
  const memberId = await createAuthUser(memberEmail);
  const otherId = await createAuthUser(otherEmail);
  await createAuthUser(outsiderEmail);
  const { error } = await service.from('profiles').insert([
    { id: memberId, display_name: 'Manuals Member', email: memberEmail, role: 'member' },
    { id: otherId, display_name: 'Manuals Other', email: otherEmail, role: 'member' },
  ]);
  if (error) throw error;
  asMember = await signIn(memberEmail);
  asOther = await signIn(otherEmail);
  asOutsider = await signIn(outsiderEmail);
});

const passat = () => ({ make: 'Volkswagen', model: uniqueText('Passat'), generation: 'B5.5 (3BG)', engine: '1.9 TDI 96 kW (130 HP)', manual_slug: 'volkswagen_passat_b5' });

describe('the manual chosen for a kind of car', () => {
  it('is saved by any member and can be changed by another', async () => {
    const car = passat();
    const saved = await asMember.from('car_manuals').insert(car).select().single();
    expect(saved.error).toBeNull();
    expect(saved.data!.parts).toEqual([]);
    expect(saved.data!.created_by).not.toBeNull();

    const changed = await asOther.from('car_manuals').update({ parts: ['4-cylinder diesel engine with unit injector'] }).eq('id', saved.data!.id).select().single();
    expect(changed.error).toBeNull();
    expect(changed.data!.parts).toEqual(['4-cylinder diesel engine with unit injector']);
  });

  it('is one per kind of car, however it is spelled', async () => {
    const car = passat();
    expect((await asMember.from('car_manuals').insert(car)).error).toBeNull();
    const again = await asMember.from('car_manuals').insert({ ...car, make: 'VOLKSWAGEN', model: car.model.toLowerCase() });
    expect(again.error?.code).toBe('23505');
    // another engine is another choice
    expect((await asMember.from('car_manuals').insert({ ...car, engine: '1.8 T 110 kW (150 HP)' })).error).toBeNull();
  });

  it('only takes names of manuals', async () => {
    for (const manual_slug of ['https://example.com/x', '../x', 'a b', '']) {
      expect((await asMember.from('car_manuals').insert({ ...passat(), manual_slug })).error?.code).toBe('23514');
    }
  });

  it('is not for outsiders, and nobody deletes it', async () => {
    const car = passat();
    const { data } = await asMember.from('car_manuals').insert(car).select().single();
    expect((await asOutsider.from('car_manuals').select()).data).toEqual([]);
    expect((await asOutsider.from('car_manuals').insert(passat())).error).not.toBeNull();
    expect((await anonClient().from('car_manuals').select()).error).not.toBeNull();
    expect((await asMember.from('car_manuals').delete().eq('id', data!.id)).error?.code).toBe('42501');
  });
});

describe('the kept indexes', () => {
  it('are only for the manuals function, and stay out of backups', async () => {
    expect((await asMember.from('manual_lists').select()).error?.code).toBe('42501');
    expect((await asMember.from('manual_indexes').select()).error?.code).toBe('42501');
    const { data: tables } = await asMember.rpc('backup_tables');
    expect(tables).toContain('car_manuals');
    expect(tables).not.toContain('manual_lists');
    expect(tables).not.toContain('manual_indexes');
  });
});

describe('the manuals function', () => {
  // a list and one index are put in place, so these tests never ask the real site
  const slug = 'testmake_testmodel_mk1';
  beforeAll(async () => {
    const list = await service.from('manual_lists').upsert({ id: 1, slugs: [slug, 'testmake_other', 'another_car'] });
    if (list.error) throw list.error;
    const index = await service.from('manual_indexes').upsert({
      slug,
      title: 'Testmake Testmodel Mk1',
      base: 'https://workshop-manuals.com/testmake/testmodel-mk1/',
      chapters: [{ title: 'Engine', kind: 'eng', start: 0 }],
      pages: 'engine/oil/oil_capacities\nengine/belt/replace_toothed_belt',
      page_count: 2,
    });
    if (index.error) throw index.error;
  });

  async function call(client: Client, path: string, body: unknown) {
    const { data } = await client.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: process.env.SUPABASE_PUBLISHABLE_KEY! };
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
    const res = await fetch(`${url}/functions/v1/manuals/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  }

  it('finds manuals by make and by words', async () => {
    expect(await call(asMember, 'find', { prefixes: ['testmake'] })).toEqual({ status: 200, body: { slugs: [slug, 'testmake_other'] } });
    expect((await call(asMember, 'find', { words: 'testmodel mk1' })).body.slugs).toEqual([slug]);
    expect((await call(asMember, 'find', {})).status).toBe(400);
  });

  it('opens a kept index', async () => {
    const { status, body } = await call(asMember, 'open', { slug });
    expect(status).toBe(200);
    expect(body.title).toBe('Testmake Testmodel Mk1');
    expect(body.pages).toEqual(['engine/oil/oil_capacities', 'engine/belt/replace_toothed_belt']);
  });

  it('never fetches anything that isn’t on the list', async () => {
    expect((await call(asMember, 'open', { slug: 'not_on_the_list' })).status).toBe(404);
    expect((await call(asMember, 'open', { slug: '../../etc/passwd' })).status).toBe(400);
    expect((await call(asMember, 'open', { slug: 'https://example.com/' })).status).toBe(400);
  });

  it('is only for members', async () => {
    expect((await call(asOutsider, 'find', { prefixes: ['testmake'] })).status).toBe(403);
    expect((await call(anonClient(), 'open', { slug })).status).toBe(401);
  });
});
