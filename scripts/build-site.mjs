// Builds the public website into dist/, next to the app (dist/app, which `vite build` makes first).
//
//   node scripts/build-site.mjs           from sample data (site/fixtures): CI checks and a local look
//   node scripts/build-site.mjs --live    from the published content (the deploy, .github/workflows/pages.yml):
//                                         GET $SUPABASE_URL/functions/v1/files/site-data and /site-photo/<id>
//                                         with SITE_BUILD_TOKEN
//
// Photos are resized here (sharp; location and other EXIF data are dropped) and kept in .site-cache/, which the
// deploy workflow carries from build to build, so a publish only downloads new photos.
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import sharp from 'sharp';

const live = process.argv.includes('--live');
const base = process.env.BASE_PATH || '/';
const origin = process.env.SITE_ORIGIN || 'https://halakai.github.io';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const siteDir = new URL('site/', root);
const cache = new URL('.site-cache/photos/', root);
const path = (url) => fileURLToPath(url);

// bump when the photo sizes or quality change, so the cache is rebuilt
const PHOTO_VERSION = 1;
const WIDTHS = [480, 960, 1600];

// ---------------------------------------------------------------------------
// The content
// ---------------------------------------------------------------------------
function functionsBase() {
  const url = process.env.SUPABASE_URL;
  const token = process.env.SITE_BUILD_TOKEN;
  if (!url || !token) throw new Error('--live needs SUPABASE_URL and SITE_BUILD_TOKEN');
  return { url: `${url.replace(/\/+$/, '')}/functions/v1/files`, token };
}

async function fetchWithRetry(url, init, tries = 3) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, init).catch((e) => ({ ok: false, status: 0, statusText: String(e), text: async () => '' }));
    if (res.ok || i >= tries || (res.status >= 400 && res.status < 500)) return res;
    await new Promise((r) => setTimeout(r, 1000 * i));
  }
}

