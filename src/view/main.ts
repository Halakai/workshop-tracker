// view.html: the website, now only for the team (docs/PLAN.md §11), in the website's own look.
// The pages come from site/src/render.tsx, drawn here in the browser from live data, so there is nothing to publish.
// Which page is the address' # part:
//   #/  home · #/en/  home in English · #/auti/<name>/ and #/en/cars/<name>/  one car
// Links inside a page (#radovi) just scroll.
import '../../site/src/site.css';
import { renderSite } from '../../site/src/render';
import { initSite } from '../../site/src/client';
import type { BuildContext, PhotoFiles, Snapshot } from '../../site/src/types';
import { supabase } from '@/lib/supabase';

/** view.html sits next to the app's index.html */
const APP = './';
/** "/workshop-tracker/": favicon, privacy page */
const ROOT = import.meta.env.BASE_URL.replace(/app\/$/, '');

// ---------------------------------------------------------------------------
// Messages while loading or when something is wrong (plain text, never HTML from outside)
// ---------------------------------------------------------------------------
function message(text: string, link?: { href: string; label: string }) {
  const box = document.createElement('main');
  box.className = 'mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center';
  const p = document.createElement('p');
  p.className = 'text-lg text-muted';
  p.textContent = text;
  box.append(p);
  if (link) {
    const a = document.createElement('a');
    a.href = link.href;
    a.className = 'rounded-full bg-accent px-5 py-3 font-semibold text-white';
    a.textContent = link.label;
    box.append(a);
  }
  document.body.className = 'min-h-dvh bg-bg font-sans text-fg antialiased';
  document.body.replaceChildren(box);
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
type Links = Record<string, { thumb: string | null; full: string }>;

/** Signed links for the photos (the files function streams them from Google Drive). */
async function photoLinks(ids: string[]): Promise<Record<string, PhotoFiles>> {
  const unique = [...new Set(ids)];
  const links: Links = {};
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await supabase.functions.invoke('files/sign', { body: { ids: unique.slice(i, i + 200) } });
    if (error) throw error;
    Object.assign(links, (data as { links: Links }).links);
  }
  return Object.fromEntries(
    Object.entries(links).map(([id, l]) => [
      id,
      {
        // the real size isn't stored; the pages crop photos to their frames anyway
        width: 1600,
        height: 1200,
        src: l.full,
        srcset: l.thumb ? `${l.thumb} 320w, ${l.full} 2000w` : `${l.full} 2000w`,
        full: l.full,
        share: l.full,
      },
    ]),
  );
}

function photoIds(s: Snapshot): string[] {
  return [...s.site_photos.map((p) => p.id), ...s.cars.flatMap((c) => [...c.photos.map((p) => p.id), ...c.pairs.flatMap((p) => [p.before, p.after])])];
}

/** Photos without a link (gone from Drive, say) are left out, and so are the before/after pairs they are in. */
function withPhotos(s: Snapshot, photos: Record<string, PhotoFiles>): Snapshot {
  const has = (id: string) => id in photos;
  return {
    ...s,
    site_photos: s.site_photos.filter((p) => has(p.id)),
    cars: s.cars.map((c) => ({ ...c, photos: c.photos.filter((p) => has(p.id)), pairs: c.pairs.filter((p) => has(p.before) && has(p.after)) })),
  };
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
let pages = new Map<string, string>();
let shown: string | null = null;

/** "#/auti/golf/#radovi" → page "auti/golf/index.html", then scroll to "radovi" */
function route(hash: string): { page: string; anchor: string | null } {
  const [path = '', anchor] = hash.replace(/^#\/?/, '').split('#');
  let dir = decodeURIComponent(path);
  if (dir && !dir.endsWith('/')) dir += '/';
  return { page: `${dir}index.html`, anchor: anchor || null };
}

function draw(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.title = doc.title;
  document.documentElement.lang = doc.documentElement.lang;
  document.documentElement.style.overflow = '';
  document.body.className = doc.body.className;
  document.body.replaceChildren(...Array.from(doc.body.childNodes, (n) => document.importNode(n, true)));
  initSite(document);
}

function show() {
  const { page, anchor } = route(location.hash || '#/');
  const html = pages.get(page) ?? pages.get('404.html')!;
  if (page !== shown) {
    draw(html);
    shown = page;
  }
  const target = anchor && document.getElementById(anchor);
  if (target) target.scrollIntoView();
  else window.scrollTo(0, 0);
}

// a link to a part of the same page (#radovi) scrolls there instead of changing the page's address
document.addEventListener('click', (e) => {
  const link = (e.target as Element).closest?.('a[href^="#"]');
  const href = link?.getAttribute('href');
  if (!href || href.startsWith('#/')) return;
  e.preventDefault();
  document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' });
});

/** Development only (`npm run dev`, view.html?sample): the sample content from site/fixtures, with made-up photos. */
async function sample() {
  const snapshot = (await import('../../site/fixtures/snapshot.json')).default as unknown as Snapshot;
  const colors = ['#3b4a5c', '#5c3b3b', '#3b5c4a', '#5c513b'];
  const photos = Object.fromEntries(
    photoIds(snapshot).map((id, i) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="${colors[i % 4]}"/><text x="80" y="1100" font-family="sans-serif" font-size="96" fill="#fff" fill-opacity=".5">${id}</text></svg>`;
      const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      return [id, { width: 1600, height: 1200, src: url, srcset: `${url} 1600w`, full: url, share: url }];
    }),
  );
  const ctx: BuildContext = { base: '#/', root: ROOT, origin: location.origin, logo: `${import.meta.env.BASE_URL}favicon.svg`, photos, team: true, appHref: APP };
  pages = new Map(renderSite(snapshot, ctx).map((p) => [p.path, p.html]));
  show();
  window.addEventListener('hashchange', show);
}

async function start() {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('sample')) return sample();
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    location.replace(APP); // the app's login; the website is only for the team
    return;
  }
  const { data, error } = await supabase.rpc('website_preview');
  if (error) {
    message(error.code === '42501' ? 'Only the team can see the website.' : `The website couldn’t load: ${error.message}`, { href: APP, label: 'Back to the app' });
    return;
  }
  const snapshot = data as unknown as Snapshot;
  const photos = await photoLinks(photoIds(snapshot)).catch(() => ({}));
  const ctx: BuildContext = {
    base: '#/',
    root: ROOT,
    origin: location.origin,
    logo: snapshot.workshop.logo ?? `${import.meta.env.BASE_URL}favicon.svg`,
    photos,
    team: true,
    appHref: APP,
  };
  pages = new Map(renderSite(withPhotos(snapshot, photos), ctx).map((p) => [p.path, p.html]));
  show();
  window.addEventListener('hashchange', show);
}

start().catch((e: unknown) => message(`The website couldn’t load: ${(e as Error)?.message ?? e}`, { href: APP, label: 'Back to the app' }));
