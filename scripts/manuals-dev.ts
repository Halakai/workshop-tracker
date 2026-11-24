// `npm run dev` answers the manuals function's calls itself (supabase/functions/manuals), so repair manuals work on
// this computer before the function is deployed. Same parser, same two requests per manual; answers are kept in
// node_modules/.cache/manuals. Never part of the build.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';

type Parser = typeof import('../supabase/functions/manuals/parse');

const CACHE = 'node_modules/.cache/manuals';
const MAX_BYTES = 8_000_000;

async function fetchText(url: string, site: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'manual-index/1.0' }, signal: AbortSignal.timeout(20_000) });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !res.url.startsWith(`${site}/`) || !/text\/html|xml/.test(type) || Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) {
    await res.body?.cancel();
    throw new Error(`The manuals’ site answered with an error (${res.status}).`);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of res.body!) {
    size += chunk.byteLength;
    if (size > MAX_BYTES) throw new Error('The manuals’ site sent something we can’t read.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function kept<T>(name: string, load: () => Promise<T>): Promise<T> {
  const file = `${CACHE}/${name}.json`;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    const value = await load();
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, JSON.stringify(value));
    return value;
  }
}

async function bodyOf(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>;
}

export function manualsDev(base: string): Plugin {
  return {
    name: 'manuals-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(`${base}__manuals`, (req, res) => {
        const answer = async () => {
          const { SITE, SLUG, indexUrl, parseManual, parseManualList } = (await server.ssrLoadModule('/supabase/functions/manuals/parse.ts')) as Parser;
          const list = () => kept('list', async () => parseManualList(await fetchText(`${SITE}/sitemap.xml`, SITE)));
          const body = await bodyOf(req);
          if (req.url === '/find') {
            const prefixes = (body.prefixes as string[] | undefined) ?? [];
            const words = String(body.words ?? '').split(/[^a-z0-9.]+/).filter(Boolean);
            const slugs = (await list()).filter((s) => (prefixes.length === 0 || prefixes.some((p) => s.startsWith(`${p}_`))) && words.every((w) => s.includes(w)));
            return { slugs: slugs.slice(0, prefixes.length ? 1500 : 200) };
          }
          const slug = String(body.slug ?? '');
          if (!SLUG.test(slug) || !(await list()).includes(slug)) throw new Error('The site has no such manual.');
          return kept(slug, async () => {
            const sitemap = await fetchText(`${SITE}/sitemap-${encodeURI(slug)}.xml`, SITE);
            const chapters = indexUrl(sitemap);
            if (!chapters) throw new Error('This manual’s index can’t be read.');
            await new Promise((r) => setTimeout(r, 1000));
            return parseManual(slug, sitemap, await fetchText(chapters, SITE));
          });
        };
        answer().then(
          (value) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(value));
          },
          (e: Error) => {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message }));
          },
        );
      });
    },
  };
}
