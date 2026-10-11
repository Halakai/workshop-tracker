import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderSite, sitemapPaths } from './render';
import type { BuildContext, PhotoFiles, Snapshot } from './types';

const sample: Snapshot = JSON.parse(readFileSync(new URL('../fixtures/snapshot.json', import.meta.url), 'utf8'));
const photo = (id: string): PhotoFiles => ({ width: 1600, height: 1200, src: `/f/${id}.webp`, srcset: `/f/${id}.webp 1600w`, full: `/f/${id}.webp`, share: `/f/${id}.jpg` });
const ids = [...sample.site_photos, ...sample.cars.flatMap((c) => c.photos)].map((p) => p.id);
const ctx: BuildContext = {
  base: '/workshop-tracker/',
  origin: 'https://halakai.github.io',
  css: ['/workshop-tracker/s/site.css'],
  js: '/workshop-tracker/s/site.js',
  logo: '/workshop-tracker/favicon.svg',
  photos: Object.fromEntries(ids.map((id) => [id, photo(id)])),
  preview: false,
};

function page(pages: { path: string; html: string }[], path: string) {
  const found = pages.find((p) => p.path === path);
  if (!found) throw new Error(`no page ${path}`);
  return found.html;
}

describe('renderSite', () => {
  const pages = renderSite(sample, ctx);

  it('makes a home page and a page per car in both languages, and a 404', () => {
    expect(pages.map((p) => p.path).sort()).toEqual(
      [
        '404.html',
        'index.html',
        'en/index.html',
        ...sample.cars.flatMap((c) => [`auti/${c.slug}/index.html`, `en/cars/${c.slug}/index.html`]),
      ].sort(),
    );
    expect(sitemapPaths(sample, ctx.base)).toContain('/workshop-tracker/en/cars/vw-golf-ii-gti-1989/');
  });

  it('cars for sale are under "Na prodaju" with their price, the others under "Naši radovi"', () => {
    const home = page(pages, 'index.html');
    const forSale = home.slice(home.indexOf('id="prodaja"'), home.indexOf('id="radovi"'));
    expect(forSale).toContain('BMW 3 Series E46 330d');
    expect(forSale).toContain('6 500 €');
    expect(forSale).not.toContain('Golf');
    expect(home.slice(home.indexOf('id="radovi"'))).toContain('Prodano');
  });

  it('English pages fall back to the Croatian text, link both ways and say which language they are', () => {
    const en = page(pages, 'en/cars/vw-golf-ii-gti-1989/index.html');
    expect(en).toContain('<html lang="en"');
    expect(en).toContain('Vlasnik je donio Golf'); // no English story typed
    expect(en).toContain('href="https://halakai.github.io/workshop-tracker/auti/vw-golf-ii-gti-1989/"');
    expect(en).toContain('Before and after');
  });

  it('escapes whatever is typed in the app, also inside the structured data', () => {
    const evil: Snapshot = {
      ...sample,
      workshop: { ...sample.workshop, name: '</script><script>alert(1)</script>' },
      cars: [{ ...sample.cars[0], title_hr: '<img src=x onerror=alert(1)>' }],
    };
    const html = renderSite(evil, ctx)
      .map((p) => p.html)
      .join('\n');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('makes a before/after slider for each pair from the Before and After albums', () => {
    const golf = page(pages, 'auti/vw-golf-ii-gti-1989/index.html');
    const marker = 'data-pair="true"';
    expect(golf.split(marker)).toHaveLength(3);
    expect(golf).toContain('1 / 2');
    // the 1st Before photo with the 1st After photo
    const first = golf.slice(golf.indexOf(marker), golf.indexOf(marker, golf.indexOf(marker) + 1));
    expect(first).toContain('/f/golf-before.webp');
    expect(first).toContain('/f/golf-after.webp');
    // no albums: no slider
    expect(page(pages, 'auti/bmw-3-series-e46-330d-2003/index.html')).not.toContain('data-pairs');
  });

  it('pages built from sample data are not indexed', () => {
    expect(page(renderSite(sample, { ...ctx, preview: true }), 'index.html')).toContain('<meta name="robots" content="noindex"/>');
    expect(page(pages, 'index.html')).not.toContain('noindex');
  });

  it('the WhatsApp button on a car for sale names the car', () => {
    const bmw = page(pages, 'auti/bmw-3-series-e46-330d-2003/index.html');
    expect(bmw).toContain(
      `https://wa.me/385910000001?text=${encodeURIComponent('Pozdrav! Zanima me BMW 3 Series E46 330d: https://halakai.github.io/workshop-tracker/auti/bmw-3-series-e46-330d-2003/')}`,
    );
    expect(bmw).toContain('"@type":"Car"');
  });
});
