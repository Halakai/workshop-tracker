// The top level of the GitHub Pages site, next to the app (dist/app, which `vite build` makes first).
// Since 21.11.2026 nothing is public (docs/PLAN.md §11): the website is shown inside the app (view.html) and this
// level only forwards there.
//
//   /                → /app/                      (login, or straight in when signed in)
//   /#/cars/…        → /app/#/cars/…              (links from before the app moved to /app/)
//   /?k=CODE         → /app/view.html#/k/CODE      (the link given to a customer, docs/PLAN.md §11 K2)
//   anything else    → /app/                      (404.html: the old website's pages)
//
// robots.txt asks search engines to forget the old website. sw.js (site/public) stays: it retires the service worker
// that phones installed before the app moved to /app/.
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';

const base = process.env.BASE_PATH || '/';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const app = `${base}app/`;

const forward = (comment) => `<!doctype html>
<html lang="hr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <meta name="theme-color" content="#0c0f14" />
    <title>Workshop</title>
    <!-- ${comment} -->
    <script>
      (function () {
        var app = ${JSON.stringify(app)};
        var key = new URLSearchParams(location.search).get('k');
        var hash = location.hash.indexOf('#/') === 0 ? location.hash : '';
        location.replace(key ? app + 'view.html#/k/' + encodeURIComponent(key) : app + hash);
      })();
    </script>
    <noscript><meta http-equiv="refresh" content="0;url=${app}" /></noscript>
  </head>
  <body style="background:#0c0f14;color:#f1f3f5;font-family:system-ui,sans-serif;text-align:center;padding:3rem">
    <a href="${app}" style="color:#e8590c">Prijava · Log in</a>
  </body>
</html>
`;

await mkdir(dist, { recursive: true });
// clear what earlier builds left at the top level (the old website's pages), keep the app `vite build` just made
for (const name of await readdir(dist)) {
  if (name !== 'app') await rm(new URL(name, dist), { recursive: true, force: true });
}

await writeFile(new URL('index.html', dist), forward('Everything is behind the login now: forward to the app.'));
await writeFile(new URL('404.html', dist), forward('An old website address: forward to the app.'));
await writeFile(new URL('robots.txt', dist), 'User-agent: *\nDisallow: /\n');
await cp(new URL('site/public/', root), dist, { recursive: true });
for (const icon of ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png']) {
  await cp(new URL(`public/${icon}`, root), new URL(icon, dist));
}
console.log(`Top level written: forwards to ${app}`);
