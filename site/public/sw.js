// The app moved from /workshop-tracker/ to /workshop-tracker/app/ (11.10.2026). Phones that installed the old
// version still have its service worker here, at the site root. When they check it for an update they get this one:
// it deletes the old offline copy, removes itself and reloads open app windows at the new address.
// The new app has its own service worker in /app/; the website itself has none.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const scope = self.registration.scope; // https://…/workshop-tracker/
      await self.clients.claim();
      // workbox names its cache after the scope; the new app's cache ends in /app/ and is left alone
      for (const name of await caches.keys()) {
        if (name.endsWith(`-${scope}`)) await caches.delete(name);
      }
      const windows = await self.clients.matchAll({ type: 'window' });
      await self.registration.unregister();
      for (const client of windows) {
        const from = new URL(client.url);
        if (/\.html$/.test(from.pathname)) continue; // privacy / terms pages
        const to = new URL('app/', scope);
        to.hash = from.hash;
        // a change in the hash alone would not reload the page
        if (to.pathname === from.pathname) to.search = '?moved';
        await client.navigate(to.href).catch(() => {});
      }
    })(),
  );
});
