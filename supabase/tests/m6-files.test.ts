import { beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createAuthUser, service, signIn, testEmail, url, type Client } from './helpers';

let asMember: Client;
let asOutsider: Client;
let memberId: string;
let attachmentId: string;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY!;

beforeAll(async () => {
  const em = testEmail('files-member');
  const eo = testEmail('files-outsider');
  memberId = await createAuthUser(em);
  await createAuthUser(eo);
  const { error } = await service.from('profiles').insert({ id: memberId, display_name: 'Files Member', email: em, role: 'member' });
  if (error) throw error;
  asMember = await signIn(em);
  asOutsider = await signIn(eo);
  const { data, error: insertError } = await service
    .from('attachments')
    .insert({
      entity_type: 'car',
      entity_id: '00000000-0000-4000-8000-000000000001',
      kind: 'photo',
      drive_file_id: `drive-${Date.now()}`,
      file_name: 'test.jpg',
      mime_type: 'image/jpeg',
    })
    .select()
    .single();
  if (insertError) throw insertError;
  attachmentId = data.id;
});

async function call(client: Client | null, path: string, body: BodyInit | null, json = true) {
  const headers: Record<string, string> = { apikey: publishableKey };
  if (json) headers['Content-Type'] = 'application/json';
  if (client) {
    const { data } = await client.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch(`${url}/functions/v1/files${path}`, { method: 'POST', headers, body });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('attachments table', () => {
  it('members read it; nobody writes it directly', async () => {
    const read = await asMember.from('attachments').select('id').eq('id', attachmentId);
    expect(read.data).toHaveLength(1);
    const insert = await asMember.from('attachments').insert({
      entity_type: 'car',
      entity_id: '00000000-0000-4000-8000-000000000001',
      kind: 'photo',
      drive_file_id: 'x',
      file_name: 'x',
      mime_type: 'image/jpeg',
    });
    expect(insert.error?.code).toBe('42501');
    const del = await asMember.from('attachments').delete().eq('id', attachmentId);
    expect(del.error?.code).toBe('42501');
  });

  it('signed-out users and non-members see nothing', async () => {
    expect((await anonClient().from('attachments').select('*')).error).not.toBeNull();
    expect((await asOutsider.from('attachments').select('*')).data).toEqual([]);
    expect((await asMember.from('drive_folders' as 'attachments').select('*')).error).not.toBeNull();
  });
});

describe('files function', () => {
  it('rejects signed-out callers', async () => {
    expect((await call(null, '/sign', JSON.stringify({ ids: [attachmentId] }))).status).toBe(401);
    expect((await call(null, '/delete', JSON.stringify({ id: attachmentId }))).status).toBe(401);
    const form = new FormData();
    form.append('file', new Blob(['x'], { type: 'image/jpeg' }), 'x.jpg');
    expect((await call(null, '/upload', form, false)).status).toBe(401);
  });

  it('rejects signed-in non-members', async () => {
    expect((await call(asOutsider, '/sign', JSON.stringify({ ids: [attachmentId] }))).status).toBe(403);
    expect((await call(asOutsider, '/health', '{}')).status).toBe(403);
  });

  it('health is for admins only', async () => {
    expect((await call(asMember, '/health', '{}')).status).toBe(403);
  });

  it('lets members past the door (Drive itself is not connected in tests)', async () => {
    const form = new FormData();
    form.append('file', new Blob(['x'], { type: 'image/jpeg' }), 'x.jpg');
    form.append('entity_type', 'car');
    form.append('entity_id', '00000000-0000-4000-8000-000000000001');
    form.append('kind', 'photo');
    const upload = await call(asMember, '/upload', form, false);
    expect([404, 503]).toContain(upload.status); // car not found / Drive not connected — but not 401/403
  });

  it('view links need a valid signature', async () => {
    const res = await fetch(`${url}/functions/v1/files/view/${attachmentId}?v=full&exp=9999999999&sig=forged`);
    expect([403, 503]).toContain(res.status);
    const expired = await fetch(`${url}/functions/v1/files/view/${attachmentId}?v=full&exp=1&sig=x`);
    expect(expired.status).toBe(403);
  });
});
