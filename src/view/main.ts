// view.html: the website for the team and the customers' pages (docs/PLAN.md §11), in the website's own look.
// The pages come from site/src (render.tsx, customer.tsx), drawn here in the browser from live data, so there is
// nothing to publish. Which page is the address' # part:
//   #/k/<code>/  a customer's page, opened with their key (#/k/<code>/en/ in English); anyone with the code
//   #/  home · #/en/  home in English · #/auti/<name>/ and #/en/cars/<name>/  one car      (the team only)
// Links inside a page (#radovi) just scroll.
import '../../site/src/site.css';
import { renderSite } from '../../site/src/render';
import { renderKeyPages, type KeyView } from '../../site/src/customer';
import { initSite } from '../../site/src/client';
import { T, type Lang } from '../../site/src/i18n';
import type { BuildContext, PhotoFiles, Snapshot } from '../../site/src/types';
import { supabase } from '@/lib/supabase';
import { normalizeKeyCode, rememberKey, rememberedKeys } from '@/lib/customerKeys';

/** view.html sits next to the app's index.html */
const APP = './';
/** "/workshop-tracker/": favicon, privacy page */
const ROOT = import.meta.env.BASE_URL.replace(/app\/$/, '');
const APP_ICON = `${import.meta.env.BASE_URL}favicon.svg`;

let team = false;

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function plainPage(lang: string, ...children: Node[]) {
  const box = document.createElement('main');
  box.className = 'mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center';
  box.append(...children);
  document.documentElement.lang = lang;
  document.body.className = 'min-h-dvh bg-bg font-sans text-fg antialiased';
  document.body.replaceChildren(box);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** A message (plain text, never HTML from outside), with a way out. */
function message(text: string, link?: { href: string; label: string }) {
  const nodes: Node[] = [el('p', 'text-lg text-muted', text)];
  if (link) {
    const a = el('a', 'rounded-full bg-accent px-5 py-3 font-semibold text-white', link.label);
    a.href = link.href;
    nodes.push(a);
  }
  plainPage('en', ...nodes);
}

function loading() {
  plainPage('hr', el('p', 'text-lg text-muted', '…'));
}

/** A customer types their code (also after a wrong one). */
function codeForm(lang: Lang, problem?: string) {
  const t = T[lang].key;
  document.title = t.enterCode;
  const form = el('form', 'flex w-full flex-col gap-3');
  const input = el('input', 'h-14 rounded-xl border border-line bg-card px-4 text-center font-mono text-2xl tracking-widest uppercase text-fg outline-none focus:border-accent');
  input.name = 'code';
  input.placeholder = 'K7M4-QX9P';
  input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'characters');
  input.spellcheck = false;
  input.maxLength = 12;
  input.required = true;
  const button = el('button', 'h-12 rounded-full bg-accent font-semibold text-white', t.open);
  button.type = 'submit';
  form.append(input, button);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = normalizeKeyCode(input.value);
    if (code) location.hash = `#/k/${code}/${lang === 'en' ? 'en/' : ''}`;
  });
  const nodes: Node[] = [el('h1', 'text-3xl font-bold', t.enterCode), el('p', 'text-muted', t.enterCodeLead), form];
  if (problem) nodes.push(el('p', 'font-semibold text-accent', problem));
  const login = el('a', 'text-sm text-muted underline', t.teamLogin);
  login.href = APP;
  nodes.push(login);
  plainPage(lang, ...nodes);
  input.focus();
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

// a link to a part of the same page (#radovi) scrolls there instead of changing the page's address
document.addEventListener('click', (e) => {
  const link = (e.target as Element).closest?.('a[href^="#"]');
  const href = link?.getAttribute('href');
  if (!href || href.startsWith('#/')) return;
  e.preventDefault();
  document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth' });
});

// ---------------------------------------------------------------------------
// Photos: signed links (the files function streams them from Google Drive)
// ---------------------------------------------------------------------------
type Links = Record<string, { thumb: string | null; full: string }>;

function toPhotoFiles(links: Links): Record<string, PhotoFiles> {
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

async function signPhotos(ids: string[]): Promise<Record<string, PhotoFiles>> {
  const unique = [...new Set(ids)];
  const links: Links = {};
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await supabase.functions.invoke('files/sign', { body: { ids: unique.slice(i, i + 200) } });
    if (error) throw error;
    Object.assign(links, (data as { links: Links }).links);
  }
  return toPhotoFiles(links);
}

