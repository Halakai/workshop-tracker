// Photos and receipts in the admin's Google Drive (scope drive.file: the app only sees files it created).
//
//   POST /files/upload   multipart: file, entity_type, entity_id, kind, label?, album_id?   (signed-in member)
//   POST /files/favorite multipart: id, favorite=1|0, thumb?  → the record's favorite photo (signed-in member)
//   POST /files/prune-thumbs  → trashes previews of photos that aren't a favorite        (signed-in admin)
//   POST /files/sign     { ids: [...] } → signed view links                             (signed-in member)
//   GET  /files/view/:id?v=thumb|full&exp=…&sig=…  → streams the file from Drive          (signed link)
//   POST /files/invoice-link  { job_id } → a link for the customer, valid for a year       (signed-in member)
//   GET  /files/invoice/:jobId?exp=…&sig=…  → the job's latest invoice PDF                (signed link)
//   POST /files/delete   { id }  → moves the file to Drive's trash                        (signed-in member)
//   POST /files/health   checks the Google connection                                     (signed-in admin)
//
// Secrets (Supabase → Edge Functions → Secrets): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
// GOOGLE_REFRESH_TOKEN, FILE_URL_SIGNING_SECRET.
import { createAdminClient, verifyAuth } from 'npm:@supabase/server@1/core';
import {
  ALLOWED_MIME,
  ENTITY_TYPES,
  FILE_KINDS,
  MAX_UPLOAD_BYTES,
  THUMBS_FOLDER,
  fileNameFor,
  folderChain,
  invoiceLinkExpiry,
  invoicePayload,
  linkExpiry,
  signingPayload,
  type EntityType,
  type FileKind,
  type FolderSpec,
} from './paths.ts';

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const admin = createAdminClient();

// ---------------------------------------------------------------------------
// Google
// ---------------------------------------------------------------------------
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
let cachedToken: { token: string; expires: number } | null = null;

function googleConfigured() {
  return Boolean(Deno.env.get('GOOGLE_CLIENT_ID') && Deno.env.get('GOOGLE_CLIENT_SECRET') && Deno.env.get('GOOGLE_REFRESH_TOKEN'));
}

