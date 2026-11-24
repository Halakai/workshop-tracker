// Repair manuals: the index of workshop-manuals.com (titles and addresses), so the app can search it.
//
//   POST /manuals/find   { prefixes: ["volkswagen"] } or { words: "passat b5" } → { slugs }   (signed-in member)
//   POST /manuals/open   { slug } → the manual's title, chapters and pages                    (signed-in member)
//
// The site's robots.txt allows every crawler and publishes these sitemaps for them. A manual's index is fetched once
// (two requests, a second apart, under our own name) and kept in manual_indexes; the pages are never fetched: people
// read them on the site. If the site refuses us, the app says so and nothing tries again by itself.
import { createAdminClient, verifyAuth } from 'npm:@supabase/server@1/core';
import { SITE, SLUG, UnreadableManual, indexUrl, parseManual, parseManualList, type ManualIndex } from './parse.ts';

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const admin = createAdminClient();

const DAY = 86_400_000;
/** How long the list of manuals and a manual's index stay as they are. */
const LIST_AGE = 30 * DAY;
const INDEX_AGE = 365 * DAY;
/** No sitemap or chapter list is anywhere near this big. */
const MAX_BYTES = 8_000_000;
const USER_AGENT = 'manual-index/1.0';

async function requireMember(req: Request) {
  const { data: auth, error } = await verifyAuth(req, { auth: 'user' });
  if (error || !auth?.userClaims?.id) throw new HttpError(401, 'Not signed in');
  const { data: profile } = await admin.from('profiles').select('id, is_active').eq('id', auth.userClaims.id).maybeSingle();
  if (!profile?.is_active) throw new HttpError(403, 'Not a member of this workshop');
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A page of the site as text. Anything odd (another host, a huge answer, no text) is refused. */
async function fetchText(url: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html, application/xml' }, signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new HttpError(502, 'The manuals’ site doesn’t answer. Try again later.');
  }
  const type = res.headers.get('content-type') ?? '';
  const refuse = async (status: number, message: string) => {
    await res.body?.cancel().catch(() => {});
    throw new HttpError(status, message);
  };
  if (!res.url.startsWith(`${SITE}/`)) await refuse(502, 'The manuals’ site sent us somewhere else.');
  if (res.status === 404) await refuse(404, 'This manual isn’t on the site anymore.');
  if (res.status === 403 || res.status === 429) await refuse(502, 'The manuals’ site refuses us right now. Open the manual on the site instead.');
  if (!res.ok || !/text\/html|xml/.test(type)) await refuse(502, `The manuals’ site answered with an error (${res.status}).`);
  if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) await refuse(502, 'The manuals’ site sent something we can’t read.');

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      throw new HttpError(502, 'The manuals’ site sent something we can’t read.');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

let listInMemory: { slugs: string[]; at: number } | null = null;

async function manualList(): Promise<string[]> {
  if (listInMemory && Date.now() - listInMemory.at < 10 * 60_000) return listInMemory.slugs;
  const { data: saved } = await admin.from('manual_lists').select('slugs, fetched_at').eq('id', 1).maybeSingle();
  let slugs = saved?.slugs as string[] | undefined;
  if (!saved || Date.now() - new Date(saved.fetched_at).getTime() > LIST_AGE) {
    try {
      const fresh = parseManualList(await fetchText(`${SITE}/sitemap.xml`));
      // a list that lost most of its manuals is a mistake, not news
      if (fresh.length > (slugs?.length ?? 0) / 2) {
        slugs = fresh;
        const { error } = await admin.from('manual_lists').upsert({ id: 1, slugs: fresh, fetched_at: new Date().toISOString() });
        if (error) console.error('could not keep the list', error);
      }
    } catch (e) {
      if (!slugs) throw e;
      console.error('could not refresh the list', e);
    }
  }
  if (!slugs?.length) throw new HttpError(502, 'The manuals’ site sent no list.');
  listInMemory = { slugs, at: Date.now() };
  return slugs;
}

async function find(req: Request) {
  const body = (await req.json().catch(() => null)) as { prefixes?: unknown; words?: unknown } | null;
  const prefixes = Array.isArray(body?.prefixes) ? body.prefixes.filter((p): p is string => typeof p === 'string' && /^[a-z0-9_-]{2,40}$/.test(p)) : [];
  const words = typeof body?.words === 'string' ? body.words.toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean).slice(0, 8) : [];
  if (prefixes.length === 0 && words.length === 0) throw new HttpError(400, 'Say which make or which words');
  const all = await manualList();
  const slugs = all.filter((s) => (prefixes.length === 0 || prefixes.some((p) => s.startsWith(`${p}_`))) && words.every((w) => s.includes(w)));
  return Response.json({ slugs: slugs.slice(0, prefixes.length ? 1500 : 200) });
}

async function open(req: Request) {
  const body = (await req.json().catch(() => null)) as { slug?: unknown } | null;
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  if (!SLUG.test(slug)) throw new HttpError(400, 'Which manual?');

  const { data: saved } = await admin.from('manual_indexes').select('slug, title, base, chapters, pages, fetched_at').eq('slug', slug).maybeSingle();
  const kept: ManualIndex | null = saved && { slug, title: saved.title, base: saved.base, chapters: saved.chapters, pages: saved.pages.split('\n') };
  if (kept && Date.now() - new Date(saved!.fetched_at).getTime() < INDEX_AGE) return Response.json(kept);

  try {
    const list = await manualList();
    if (!list.includes(slug)) throw new HttpError(404, 'The site has no such manual.');
    const sitemap = await fetchText(`${SITE}/sitemap-${encodeURI(slug)}.xml`);
    const chapters = indexUrl(sitemap);
    if (!chapters) throw new UnreadableManual('The manual has no chapter list');
    await pause(1000);
    const manual = parseManual(slug, sitemap, await fetchText(chapters));
    const { error } = await admin.from('manual_indexes').upsert({
      slug,
      title: manual.title,
      base: manual.base,
      chapters: manual.chapters,
      pages: manual.pages.join('\n'),
      page_count: manual.pages.length,
      fetched_at: new Date().toISOString(),
    });
    if (error) console.error('could not keep the index', slug, error);
    return Response.json(manual);
  } catch (e) {
    if (kept) return Response.json(kept);
    if (e instanceof UnreadableManual) throw new HttpError(502, 'This manual’s index can’t be read. Open it on the site.');
    throw e;
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function route(req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') throw new HttpError(405, 'Use POST');
    await requireMember(req);
    switch (new URL(req.url).pathname.replace(/^.*\/manuals/, '')) {
      case '/find':
        return await find(req);
      case '/open':
        return await open(req);
      default:
        throw new HttpError(404, 'Unknown route');
    }
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
    console.error(e);
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const res = await route(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};