// ---------------------------------------------------------------------------
// A customer's page
// ---------------------------------------------------------------------------
interface Opened {
  code: string;
  /** the key's pages by path ("index.html", "en/index.html", and a website key's car pages) */
  pages: Map<string, string>;
}
let opened: Opened | null = null;

/** "#/k/K7M4QX9P/" → K7M4QX9P; what follows is the page inside the key ("en/", "auti/golf/", "#kontakt"…) */
function keyRoute(hash: string): { code: string; rest: string } | null {
  const match = /^#\/k\/([^/#]*)\/?(.*)$/.exec(hash);
  return match ? { code: normalizeKeyCode(decodeURIComponent(match[1])), rest: match[2] } : null;
}

type Problem = { problem: 'bad' | 'many' | 'error' };

async function openKey(code: string): Promise<{ view: KeyView; photos: Record<string, PhotoFiles>; invoiceUrl: string | null } | Problem> {
  if (isSample()) {
    // development only: ZZZZZZZZ is a wrong code; codes starting with W, B or O open the sample website (as a key
    // showing for sale + contact, no prices), a buyer's or an owner's car; anything else the sample job
    if (code === 'ZZZZZZZZ') return { problem: 'bad' };
    if (code.startsWith('W')) {
      const s = (await import('../../site/fixtures/snapshot.json')).default as unknown as Snapshot;
      const cars = s.cars.filter((c) => c.kind === 'flip' && c.status === 'listed').map((c) => ({ ...c, price_cents: null }));
      const view: KeyView = { ...s, kind: 'website', code, cars, services: [], reviews: [], hidden: ['work', 'services', 'about', 'reviews'] };
      return { view, photos: samplePhotos(photoIds(view)), invoiceUrl: null };
    }
    if (code.startsWith('B') || code.startsWith('O')) {
      const s = (await import('../../site/fixtures/snapshot.json')).default as unknown as Snapshot;
      const car = { ...s.cars[0], plate: code.startsWith('O') ? 'ZG-123-AB' : null };
      const parts = [
        { date: '2026-10-02', description: 'Kvačilo (komplet)', qty: null, unit: null },
        { date: '2026-10-05', description: 'Motorno ulje 5W-30', qty: 4.5, unit: 'L' },
      ];
      const view: KeyView = { kind: code.startsWith('O') ? 'owner' : 'buyer', code, workshop: s.workshop, contacts: s.contacts, car, parts };
      return { view, photos: samplePhotos([...car.photos.map((p) => p.id), ...car.pairs.flatMap((p) => [p.before, p.after])]), invoiceUrl: null };
    }
    const view = (await import('../../site/fixtures/job-key.json')).default as unknown as KeyView;
    return { view, photos: samplePhotos(view.kind === 'job' ? view.photos.map((p) => p.id) : []), invoiceUrl: '#' };
  }
  const { data, error } = await supabase.functions.invoke('files/key', { body: { code } });
  if (error) {
    const status = (error as { context?: Response }).context?.status;
    return { problem: status === 404 ? 'bad' : status === 429 ? 'many' : 'error' };
  }
  const { links, invoice_url: invoiceUrl, ...view } = data as KeyView & { links: Links; invoice_url: string | null };
  return { view: view as KeyView, photos: toPhotoFiles(links ?? {}), invoiceUrl };
}

async function showKey(code: string, rest: string) {
  const lang: Lang = rest.startsWith('en/') || rest === 'en' ? 'en' : 'hr';
  if (!code) return codeForm(lang);
  if (opened?.code !== code) {
    loading();
    const result = await openKey(code);
    if ('problem' in result) {
      const t = T[lang].key;
      return codeForm(lang, result.problem === 'bad' ? t.badCode : result.problem === 'many' ? t.tooMany : t.loadError);
    }
    const ctx: BuildContext = {
      base: `#/k/${code}/`,
      root: ROOT,
      origin: location.origin,
      logo: result.view.workshop.logo ?? APP_ICON,
      photos: result.photos,
      team,
      appHref: APP,
    };
    opened = { code, pages: new Map(renderKeyPages(result.view, ctx, result.invoiceUrl).map((p) => [p.path, p.html])) };
    shownPage = null;
    if (!team) rememberKey(code);
  }
  showPage(opened.pages, `${code}:`, rest);
}

