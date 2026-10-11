// Builds the public website into dist/, next to the app (dist/app, which `vite build` makes first).
// For now (W1, docs/PLAN.md §10) that is a placeholder home page in Croatian and English; the real website follows.
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';

const base = process.env.BASE_PATH || '/';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);

const TEXT = {
  hr: {
    lang: 'hr',
    title: 'Web stranica uskoro',
    lead: 'Uskoro ovdje: auti koje smo napravili, auti na prodaju i kako nas kontaktirati.',
    login: 'Prijava',
    other: { href: `${base}en/`, label: 'EN' },
  },
  en: {
    lang: 'en',
    title: 'Website coming soon',
    lead: 'Coming soon: the cars we have worked on, cars for sale and how to reach us.',
    login: 'Log in',
    other: { href: base, label: 'HR' },
  },
};

// Old links (…/#/cars/…) and the phone app installed before the move (it starts here) go to the app.
const FORWARD_TO_APP = `<script>
      (function () {
        var hash = location.hash.indexOf('#/') === 0 ? location.hash : '';
        var installed = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
        if (hash || installed) location.replace('${base}app/' + hash);
      })();
    </script>`;

const STYLE = `<style>
      :root { color-scheme: dark; --bg: #0c0f14; --fg: #f1f3f5; --muted: #9aa3ad; --accent: #e8590c; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100dvh; display: flex; flex-direction: column; background: var(--bg); color: var(--fg);
        font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; }
      header, footer { display: flex; justify-content: space-between; align-items: center; padding: 16px; }
      header a, footer a { color: var(--muted); text-decoration: none; font-size: 14px; }
      main { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 24px 16px; }
      main img { width: 72px; height: 72px; margin-bottom: 24px; }
      h1 { font-size: clamp(28px, 7vw, 44px); line-height: 1.15; margin: 0 0 12px; }
      p { color: var(--muted); max-width: 32rem; margin: 0; }
      a:hover { color: var(--accent); }
    </style>`;

function page(t, { forward = false } = {}) {
  return `<!doctype html>
<html lang="${t.lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#0c0f14" />
    <title>${t.title}</title>
    <link rel="icon" href="${base}favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="${base}apple-touch-icon-180x180.png" />
    ${forward ? FORWARD_TO_APP : ''}
    ${STYLE}
  </head>
  <body>
    <header><span></span><a href="${t.other.href}" hreflang="${t.other.label.toLowerCase()}">${t.other.label}</a></header>
    <main>
      <img src="${base}favicon.svg" alt="" />
      <h1>${t.title}</h1>
      <p>${t.lead}</p>
    </main>
    <footer><span></span><a href="${base}app/">${t.login}</a></footer>
  </body>
</html>
`;
}

function notFound() {
  return `<!doctype html>
<html lang="hr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>Stranica nije pronađena · Page not found</title>
    <link rel="icon" href="${base}favicon.svg" type="image/svg+xml" />
    ${STYLE}
  </head>
  <body>
    <main>
      <h1>Stranica nije pronađena</h1>
      <p>Page not found</p>
      <p style="margin-top: 24px"><a href="${base}" style="color: var(--accent)">Početna · Home</a></p>
    </main>
  </body>
</html>
`;
}

await mkdir(dist, { recursive: true });
// clear what earlier builds left at the top level, but keep the app that `vite build` just made
for (const name of await readdir(dist)) {
  if (name !== 'app') await rm(new URL(name, dist), { recursive: true, force: true });
}
await cp(new URL('site/public/', root), dist, { recursive: true });
for (const icon of ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png']) {
  await cp(new URL(`public/${icon}`, root), new URL(icon, dist));
}
await writeFile(new URL('index.html', dist), page(TEXT.hr, { forward: true }));
await mkdir(new URL('en/', dist), { recursive: true });
await writeFile(new URL('en/index.html', dist), page(TEXT.en));
await writeFile(new URL('404.html', dist), notFound());
console.log(`Website written to dist/ (base ${base})`);
