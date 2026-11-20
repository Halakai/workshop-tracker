import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderKeyPages, type CarKeyView, type JobKeyView, type KeyView, type WebsiteKeyView } from './customer';
import type { BuildContext, Snapshot } from './types';
import { formatPrice } from './format';

const view: JobKeyView = {
  kind: 'job',
  code: 'K7M4QX9P',
  workshop: { name: 'Radionica Primjer', address: 'Ulica 1, Zagreb', phone: null, email: null, logo: null },
  contacts: [{ name: 'David', phone: '+385910000001', call: true, whatsapp: true, viber: false }],
  job: {
    ref: 'J-012',
    description: 'Nove kočione pločice.\n\nI provjera ovjesa.',
    status: 'done',
    received_on: '2026-11-12',
    done_on: '2026-11-18',
    car_make: 'VW',
    car_model: 'Golf',
    car_plate: 'ZG-123-AB',
    labor_cents: 4000,
    invoice_number: '2026-007',
    invoice_date: '2026-11-18',
    has_invoice: true,
    lines: [
      { description: 'Kočione pločice', qty: 1, unit: null, price_cents: 5678 },
      { description: 'Ulje', qty: 4.5, unit: 'L', price_cents: 4500 },
    ],
    payments: [{ date: '2026-11-18', amount_cents: 10000 }],
  },
  photos: [
    { id: 'p1', favorite: false },
    { id: 'p2', favorite: true },
    { id: 'gone', favorite: false },
  ],
};

const photo = (id: string) => ({ width: 1600, height: 1200, src: `/f/${id}`, srcset: `/f/${id} 1600w`, full: `/f/${id}-full`, share: `/f/${id}` });
const ctx: BuildContext = {
  base: '#/k/K7M4QX9P/',
  root: '/workshop-tracker/',
  origin: 'https://halakai.github.io',
  logo: '/logo.svg',
  photos: { p1: photo('p1'), p2: photo('p2') },
  team: false,
  appHref: './',
};

/** One page of a key: Croatian or English home, or another path (a website key's car page). */
function renderKeyPage(v: KeyView, c: BuildContext, lang: 'hr' | 'en' | string, invoiceUrl: string | null): string {
  const path = lang === 'hr' ? 'index.html' : lang === 'en' ? 'en/index.html' : lang;
  const found = renderKeyPages(v, c, invoiceUrl).find((p) => p.path === path);
  if (!found) throw new Error(`no page ${path}`);
  return found.html;
}

describe('a customer’s job page', () => {
  const hr = renderKeyPage(view, ctx, 'hr', 'https://x/invoice?sig=1');

  it('shows the work at the customer’s prices, labor and the total', () => {
    expect(hr).toContain('Kočione pločice');
    expect(hr).toContain('56.78€');
    expect(hr).toContain('4.5 L');
    expect(hr).toContain('40.00€');
    // 56.78 + 45.00 + 40.00
    expect(hr).toContain('141.78€');
  });

  it('shows what is paid and what is still to pay', () => {
    expect(hr).toContain('100.00€');
    expect(hr).toContain('Preostalo za platiti');
    expect(hr).toContain('41.78€');
    const allPaid = renderKeyPage({ ...view, job: { ...view.job, payments: [{ date: '2026-11-18', amount_cents: 14178 }] } }, ctx, 'hr', null);
    expect(allPaid).toContain('Sve je plaćeno');
    expect(allPaid).not.toContain('Preostalo za platiti');
  });

  it('the invoice button only with an invoice link', () => {
    expect(hr).toContain('href="https://x/invoice?sig=1"');
    expect(hr).toContain('2026-007');
    expect(renderKeyPage(view, ctx, 'hr', null)).not.toContain('Preuzmi račun');
  });

  it('photos: the favorite first; ones without a link are left out', () => {
    expect(hr.indexOf('/f/p2')).toBeLessThan(hr.indexOf('/f/p1'));
    expect(hr).not.toContain('gone');
  });

  it('the language switch stays on the key’s page; English texts', () => {
    expect(hr).toContain('href="#/k/K7M4QX9P/en/"');
    const en = renderKeyPage(view, ctx, 'en', null);
    expect(en).toContain('<html lang="en"');
    expect(en).toContain('Work and prices');
    expect(en).toContain('href="#/k/K7M4QX9P/"');
  });

  it('the WhatsApp button names the job; the team sees a note that this is the customer’s view', () => {
    expect(hr).toContain(encodeURIComponent('posao J-012'));
    expect(hr).not.toContain('Ovako klijent vidi');
    expect(renderKeyPage(view, { ...ctx, team: true }, 'hr', null)).toContain('Ovako klijent vidi svoju stranicu.');
  });

  it('escapes whatever was typed in the app', () => {
    const evil = renderKeyPage({ ...view, job: { ...view.job, description: '<img src=x onerror=alert(1)>' } }, ctx, 'hr', null);
    expect(evil).not.toContain('<img src=x');
  });
});