// ---------------------------------------------------------------------------
// The website (the team only)
// ---------------------------------------------------------------------------
let pages: Map<string, string> | null = null;
let shownPage: string | null = null;

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

function websiteContext(snapshot: Snapshot, photos: Record<string, PhotoFiles>): BuildContext {
  return { base: '#/', root: ROOT, origin: location.origin, logo: snapshot.workshop.logo ?? APP_ICON, photos, team: true, appHref: APP };
}

async function loadWebsite(): Promise<Map<string, string> | null> {
  const { data, error } = await supabase.rpc('website_preview');
  if (error) {
    message(error.code === '42501' ? 'Only the team can see the website.' : `The website couldn’t load: ${error.message}`, { href: APP, label: 'Back to the app' });
    return null;
  }
  const snapshot = data as unknown as Snapshot;
  const photos = await signPhotos(photoIds(snapshot)).catch(() => ({}));
  return new Map(renderSite(withPhotos(snapshot, photos), websiteContext(snapshot, photos)).map((p) => [p.path, p.html]));
}

/** Development only (`npm run dev`, view.html?sample): sample content from site/fixtures, without logging in. */
function isSample(): boolean {
  return import.meta.env.DEV && new URLSearchParams(location.search).has('sample');
}

function samplePhotos(ids: string[]): Record<string, PhotoFiles> {
  const colors = ['#3b4a5c', '#5c3b3b', '#3b5c4a', '#5c513b'];
  return Object.fromEntries(
    ids.map((id, i) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="${colors[i % 4]}"/><text x="80" y="1100" font-family="sans-serif" font-size="96" fill="#fff" fill-opacity=".5">${id}</text></svg>`;
      const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      return [id, { width: 1600, height: 1200, src: url, srcset: `${url} 1600w`, full: url, share: url }];
    }),
  );
}

async function loadSample(): Promise<Map<string, string>> {
  const snapshot = (await import('../../site/fixtures/snapshot.json')).default as unknown as Snapshot;
  const photos = samplePhotos(photoIds(snapshot));
  return new Map(renderSite(snapshot, websiteContext(snapshot, photos)).map((p) => [p.path, p.html]));
}

/** "auti/golf/#radovi" (or "#/auti/golf/#radovi") → page "auti/golf/index.html", then scroll to "radovi" */
function pageRoute(path: string): { page: string; anchor: string | null } {
  const [dirPart = '', anchor] = path.replace(/^#\/?/, '').split('#');
  let dir = decodeURIComponent(dirPart);
  if (dir && !dir.endsWith('/')) dir += '/';
  return { page: `${dir}index.html`, anchor: anchor || null };
}

/** Draws one of `pages` (unless it is already shown: `id` tells the website and keys apart), then scrolls. */
function showPage(pages: Map<string, string>, id: string, path: string) {
  const { page, anchor } = pageRoute(path);
  if (id + page !== shownPage) {
    draw(pages.get(page) ?? pages.get('404.html') ?? pages.get('index.html')!);
    shownPage = id + page;
  }
  const target = anchor && document.getElementById(anchor);
  if (target) target.scrollIntoView();
  else window.scrollTo(0, 0);
}

async function showWebsite(hash: string) {
  if (!pages) {
    loading();
    pages = isSample() ? await loadSample() : await loadWebsite();
    if (!pages) return;
  }
  showPage(pages, 'site:', hash);
}

// ---------------------------------------------------------------------------
// Which page
// ---------------------------------------------------------------------------
async function route() {
  const hash = location.hash || '#/';
  const key = keyRoute(hash);
  if (key) return showKey(key.code, key.rest);
  if (team || isSample()) return showWebsite(hash);
  // not signed in: a customer back on this phone gets their page again; anyone else the login
  const last = rememberedKeys()[0];
  if (last) location.replace(`#/k/${last}/`);
  else location.replace(APP);
}

async function start() {
  const { data } = await supabase.auth.getSession();
  team = Boolean(data.session);
  await route();
  window.addEventListener('hashchange', () => void route());
}

start().catch((e: unknown) => message(`The page couldn’t load: ${(e as Error)?.message ?? e}`, { href: APP, label: 'Back to the app' }));
