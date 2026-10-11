import { describe, expect, it } from 'vitest';
import { albumSide, cleanPhone, defaultWebsiteTitle, PHONE_PATTERN, phoneDigits, shortTime, slugify, SLUG_PATTERN, uniqueSlug } from './website';

describe('slugify', () => {
  it('makes a lowercase address name without accents', () => {
    expect(slugify('Škoda Octavia 1.9 TDI (2004)')).toBe('skoda-octavia-1-9-tdi-2004');
    expect(slugify('Citroën Đ-tip ČĆŽŠ')).toBe('citroen-d-tip-cczs');
    expect(slugify('  BMW   E46 / 330d  ')).toBe('bmw-e46-330d');
    expect(slugify('Ølsen Straße')).toBe('olsen-strasse');
  });

  it('always matches what the database accepts, or is empty', () => {
    for (const text of ['---', 'A', 'Golf IV — 1.9 TDI!', 'x'.repeat(200), '日本']) {
      const slug = slugify(text);
      expect(slug === '' || SLUG_PATTERN.test(slug)).toBe(true);
      expect(slug.length).toBeLessThanOrEqual(72);
    }
  });
});

describe('uniqueSlug', () => {
  it('adds a number when the name is taken', () => {
    expect(uniqueSlug('golf', [])).toBe('golf');
    expect(uniqueSlug('golf', ['golf', 'golf-2'])).toBe('golf-3');
    expect(uniqueSlug('', [])).toBe('auto');
  });
});

describe('defaultWebsiteTitle', () => {
  it('joins make, model, generation and engine', () => {
    expect(defaultWebsiteTitle({ make: 'BMW', model: '3 Series', generation: 'E46', engine: '330d' })).toBe('BMW 3 Series E46 330d');
    expect(defaultWebsiteTitle({ make: 'VW', model: 'Golf', generation: null, engine: ' ' })).toBe('VW Golf');
  });
});

describe('phone numbers', () => {
  it('tidies what people type', () => {
    expect(cleanPhone('00385 91/234-5678')).toBe('+385 91 234 5678');
    expect(cleanPhone(' +385 (91) 234 5678 ')).toBe('+385 91 234 5678');
    expect(cleanPhone('091 234 5678')).toBe('091 234 5678');
  });

  it('needs the country code', () => {
    expect(PHONE_PATTERN.test('+385 91 234 5678')).toBe(true);
    expect(PHONE_PATTERN.test('091 234 5678')).toBe(false);
    expect(phoneDigits('+385 91 234 5678')).toBe('385912345678');
  });
});

describe('shortTime', () => {
  it('drops the seconds', () => {
    expect(shortTime('08:00:00')).toBe('08:00');
    expect(shortTime(null)).toBe('');
  });
});

describe('before / after', () => {
  it('knows the Before and After albums, also in Croatian', () => {
    expect(albumSide('Before')).toBe('before');
    expect(albumSide(' poslije ')).toBe('after');
    expect(albumSide('Engine')).toBeNull();
    expect(albumSide(null)).toBeNull();
  });
});
