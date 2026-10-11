import { beforeAll, describe, expect, it } from 'vitest';
import { createAuthUser, service, signIn, testEmail, uniqueText, url, type Client } from './helpers';

let asAdmin: Client;
let asMember: Client;
let before: string;
let after: string;

beforeAll(async () => {
  const ea = testEmail('photos-admin');
  const em = testEmail('photos-member');
  const adminId = await createAuthUser(ea);
  const memberId = await createAuthUser(em);
  const { error } = await service.from('profiles').insert([
    { id: adminId, display_name: 'Photos Admin', email: ea, role: 'admin', default_share_bp: 0 },
    { id: memberId, display_name: 'Photos Member', email: em, role: 'member', default_share_bp: 0 },
  ]);
  if (error) throw error;
  asAdmin = await signIn(ea);
  asMember = await signIn(em);
  const { data: albums } = await service.from('photo_albums').select('id, name');
  before = albums!.find((a) => a.name === 'Before')!.id;
  after = albums!.find((a) => a.name === 'After')!.id;
});

/** What the files function stores after an upload. */
async function addFile(entityId: string, kind: 'photo' | 'receipt' = 'photo', entityType = 'car') {
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

async function covers(entityId: string) {
  const { data } = await service.from('attachments').select('id').eq('entity_id', entityId).eq('is_cover', true);
  return data!.map((r) => r.id);
}

/** POST to the files function as this person (null: signed out). */
async function files(client: Client | null, path: string, body: FormData) {
  const headers: Record<string, string> = { apikey: process.env.SUPABASE_PUBLISHABLE_KEY! };
  if (client) {
    const { data } = await client.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch(`${url}/functions/v1/files${path}`, { method: 'POST', headers, body });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function favoriteForm(id: string, on: boolean) {
  const form = new FormData();
  form.append('id', id);
  form.append('favorite', on ? '1' : '0');
  return form;
}

describe('favorite photo (set by the files function)', () => {
  it('one per record: choosing another moves it, and it can be taken back', async () => {
    const car = crypto.randomUUID();
    const a = await addFile(car);
    const b = await addFile(car);
    const otherCar = crypto.randomUUID();
    const c = await addFile(otherCar);
    await service.from('attachments').update({ is_cover: true }).eq('id', c.id);

    expect((await files(asMember, '/favorite', favoriteForm(a.id, true))).status).toBe(200);
    expect(await covers(car)).toEqual([a.id]);
    expect((await files(asMember, '/favorite', favoriteForm(b.id, true))).status).toBe(200);
    expect(await covers(car)).toEqual([b.id]);
    // another car's favorite stays
    expect(await covers(otherCar)).toEqual([c.id]);
    expect((await files(asMember, '/favorite', favoriteForm(b.id, false))).status).toBe(200);
    expect(await covers(car)).toEqual([]);
  });

  it('only photos, only members, and never by writing the table directly', async () => {
    const car = crypto.randomUUID();
    const receipt = await addFile(car, 'receipt');
    expect((await files(asMember, '/favorite', favoriteForm(receipt.id, true))).status).toBe(400);
    expect((await service.from('attachments').update({ is_cover: true }).eq('id', receipt.id)).error).not.toBeNull();

    const photo = await addFile(car);
    expect((await files(null, '/favorite', favoriteForm(photo.id, true))).status).toBe(401);
    const direct = await asMember.from('attachments').update({ is_cover: true }).eq('id', photo.id);
    expect(direct.error?.code).toBe('42501');
    expect(await covers(car)).toEqual([]);
  });

  it('cleaning up old previews is for admins', async () => {
    expect((await files(asMember, '/prune-thumbs', new FormData())).status).toBe(403);
    expect(await files(asAdmin, '/prune-thumbs', new FormData())).toEqual({ status: 200, body: { removed: 0, left: 0 } });
  });
});

describe('albums', () => {
  it('starts with Before and After; members add albums, unique ignoring case', async () => {
    const name = uniqueText('Album');
    expect((await asMember.from('photo_albums').insert({ name })).error).toBeNull();
    expect((await asMember.from('photo_albums').insert({ name: name.toLowerCase() })).error?.code).toBe('23505');
  });

  it('members move photos between albums; only photos go into albums', async () => {
    const car = crypto.randomUUID();
    const photo = await addFile(car);
    expect((await asMember.rpc('move_photo_to_album', { p_attachment_id: photo.id, p_album_id: before })).error).toBeNull();
    expect((await service.from('attachments').select('album_id').eq('id', photo.id).single()).data!.album_id).toBe(before);
    await asMember.rpc('move_photo_to_album', { p_attachment_id: photo.id, p_album_id: after });
    expect((await service.from('attachments').select('album_id').eq('id', photo.id).single()).data!.album_id).toBe(after);
    await asMember.rpc('move_photo_to_album', { p_attachment_id: photo.id, p_album_id: null as unknown as string });
    expect((await service.from('attachments').select('album_id').eq('id', photo.id).single()).data!.album_id).toBeNull();

    const missing = await asMember.rpc('move_photo_to_album', { p_attachment_id: photo.id, p_album_id: crypto.randomUUID() });
    expect(missing.error?.code).toBe('23503');
    const receipt = await addFile(car, 'receipt');
    expect((await asMember.rpc('move_photo_to_album', { p_attachment_id: receipt.id, p_album_id: before })).error?.message).toMatch(/Only photos/);
  });

  it('only admins rename or delete albums, and an album with photos stays', async () => {
    const { data: album } = await asMember.from('photo_albums').insert({ name: uniqueText('Album') }).select().single();
    expect((await asMember.from('photo_albums').update({ name: 'Renamed' }).eq('id', album!.id).select()).data).toEqual([]);
    expect((await asAdmin.from('photo_albums').update({ name: uniqueText('Renamed') }).eq('id', album!.id).select()).data).toHaveLength(1);

    const photo = await addFile(crypto.randomUUID());
    await asMember.rpc('move_photo_to_album', { p_attachment_id: photo.id, p_album_id: album!.id });
    expect((await asAdmin.from('photo_albums').delete().eq('id', album!.id)).error?.code).toBe('23503');
  });
});

describe('photos of inventory items', () => {
  it('are accepted', async () => {
    const item = await addFile(crypto.randomUUID(), 'photo', 'item');
    expect(item.entity_type).toBe('item');
  });

  it('come with backups, albums before the photos in them', async () => {
    const { data } = await asMember.rpc('backup_tables');
    expect(data!.indexOf('photo_albums')).toBeLessThan(data!.indexOf('attachments'));
  });
});
