import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createAuthUser, service, signIn, testEmail, uniqueText, type Client } from './helpers';

let asAdmin: Client;
let asMember: Client;
let customerId: string;

beforeAll(async () => {
  const ea = testEmail('web-admin');
  const em = testEmail('web-member');
  const adminId = await createAuthUser(ea);
  const memberId = await createAuthUser(em);
  const { error } = await service.from('profiles').insert([
    { id: adminId, display_name: 'Web Admin', email: ea, role: 'admin', default_share_bp: 0 },
    { id: memberId, display_name: 'Web Member', email: em, role: 'member', default_share_bp: 0 },
  ]);
  if (error) throw error;
  asAdmin = await signIn(ea);
  asMember = await signIn(em);
  customerId = (await service.from('contacts').insert({ name: uniqueText('Web customer') }).select().single()).data!.id;
});

const slug = () => uniqueText('car').toLowerCase().replace(/[^a-z0-9]+/g, '-');

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
      vin: 'WBAAAAAAAAA123456',
      plate: 'ZG-1234-AB',
      notes: 'secret note',
      asking_price_cents: 650000,
      ...extra,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function newJob() {
  const { data, error } = await service
    .from('jobs')
    .insert({ ref: uniqueText('JOB'), customer_id: customerId, description: 'Respray', car_make: 'VW', car_model: 'Golf', car_year: 1999, car_plate: 'ST-999-ZZ' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function addPhoto(entityType: string, entityId: string, kind = 'photo') {
  const { data, error } = await service
    .from('attachments')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      kind,
      drive_file_id: uniqueText('drive'),
      file_name: 'photo.jpg',
      mime_type: kind === 'photo' ? 'image/jpeg' : 'application/pdf',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function snapshotCar(id: string) {
  const { data, error } = await service.rpc('website_snapshot');
  if (error) throw error;
  return (data as { cars: Record<string, unknown>[] }).cars.find((c) => c.id === id);
}

describe('website content', () => {
  it('nothing is readable or callable without a login', async () => {
    const anon = anonClient();
    for (const table of ['website_settings', 'website_contacts', 'website_services', 'website_reviews', 'website_hours', 'website_cars'] as const) {
      const { data } = await anon.from(table).select('*');
      expect(data ?? []).toEqual([]);
    }
    expect((await anon.rpc('website_snapshot')).error).not.toBeNull();
    expect((await anon.rpc('website_photo', { p_attachment_id: crypto.randomUUID() })).error).not.toBeNull();
    expect((await anon.rpc('set_photo_on_website', { p_attachment_id: crypto.randomUUID(), p_on: true })).error).not.toBeNull();
  });

  it('members read the texts; only admins change them', async () => {
    const { data: settings } = await asMember.from('website_settings').select('*').single();
    expect(settings?.headline_hr).toBeTruthy();
    expect((await asMember.from('website_hours').select('*')).data).toHaveLength(7);

    const memberEdit = await asMember.from('website_settings').update({ about_hr: 'x' }).eq('id', true).select();
    expect(memberEdit.data ?? []).toEqual([]);
    expect((await asMember.from('website_services').insert({ title_hr: 'Limarija' })).error).not.toBeNull();
    expect((await asMember.from('website_hours').update({ opens: '07:00' }).eq('weekday', 1).select()).data ?? []).toEqual([]);

    const adminEdit = await asAdmin.from('website_settings').update({ about_hr: 'Radimo od 2020.' }).eq('id', true).select();
    expect(adminEdit.data).toHaveLength(1);
    const service1 = await asAdmin.from('website_services').insert({ title_hr: uniqueText('Limarija'), title_en: 'Bodywork' }).select().single();
    expect(service1.error).toBeNull();
    const review = await asAdmin.from('website_reviews').insert({ author: 'Marko, Golf IV', stars: 5, text_hr: 'Sve pohvale!' }).select().single();
    expect(review.error).toBeNull();
    expect((await asAdmin.from('website_hours').update({ opens: '07:00', closes: '15:00' }).eq('weekday', 1).select()).data).toHaveLength(1);
    // closing before opening, or only one of the two times
    expect((await asAdmin.from('website_hours').update({ opens: '15:00', closes: '07:00' }).eq('weekday', 2)).error).not.toBeNull();
    expect((await asAdmin.from('website_hours').update({ opens: null }).eq('weekday', 3)).error).not.toBeNull();
    // the settings' links must be https
    expect((await asAdmin.from('website_settings').update({ instagram_url: 'javascript:alert(1)' }).eq('id', true)).error).not.toBeNull();
  });

  it('contact numbers need the country code and at least one button', async () => {
    expect((await asAdmin.from('website_contacts').insert({ name: 'David', phone: '091 234 5678' })).error).not.toBeNull();
    expect((await asAdmin.from('website_contacts').insert({ name: 'David', phone: '+385 91 234 5678', call: false })).error).not.toBeNull();
    const ok = await asAdmin.from('website_contacts').insert({ name: 'David', phone: '+385 91 234 5678', whatsapp: true }).select().single();
    expect(ok.error).toBeNull();
    expect((await asMember.from('website_contacts').insert({ name: 'Ivan', phone: '+385 98 111 2222' })).error).not.toBeNull();
  });
});

describe('cars and jobs on the website', () => {
  it('members put a car on the website; the address is unique and lowercase', async () => {
    const car = await newCar();
    const s = slug();
    const row = await asMember.from('website_cars').insert({ car_id: car.id, slug: s, title_hr: 'BMW E46 330d', is_public: true }).select().single();
    expect(row.error).toBeNull();
    const other = await newCar();
    expect((await asMember.from('website_cars').insert({ car_id: other.id, slug: s, title_hr: 'x' })).error?.code).toBe('23505');
    expect((await asMember.from('website_cars').insert({ car_id: other.id, slug: 'Not OK', title_hr: 'x' })).error).not.toBeNull();
    // one listing per car, and it can't be moved to another car
    expect((await asMember.from('website_cars').insert({ car_id: car.id, slug: slug(), title_hr: 'x' })).error?.code).toBe('23505');
    expect((await asMember.from('website_cars').update({ car_id: other.id }).eq('id', row.data!.id)).error?.code).toBe('42501');

    const { data: log } = await service.from('activity_log').select('action, summary').eq('entity_id', car.id);
    expect(log).toContainEqual({ action: 'website', summary: `Put ${car.ref} on the website` });
    await asMember.from('website_cars').update({ is_public: false }).eq('id', row.data!.id);
    const { data: log2 } = await service.from('activity_log').select('summary').eq('entity_id', car.id).eq('action', 'website');
    expect(log2!.map((l) => l.summary)).toContain(`Took ${car.ref} off the website`);
  });

  it("a customer's job goes on the website only after the customer agreed", async () => {
    const job = await newJob();
    const { data: row } = await asMember.from('website_cars').insert({ job_id: job.id, slug: slug(), title_hr: 'VW Golf' }).select().single();
    expect((await asMember.from('website_cars').update({ is_public: true }).eq('id', row!.id)).error).not.toBeNull();
    expect((await asMember.from('website_cars').update({ is_public: true, customer_agreed: true }).eq('id', row!.id)).error).toBeNull();
    // taking the agreement back needs taking it off the website too
    expect((await asMember.from('website_cars').update({ customer_agreed: false }).eq('id', row!.id)).error).not.toBeNull();
    expect((await asMember.from('website_cars').insert({ car_id: (await newCar()).id, job_id: job.id, slug: slug(), title_hr: 'x' })).error).not.toBeNull();
  });

  it('members choose photos with set_photo_on_website, never by writing attachments', async () => {
    const car = await newCar();
    const photo = await addPhoto('car', car.id);
    const receipt = await addPhoto('car', car.id, 'receipt');
    const tool = await addPhoto('tool', crypto.randomUUID());
    expect((await asMember.rpc('set_photo_on_website', { p_attachment_id: photo.id, p_on: true })).error).toBeNull();
    expect((await service.from('attachments').select('on_website').eq('id', photo.id).single()).data?.on_website).toBe(true);
    expect((await asMember.rpc('set_photo_on_website', { p_attachment_id: receipt.id, p_on: true })).error?.message).toMatch(/Only photos/);
    expect((await asMember.rpc('set_photo_on_website', { p_attachment_id: tool.id, p_on: true })).error?.message).toMatch(/Only photos/);
    expect((await asMember.from('attachments').update({ on_website: false }).eq('id', photo.id)).error?.code).toBe('42501');
  });
});

describe('what the website is built from', () => {
  it('only the service role reads the snapshot and photos', async () => {
    expect((await asAdmin.rpc('website_snapshot')).error).not.toBeNull();
    expect((await asMember.rpc('website_photo', { p_attachment_id: crypto.randomUUID() })).error).not.toBeNull();
  });

  it('holds only published cars, the shown details, and never private ones', async () => {
    const car = await newCar({ status: 'listed' });
    const shown = await addPhoto('car', car.id);
    const hidden = await addPhoto('car', car.id);
    const before = await addPhoto('car', car.id);
    const after = await addPhoto('car', car.id);
    const { data: albums } = await service.from('photo_albums').select('id, name');
    await service.from('attachments').update({ album_id: albums!.find((a) => a.name === 'Before')!.id }).eq('id', before.id);
    await service.from('attachments').update({ album_id: albums!.find((a) => a.name === 'After')!.id }).eq('id', after.id);
    for (const p of [shown, before, after]) await asMember.rpc('set_photo_on_website', { p_attachment_id: p.id, p_on: true });
    const { data: row } = await asMember
      .from('website_cars')
      .insert({ car_id: car.id, slug: slug(), title_hr: 'BMW E46', story_hr: 'Novi kvačilo', show_mileage: false, is_public: true })
      .select()
      .single();

    const entry = await snapshotCar(row!.id);
    expect(entry).toMatchObject({ kind: 'flip', status: 'listed', make: 'BMW', year: 2003, engine: '330d', fuel: 'Diesel', mileage_km: null, price_cents: 650000 });
    // the chosen photos in the order they were added, with their before/after album
    expect(entry!.photos).toEqual([
      { id: shown.id, favorite: false, album: null },
      { id: before.id, favorite: false, album: 'before' },
      { id: after.id, favorite: false, album: 'after' },
    ]);

    const text = JSON.stringify(await service.rpc('website_snapshot'));
    for (const secret of [car.vin!, car.plate!, 'secret note', car.ref]) expect(text).not.toContain(secret);
    expect(text).not.toContain(hidden.id);

    // sold: no price any more
    await service.from('cars').update({ status: 'sold' }).eq('id', car.id);
    expect((await snapshotCar(row!.id))!.price_cents).toBeNull();

    // off the website: gone, photos included
    await asMember.from('website_cars').update({ is_public: false }).eq('id', row!.id);
    expect(await snapshotCar(row!.id)).toBeUndefined();
    expect((await service.rpc('website_photo', { p_attachment_id: shown.id })).data).toEqual([]);
  });

  it("a job's customer, plate and price stay private", async () => {
    const job = await newJob();
    const { data: row } = await asMember
      .from('website_cars')
      .insert({ job_id: job.id, slug: slug(), title_hr: 'VW Golf II', customer_agreed: true, is_public: true })
      .select()
      .single();
    const entry = await snapshotCar(row!.id);
    expect(entry).toMatchObject({ kind: 'job', make: 'VW', model: 'Golf', year: 1999, price_cents: null, status: null });
    const text = JSON.stringify(entry);
    expect(text).not.toContain('ST-999-ZZ');
    expect(text).not.toContain(customerId);
    expect(text).not.toContain(job.ref);
  });

  it('website_photo serves only photos that are on the website', async () => {
    const car = await newCar();
    const onSite = await addPhoto('car', car.id);
    const notChosen = await addPhoto('car', car.id);
    await asMember.rpc('set_photo_on_website', { p_attachment_id: onSite.id, p_on: true });
    // chosen, but the car isn't public yet
    expect((await service.rpc('website_photo', { p_attachment_id: onSite.id })).data).toEqual([]);
    await asMember.from('website_cars').insert({ car_id: car.id, slug: slug(), title_hr: 'x', is_public: true });
    expect((await service.rpc('website_photo', { p_attachment_id: onSite.id })).data).toEqual([{ drive_file_id: onSite.drive_file_id, mime_type: 'image/jpeg' }]);
    expect((await service.rpc('website_photo', { p_attachment_id: notChosen.id })).data).toEqual([]);

    // "about us" photos are all on the website
    const { data: settings } = await service.from('website_settings').select('photos_id').single();
    const about = await addPhoto('website', settings!.photos_id);
    expect((await service.rpc('website_photo', { p_attachment_id: about.id })).data).toHaveLength(1);
    const { data: snap } = await service.rpc('website_snapshot');
    expect((snap as { site_photos: { id: string }[] }).site_photos.map((p) => p.id)).toContain(about.id);
  });
});