const sample: Snapshot = JSON.parse(readFileSync(new URL('../fixtures/snapshot.json', import.meta.url), 'utf8'));
const bmw = sample.cars.find((c) => c.slug === 'bmw-3-series-e46-330d-2003')!;
const golf = sample.cars.find((c) => c.slug === 'vw-golf-ii-gti-1989')!;
const allPhotos = Object.fromEntries(
  [...sample.site_photos, ...sample.cars.flatMap((c) => [...c.photos, ...c.pairs.flatMap((p) => [{ id: p.before }, { id: p.after }])])].map((p) => [p.id, photo(p.id)]),
);
const carCtx: BuildContext = { ...ctx, photos: allPhotos };

describe('a car key', () => {
  const buyer: CarKeyView = { kind: 'buyer', code: 'B2345678', workshop: sample.workshop, contacts: sample.contacts, car: { ...bmw, plate: null }, parts: [] };

  it('for a buyer: the car’s page with the asking price, on the key’s own address, without links to the website', () => {
    const page = renderKeyPage(buyer, carCtx, 'hr', null);
    expect(page).toContain('BMW 3 Series E46 330d');
    expect(page).toContain(formatPrice(650000));
    expect(page).toContain('href="#/k/K7M4QX9P/en/"');
    expect(page).not.toContain('#radovi');
    expect(page).not.toContain('auti/');
    expect(page).toContain(encodeURIComponent('Zanima me BMW 3 Series E46 330d.'));
  });

  it('after the sale the buyer sees "sold" and no price', () => {
    const page = renderKeyPage({ ...buyer, car: { ...buyer.car, status: 'sold', price_cents: null } }, carCtx, 'hr', null);
    expect(page).toContain('Prodano');
    expect(page).not.toContain(formatPrice(650000));
  });

  it('for the owner: plate, what we did and the parts fitted with dates, no prices', () => {
    const owner: CarKeyView = {
      kind: 'owner',
      code: 'O2345678',
      workshop: sample.workshop,
      contacts: sample.contacts,
      car: { ...golf, plate: 'ZG-123-AB', price_cents: null },
      parts: [
        { date: '2026-10-02', description: 'Kvačilo', qty: null, unit: null },
        { date: '2026-10-05', description: 'Ulje', qty: 4.5, unit: 'L' },
      ],
    };
    const page = renderKeyPage(owner, carCtx, 'hr', null);
    expect(page).toContain('Vaš auto');
    expect(page).toContain('ZG-123-AB');
    expect(page).toContain('Ugrađeni dijelovi');
    expect(page).toContain('Kvačilo');
    expect(page).toContain('4.5 L');
    expect(page).toContain('02.10.2026');
    expect(page).not.toContain('€');
    expect(renderKeyPage(owner, carCtx, 'en', null)).toContain('Parts fitted');
  });
});

describe('a website key', () => {
  const view: WebsiteKeyView = { ...sample, kind: 'website', code: 'W2345678', hidden: ['services', 'contact'] };

  it('is the website on the key’s address, with car pages under it', () => {
    const home = renderKeyPage(view, carCtx, 'hr', null);
    expect(home).toContain('href="#/k/K7M4QX9P/auti/vw-golf-ii-gti-1989/"');
    expect(renderKeyPage(view, carCtx, 'auti/vw-golf-ii-gti-1989/index.html', null)).toContain('VW Golf II GTI');
  });

  it('leaves out the sections the key hides', () => {
    const home = renderKeyPage(view, carCtx, 'hr', null);
    expect(home).not.toContain('id="kontakt"');
    expect(home).not.toContain('href="#kontakt"');
    expect(home).toContain('id="radovi"');
  });

  it('the team sees that it is a key’s view, not their own website', () => {
    const home = renderKeyPage(view, { ...carCtx, team: true }, 'hr', null);
    expect(home).toContain('Ovako klijent vidi svoju stranicu.');
    expect(home).not.toContain('Ovu stranicu vidi samo ekipa.');
  });
});