async function loadSnapshot() {
  if (!live) return JSON.parse(await readFile(new URL('fixtures/snapshot.json', siteDir), 'utf8'));
  const fn = functionsBase();
  const res = await fetchWithRetry(`${fn.url}/site-data`, { headers: { Authorization: `Bearer ${fn.token}` } });
  if (!res.ok) throw new Error(`site-data: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------
const FIXTURE_COLORS = ['#3b4a5c', '#5c3b3b', '#3b5c4a', '#5c513b', '#4a3b5c', '#2f4f5f'];

/** Sample photos for --fixtures: a gradient with the photo's name. */
function fixturePhoto(id) {
  const hash = createHash('sha1').update(id).digest()[0];
  const color = FIXTURE_COLORS[hash % FIXTURE_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#111"/></linearGradient></defs>
    <rect width="1600" height="1200" fill="url(#g)"/>
    <text x="80" y="1100" font-family="sans-serif" font-size="96" fill="#ffffff" fill-opacity="0.5">${id}</text></svg>`;
  return Buffer.from(svg);
}

async function sourcePhoto(id) {
  if (!live) return fixturePhoto(id);
  const fn = functionsBase();
  const res = await fetchWithRetry(`${fn.url}/site-photo/${id}`, { headers: { Authorization: `Bearer ${fn.token}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Resized copies of one photo (cached by id: a photo's file never changes), copied into dist/foto/<id>/. */
async function preparePhoto(id) {
  const name = id.replace(/[^a-zA-Z0-9-]/g, '');
  const dir = new URL(`${name}/`, cache);
  let meta = await readFile(new URL('meta.json', dir), 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  if (meta?.version !== PHOTO_VERSION || meta?.live !== live) {
    const input = await sourcePhoto(id);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    // .rotate() applies the phone's orientation; sharp writes no EXIF (GPS etc.) unless asked to
    const upright = await sharp(input, { failOn: 'none' }).rotate().toBuffer();
    let width = 0;
    let height = 0;
    for (const w of WIDTHS) {
      const info = await sharp(upright).resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path(new URL(`${w}.webp`, dir)));
      width = info.width;
      height = info.height;
    }
    await sharp(upright).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 80, mozjpeg: true }).toFile(path(new URL('share.jpg', dir)));
    meta = { version: PHOTO_VERSION, live, width, height };
    await writeFile(new URL('meta.json', dir), JSON.stringify(meta));
  }
  await cp(dir, new URL(`foto/${name}/`, dist), { recursive: true, filter: (src) => !src.endsWith('meta.json') });
  const url = (file) => `${base}foto/${name}/${file}`;
  return {
    width: meta.width,
    height: meta.height,
    src: url('960.webp'),
    srcset: WIDTHS.map((w) => `${url(`${w}.webp`)} ${Math.min(w, meta.width)}w`).join(', '),
    full: url('1600.webp'),
    share: url('share.jpg'),
  };
}

async function preparePhotos(ids) {
  const photos = {};
  const queue = [...new Set(ids)];
  const failed = [];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        try {
          photos[id] = await preparePhoto(id);
        } catch (e) {
          failed.push(id);
          console.warn(`  photo ${id} left out: ${e.message}`);
        }
      }
    }),
  );
  return { photos, failed };
}

/** Photos the build couldn't get are left out of the pages (and so are the before/after pairs they are in). */
function withoutPhotos(snapshot, failed) {
  if (failed.length === 0) return snapshot;
  const gone = new Set(failed);
  const keep = (list) => list.filter((p) => !gone.has(p.id));
  return {
    ...snapshot,
    site_photos: keep(snapshot.site_photos),
    cars: snapshot.cars.map((c) => ({
      ...c,
      photos: keep(c.photos),
      pairs: c.pairs.filter((pair) => !gone.has(pair.before) && !gone.has(pair.after)),
    })),
  };
}

// ---------------------------------------------------------------------------
// Logo (Workshop settings keep it as a data: URL)
// ---------------------------------------------------------------------------
async function writeLogo(dataUrl) {
  const match = /^data:image\/(png|jpeg|webp|svg\+xml);base64,(.+)$/.exec(dataUrl ?? '');
  if (!match) return `${base}favicon.svg`;
  const ext = { png: 'png', jpeg: 'jpg', webp: 'webp', 'svg+xml': 'svg' }[match[1]];
  const bytes = Buffer.from(match[2], 'base64');
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 8);
  await writeFile(new URL(`logo.${ext}`, dist), bytes);
  return `${base}logo.${ext}?v=${hash}`;
}

// ---------------------------------------------------------------------------
// Old links (…/#/cars/…) and the phone app installed before the move (it starts at the home page) go to the app.
// ---------------------------------------------------------------------------
const FORWARD_TO_APP = `<script>(function(){var h=location.hash.indexOf('#/')===0?location.hash:'';var i=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;if(h||i)location.replace('${base}app/'+h);})();</script>`;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
console.log(`Website from ${live ? 'the published content' : 'sample data'} (base ${base})`);
const loaded = await loadSnapshot();

await mkdir(dist, { recursive: true });
// clear what earlier builds left at the top level, but keep the app that `vite build` just made
for (const name of await readdir(dist)) {
  if (name !== 'app') await rm(new URL(name, dist), { recursive: true, force: true });
}

// styles and the small browser script, with hashed names
await build({
  configFile: false,
  root: path(siteDir),
  base: `${base}s/`,
  logLevel: 'warn',
  plugins: [tailwindcss()],
  build: {
    outDir: path(new URL('s/', dist)),
    emptyOutDir: true,
    assetsDir: '',
    manifest: true,
    rollupOptions: { input: path(new URL('src/client.ts', siteDir)) },
  },
});
const manifest = JSON.parse(await readFile(new URL('s/.vite/manifest.json', dist), 'utf8'));
await rm(new URL('s/.vite/', dist), { recursive: true });
const entry = manifest['src/client.ts'];

const allPhotoIds = [
  ...loaded.site_photos.map((p) => p.id),
  ...loaded.cars.flatMap((c) => [...c.photos.map((p) => p.id), ...c.pairs.flatMap((pair) => [pair.before, pair.after])]),
];
const { photos, failed } = await preparePhotos(allPhotoIds);
const snapshot = withoutPhotos(loaded, failed);
const logo = await writeLogo(snapshot.workshop.logo);

const ctx = {
  base,
  origin,
  css: (entry.css ?? []).map((f) => `${base}s/${f}`),
  js: `${base}s/${entry.file}`,
  logo,
  photos,
  preview: !live,
};

// the pages (React rendered to HTML, loaded through Vite so the .tsx works as it is)
const server = await createServer({
  configFile: false,
  root: path(siteDir),
  logLevel: 'warn',
  plugins: [react()],
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
});
try {
  const { renderSite, sitemapPaths } = await server.ssrLoadModule('/src/render.tsx');
  for (const page of renderSite(snapshot, ctx)) {
    const html = page.path === 'index.html' ? page.html.replace('<head>', `<head>${FORWARD_TO_APP}`) : page.html;
    const file = new URL(page.path, dist);
    await mkdir(new URL('./', file), { recursive: true });
    await writeFile(file, html);
  }
  const urls = sitemapPaths(snapshot, base).map((p) => `  <url><loc>${new URL(p, origin).href}</loc></url>`);
  await writeFile(new URL('sitemap.xml', dist), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
} finally {
  await server.close();
}

await cp(new URL('public/', siteDir), dist, { recursive: true });
for (const icon of ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png']) {
  await cp(new URL(`public/${icon}`, root), new URL(icon, dist));
}
console.log(`Website written: ${snapshot.cars.length} cars, ${Object.keys(photos).length} photos${failed.length ? `, ${failed.length} left out` : ''}`);
