import { describe, expect, it } from 'vitest';
import { renderKeyPage, type JobKeyView } from './customer';
import type { BuildContext } from './types';

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
