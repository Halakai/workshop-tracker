import { describe, expect, it } from 'vitest';
import { T, pick } from './i18n';
import { clip, formatKm, formatPrice, groupHours, mainContacts, mapLink, paragraphs, specLine, telLink, viberLink, whatsappLink } from './format';
import type { SiteCar, Snapshot } from './types';

const NBSP = ' ';

describe('numbers', () => {
  it('prices in whole euros, mileage in km, with spaces between thousands', () => {
    expect(formatPrice(650000)).toBe(`6${NBSP}500${NBSP}€`);
    expect(formatPrice(99_900)).toBe(`999${NBSP}€`);
    expect(formatKm(214500)).toBe(`214${NBSP}500${NBSP}km`);
  });
});

describe('contact links', () => {
  it('builds call, WhatsApp and Viber links from an international number', () => {
    expect(telLink('+385 91 234 5678')).toBe('tel:+385912345678');
    expect(whatsappLink('+385 91 234 5678', 'Pozdrav! Zanima me BMW')).toBe('https://wa.me/385912345678?text=Pozdrav!%20Zanima%20me%20BMW');
    expect(viberLink('+385 91 234 5678')).toBe('viber://chat?number=%2B385912345678');
  });

  it('the first number with each button goes to the top of the page and the bar on phones', () => {
    const david = { name: 'David', phone: '+385 91', call: true, whatsapp: false, viber: false };
    const ivan = { name: 'Ivan', phone: '+385 98', call: true, whatsapp: true, viber: false };
    expect(mainContacts([david, ivan])).toEqual({ call: david, whatsapp: ivan, viber: null });
  });

  it('opens the map link, or searches for the address', () => {
    const s = { site: { map_url: null }, workshop: { address: 'Ulica 1, Zagreb' } } as unknown as Snapshot;
    expect(mapLink(s)).toBe('https://www.google.com/maps/search/?api=1&query=Ulica%201%2C%20Zagreb');
    expect(mapLink({ ...s, workshop: { ...s.workshop, address: null } })).toBeNull();
  });
});

describe('opening hours', () => {
  it('joins following days with the same hours', () => {
    const hours = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ weekday: d, opens: d <= 5 ? '08:00' : d === 6 ? '09:00' : null, closes: d <= 5 ? '16:00' : d === 6 ? '13:00' : null }));
    expect(groupHours(hours, T.hr.days)).toEqual([
      { days: 'Ponedjeljak – Petak', weekdays: [1, 2, 3, 4, 5], time: '08:00–16:00' },
      { days: 'Subota', weekdays: [6], time: '09:00–13:00' },
      { days: 'Nedjelja', weekdays: [7], time: null },
    ]);
  });
});

describe('texts', () => {
  it('English falls back to Croatian', () => {
    expect(pick('en', 'Mehanika', null)).toBe('Mehanika');
    expect(pick('en', 'Mehanika', '  ')).toBe('Mehanika');
    expect(pick('en', 'Mehanika', 'Mechanics')).toBe('Mechanics');
    expect(pick('hr', 'Mehanika', 'Mechanics')).toBe('Mehanika');
  });

  it('splits typed text into paragraphs and lines', () => {
    expect(paragraphs('Prvi red\r\ndrugi red\n\n\nNovi odlomak\n')).toEqual([['Prvi red', 'drugi red'], ['Novi odlomak']]);
    expect(paragraphs(null)).toEqual([]);
  });

  it('shortens descriptions at a word', () => {
    expect(clip('kratko')).toBe('kratko');
    const long = clip('riječ '.repeat(60), 40);
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long.endsWith('…')).toBe(true);
  });

  it('a card shows year, mileage and fuel in the page language', () => {
    const car = { year: 2003, mileage_km: 214500, fuel: 'Diesel' } as SiteCar;
    expect(specLine(car, T.hr.fuels)).toBe(`2003 · 214${NBSP}500${NBSP}km · Dizel`);
    expect(specLine(car, T.en.fuels)).toBe(`2003 · 214${NBSP}500${NBSP}km · Diesel`);
    expect(specLine({ year: null, mileage_km: null, fuel: null } as SiteCar, T.hr.fuels)).toBe('');
  });
});