async function accessToken(): Promise<string> {
  if (!googleConfigured()) throw new HttpError(503, 'Google Drive is not connected yet (see README → Google Drive).');
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: Deno.env.get('GOOGLE_REFRESH_TOKEN')!,
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('token refresh failed', res.status, body);
    if (body?.error === 'invalid_grant') {
      throw new HttpError(503, 'Google Drive is disconnected: the access was revoked or expired. An admin has to reconnect it (README → Google Drive).');
    }
    throw new HttpError(502, 'Could not reach Google Drive. Try again in a moment.');
  }
  cachedToken = { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

async function drive(path: string, init: RequestInit = {}, base = DRIVE): Promise<Response> {
  const token = await accessToken();
  return fetch(`${base}${path}`, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
}

async function createFolder(name: string, parentId: string | null): Promise<string> {
  const res = await drive('/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parentId ? { parents: [parentId] } : {}) }),
  });
  if (!res.ok) throw new HttpError(502, `Drive refused to create the folder “${name}”`);
  return (await res.json()).id;
}

/** Finds (from the cache) or creates every folder of the chain and returns the last one's id. */
async function ensureFolders(chain: FolderSpec[]): Promise<string> {
  const { data: cached } = await admin.from('drive_folders').select('key, drive_folder_id').in('key', chain.map((f) => f.key));
  const ids = new Map((cached ?? []).map((r) => [r.key, r.drive_folder_id]));
  for (const folder of chain) {
    if (ids.has(folder.key)) continue;
    const parentId = folder.parent ? ids.get(folder.parent)! : null;
    const id = await createFolder(folder.name, parentId);
    await admin.from('drive_folders').upsert({ key: folder.key, drive_folder_id: id });
    ids.set(folder.key, id);
  }
  return ids.get(chain[chain.length - 1].key)!;
}

/** Forgets cached folders (e.g. someone deleted them in Drive) so they are created again. */
async function forgetFolders(chain: FolderSpec[]) {
  await admin.from('drive_folders').delete().in('key', chain.map((f) => f.key).filter((k) => k !== 'root'));
}

async function uploadFile(file: Blob, name: string, mimeType: string, folderId: string): Promise<{ id: string; size: number } | null> {
  const boundary = `wt${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name, parents: [folderId], mimeType });
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ]);
  const res = await drive(
    '/files?uploadType=multipart&fields=id,size',
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    UPLOAD,
  );
  if (res.status === 404) return null; // the folder is gone
  if (!res.ok) {
    console.error('upload failed', res.status, await res.text());
    throw new HttpError(502, 'Google Drive refused the upload.');
  }
  const json = await res.json();
  return { id: json.id, size: Number(json.size ?? file.size) };
}

async function uploadInto(chain: FolderSpec[], file: Blob, name: string, mimeType: string) {
  let folderId = await ensureFolders(chain);
  let result = await uploadFile(file, name, mimeType, folderId);
  if (!result) {
    await forgetFolders(chain);
    folderId = await ensureFolders(chain);
    result = await uploadFile(file, name, mimeType, folderId);
    if (!result) throw new HttpError(502, 'Could not find or create the Drive folder.');
  }
  return result;
}

// ---------------------------------------------------------------------------
// Signed view links (so <img src> works without a login header)
// ---------------------------------------------------------------------------
async function hmac(payload: string): Promise<string> {
  const secret = Deno.env.get('FILE_URL_SIGNING_SECRET');
  if (!secret) throw new HttpError(503, 'FILE_URL_SIGNING_SECRET is not set.');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Where browsers reach this function. Behind Supabase's proxy the function sees its own address as http://, and
 * phones may block http:// pictures inside the https:// app, so links use the project's public https address.
 */
function publicBase(req: Request) {
  const configured = Deno.env.get('SUPABASE_URL');
  const origin = configured?.startsWith('https://') ? configured : new URL(req.url).origin;
  return `${origin.replace(/\/+$/, '')}/functions/v1/files`;
}

async function signedUrl(base: string, id: string, variant: 'thumb' | 'full', exp: number) {
  const sig = await hmac(signingPayload(id, variant, exp));
  return `${base}/view/${id}?v=${variant}&exp=${exp}&sig=${sig}`;
}

// ---------------------------------------------------------------------------
// Who is calling
// ---------------------------------------------------------------------------
async function requireMember(req: Request, needAdmin = false) {
  const { data: auth, error } = await verifyAuth(req, { auth: 'user' });
  if (error || !auth?.userClaims?.id) throw new HttpError(401, 'Not signed in');
  const userId = auth.userClaims.id;
  const { data: profile } = await admin.from('profiles').select('id, role, is_active').eq('id', userId).maybeSingle();
  if (!profile?.is_active) throw new HttpError(403, 'Not a member of this workshop');
  if (needAdmin && profile.role !== 'admin') throw new HttpError(403, 'Only an admin can do this');
  return userId;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
async function folderChainFor(entityType: EntityType, entityId: string, kind: FileKind): Promise<FolderSpec[]> {
  if (entityType === 'car') {
    const { data: car } = await admin.from('cars').select('id, ref, year, make, model, plate').eq('id', entityId).maybeSingle();
    if (!car) throw new HttpError(404, 'Car not found');
    return folderChain({ type: 'car', car, kind });
  }
  if (entityType === 'job') {
    const { data: job } = await admin
      .from('jobs')
      .select('id, ref, car_plate, created_at, customer:contacts!jobs_customer_id_fkey(name)')
      .eq('id', entityId)
      .maybeSingle();
    if (!job) throw new HttpError(404, 'Job not found');
    const customer = (job.customer as unknown as { name: string } | null)?.name ?? '';
    return folderChain({
      type: 'job',
      job: { id: job.id, ref: job.ref, customer, plate: job.car_plate, createdYear: new Date(job.created_at).getUTCFullYear() },
      kind,
    });
  }
  if (entityType === 'tool') {
    const { data: tool } = await admin.from('tools').select('id, code, name').eq('id', entityId).maybeSingle();
    if (!tool) throw new HttpError(404, 'Tool not found');
    return folderChain({ type: 'tool', tool });
  }
  if (entityType === 'item') {
    const { data: item } = await admin.from('items').select('id, part_number, name').eq('id', entityId).maybeSingle();
    if (!item) throw new HttpError(404, 'Item not found');
    return folderChain({ type: 'item', item });
  }
  // stock purchases and other money: receipts by year; a car's money goes into the car's folder
  if (entityType === 'transaction') {
    const { data: txn } = await admin.from('transactions').select('id, car_id, job_id, occurred_on').eq('id', entityId).maybeSingle();
    if (!txn) throw new HttpError(404, 'Entry not found');
    if (txn.car_id) return folderChainFor('car', txn.car_id, 'receipt');
    if (txn.job_id) return folderChainFor('job', txn.job_id, 'receipt');
    return folderChain({ type: 'other', year: Number(txn.occurred_on.slice(0, 4)) });
  }
  const { data: movement } = await admin.from('stock_movements').select('id, occurred_on').eq('id', entityId).maybeSingle();
  if (!movement) throw new HttpError(404, 'Stock movement not found');
  return folderChain({ type: 'other', year: Number(movement.occurred_on.slice(0, 4)) });
}

async function upload(req: Request) {
  const userId = await requireMember(req);
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, 'Send the file as multipart/form-data');
  const file = form.get('file');
  const entityType = String(form.get('entity_type') ?? '') as EntityType;
  const entityId = String(form.get('entity_id') ?? '');
  const kind = String(form.get('kind') ?? '') as FileKind;
  const label = String(form.get('label') ?? '');
  const albumId = String(form.get('album_id') ?? '') || null;
  if (!(file instanceof File)) throw new HttpError(400, 'No file');
  if (!ENTITY_TYPES.includes(entityType) || !FILE_KINDS.includes(kind) || !/^[0-9a-f-]{36}$/i.test(entityId)) {
    throw new HttpError(400, 'Invalid target');
  }
  if (albumId) {
    if (kind !== 'photo' || !/^[0-9a-f-]{36}$/i.test(albumId)) throw new HttpError(400, 'Only photos go into albums');
    const { data: album } = await admin.from('photo_albums').select('id').eq('id', albumId).maybeSingle();
    if (!album) throw new HttpError(404, 'That album no longer exists');
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'File too large (max 9 MB). Photos are shrunk automatically; for PDFs use a smaller scan.');
  if (!ALLOWED_MIME.test(file.type)) throw new HttpError(415, 'Only photos (JPEG, PNG, WebP, HEIC) and PDFs');

  const chain = await folderChainFor(entityType, entityId, kind);
  const name = fileNameFor(new Date().toISOString().slice(0, 10), label, file.name, file.type);
  // no preview here: only a favorite photo gets one (see favorite())
  const stored = await uploadInto(chain, file, name, file.type);

  const { data, error } = await admin
    .from('attachments')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      kind,
      drive_file_id: stored.id,
      file_name: name,
      mime_type: file.type,
      size_bytes: stored.size,
      album_id: albumId,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return Response.json(data);
}

async function sign(req: Request) {
  await requireMember(req);
  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === 'string').slice(0, 200) : [];
  const { data: rows } = await admin.from('attachments').select('id, drive_thumb_id, mime_type').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  const base = publicBase(req);
  const exp = linkExpiry(new Date());
  const links: Record<string, { thumb: string | null; full: string }> = {};
  for (const r of rows ?? []) {
    links[r.id] = {
      thumb: r.drive_thumb_id ? await signedUrl(base, r.id, 'thumb', exp) : null,
      full: await signedUrl(base, r.id, 'full', exp),
    };
  }
  return Response.json({ links });
}

async function view(req: Request, id: string) {
  const url = new URL(req.url);
  const variant = url.searchParams.get('v') === 'thumb' ? 'thumb' : 'full';
  const exp = Number(url.searchParams.get('exp'));
  const sig = url.searchParams.get('sig') ?? '';
  if (!exp || exp * 1000 < Date.now()) throw new HttpError(403, 'Link expired');
  if (!timingSafeEqual(sig, await hmac(signingPayload(id, variant, exp)))) throw new HttpError(403, 'Bad link');
  const { data: row } = await admin.from('attachments').select('drive_file_id, drive_thumb_id, mime_type, file_name').eq('id', id).maybeSingle();
  if (!row) throw new HttpError(404, 'File not found');
  const driveId = variant === 'thumb' && row.drive_thumb_id ? row.drive_thumb_id : row.drive_file_id;
  const res = await drive(`/files/${driveId}?alt=media`);
  if (res.status === 404) throw new HttpError(404, 'The file is no longer in Google Drive');
  if (!res.ok) throw new HttpError(502, 'Google Drive did not return the file');
  return new Response(res.body, {
    headers: {
      'Content-Type': variant === 'thumb' && row.drive_thumb_id ? 'image/jpeg' : row.mime_type,
      'Content-Disposition': `inline; filename="${encodeURIComponent(row.file_name)}"`,
      'Cache-Control': 'private, max-age=86400',
    },
  });
}

/** A link the customer can open without an account; it always shows the job's latest invoice copy. */
async function invoiceLink(req: Request) {
  await requireMember(req);
  const body = await req.json().catch(() => null);
  const jobId = typeof body?.job_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.job_id) ? body.job_id : '';
  const { data: copy } = await admin.from('attachments').select('id').eq('entity_type', 'job').eq('entity_id', jobId).eq('kind', 'invoice').limit(1).maybeSingle();
  if (!copy) throw new HttpError(404, 'No invoice copy in Google Drive yet. Make the invoice first.');
  const exp = invoiceLinkExpiry(new Date());
  const sig = await hmac(invoicePayload(jobId, exp));
  return Response.json({ url: `${publicBase(req)}/invoice/${jobId}?exp=${exp}&sig=${sig}`, expires: exp });
}

async function invoice(req: Request, jobId: string) {
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get('exp'));
  const sig = url.searchParams.get('sig') ?? '';
  if (!exp || exp * 1000 < Date.now()) throw new HttpError(403, 'This invoice link has expired. Ask the workshop for a new one.');
  if (!timingSafeEqual(sig, await hmac(invoicePayload(jobId, exp)))) throw new HttpError(403, 'This invoice link is not valid.');
  const { data: row } = await admin
    .from('attachments')
    .select('drive_file_id, file_name')
    .eq('entity_type', 'job')
    .eq('entity_id', jobId)
    .eq('kind', 'invoice')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) throw new HttpError(404, 'This invoice is no longer available.');
  const res = await drive(`/files/${row.drive_file_id}?alt=media`);
  if (res.status === 404) throw new HttpError(404, 'This invoice is no longer available.');
  if (!res.ok) throw new HttpError(502, 'The invoice could not be loaded. Try again in a moment.');
  return new Response(res.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
      // a remade invoice replaces the copy: don't keep an old one for long
      'Cache-Control': 'private, max-age=300',
    },
  });
}

/** To Drive's trash (recoverable there for 30 days); a file that is already gone is fine. */
async function trashInDrive(driveId: string) {
  const res = await drive(`/files/${driveId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
  if (!res.ok && res.status !== 404) throw new HttpError(502, 'Google Drive refused to delete the file');
}

async function remove(req: Request) {
  await requireMember(req);
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  const { data: row } = await admin.from('attachments').select('id, drive_file_id, drive_thumb_id').eq('id', id).maybeSingle();
  if (!row) throw new HttpError(404, 'File not found');
  for (const driveId of [row.drive_file_id, row.drive_thumb_id].filter(Boolean) as string[]) await trashInDrive(driveId);
  await admin.from('attachments').delete().eq('id', row.id);
  return Response.json({ ok: true });
}

/**
 * Makes a photo the favorite of its car / job / tool / item (shown first, and as the picture in the lists), or
 * takes that back. Only the favorite keeps a small preview in .thumbs: the app sends one along, and the previous
 * favorite's preview goes to the Drive trash.
 */
async function favorite(req: Request) {
  await requireMember(req);
  const form = await req.formData().catch(() => null);
  const id = String(form?.get('id') ?? '');
  const on = form?.get('favorite') === '1';
  const thumb = form?.get('thumb');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, 'Which photo?');
  const { data: photo } = await admin
    .from('attachments')
    .select('id, entity_type, entity_id, kind, drive_file_id, drive_thumb_id')
    .eq('id', id)
    .maybeSingle();
  if (!photo) throw new HttpError(404, 'Photo not found');
  if (photo.kind !== 'photo') throw new HttpError(400, 'Only a photo can be the favorite');

  if (!on) {
    if (photo.drive_thumb_id) await trashInDrive(photo.drive_thumb_id);
    await admin.from('attachments').update({ is_cover: false, drive_thumb_id: null }).eq('id', photo.id);
    return Response.json({ ok: true });
  }

  let thumbId: string | null = photo.drive_thumb_id;
  if (!thumbId && thumb instanceof File && thumb.size > 0 && thumb.size < 512 * 1024) {
    thumbId = (await uploadInto(THUMBS_FOLDER, thumb, `${photo.drive_file_id}.jpg`, 'image/jpeg')).id;
  }
  // the record's other photos stop being the favorite and lose their preview
  const { data: others } = await admin
    .from('attachments')
    .select('id, drive_thumb_id')
    .eq('entity_type', photo.entity_type)
    .eq('entity_id', photo.entity_id)
    .neq('id', photo.id)
    .or('is_cover.eq.true,drive_thumb_id.not.is.null');
  for (const o of others ?? []) if (o.drive_thumb_id) await trashInDrive(o.drive_thumb_id);
  if (others?.length) await admin.from('attachments').update({ is_cover: false, drive_thumb_id: null }).in('id', others.map((o) => o.id));
  const { error } = await admin.from('attachments').update({ is_cover: true, drive_thumb_id: thumbId }).eq('id', photo.id);
  if (error) throw error;
  return Response.json({ ok: true });
}

/** Moves the previews of photos that aren't a favorite to the Drive trash (older uploads made one for every photo). */
async function pruneThumbs(req: Request) {
  await requireMember(req, true);
  const { data: rows } = await admin.from('attachments').select('id, drive_thumb_id').eq('is_cover', false).not('drive_thumb_id', 'is', null).limit(150);
  for (const r of rows ?? []) {
    await trashInDrive(r.drive_thumb_id!);
    await admin.from('attachments').update({ drive_thumb_id: null }).eq('id', r.id);
  }
  const { count } = await admin.from('attachments').select('id', { count: 'exact', head: true }).eq('is_cover', false).not('drive_thumb_id', 'is', null);
  return Response.json({ removed: rows?.length ?? 0, left: count ?? 0 });
}

async function health(req: Request) {
  await requireMember(req, true);
  if (!googleConfigured()) return Response.json({ ok: false, message: 'Google Drive is not connected yet.' });
  if (!Deno.env.get('FILE_URL_SIGNING_SECRET')) return Response.json({ ok: false, message: 'FILE_URL_SIGNING_SECRET is missing.' });
  const rootId = await ensureFolders(THUMBS_FOLDER.slice(0, 1));
  const res = await drive(`/files/${rootId}?fields=id,name,trashed`);
  if (res.status === 404) {
    await forgetFolders(THUMBS_FOLDER);
    await admin.from('drive_folders').delete().eq('key', 'root');
    return Response.json({ ok: false, message: 'The “Workshop Tracker” folder was deleted; it will be created again on the next upload.' });
  }
  const info = await res.json();
  return Response.json({ ok: !info.trashed, message: info.trashed ? 'The “Workshop Tracker” folder is in the Drive trash.' : `Connected. Files go to “${info.name}” in your Drive.` });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

async function route(req: Request): Promise<Response> {
  try {
    const path = new URL(req.url).pathname.replace(/^.*\/files/, '');
    const viewMatch = /^\/view\/([0-9a-f-]{36})$/i.exec(path);
    if (req.method === 'GET' && viewMatch) return await view(req, viewMatch[1]);
    const invoiceMatch = /^\/invoice\/([0-9a-f-]{36})$/i.exec(path);
    if (req.method === 'GET' && invoiceMatch) return await invoice(req, invoiceMatch[1]);
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST');
    switch (path) {
      case '/upload':
        return await upload(req);
      case '/sign':
        return await sign(req);
      case '/invoice-link':
        return await invoiceLink(req);
      case '/delete':
        return await remove(req);
      case '/favorite':
        return await favorite(req);
      case '/prune-thumbs':
        return await pruneThumbs(req);
      case '/health':
        return await health(req);
      default:
        throw new HttpError(404, 'Unknown route');
    }
  } catch (e) {
    // links opened in a browser (a customer's invoice link) get a readable sentence, not JSON
    if (e instanceof HttpError && req.method === 'GET') {
      return new Response(e.message, { status: e.status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: (e as Error)?.message ?? 'Unexpected error' }, { status: 500 });
  }
}

// A plain handler (not withSupabase): view links are opened by <img> tags without any credentials,
// and the other routes check the caller's JWT themselves (requireMember).
export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const res = await route(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};
