import { describe, expect, it } from 'vitest';
import { compact, fold, scoreDoc, search, type SearchDoc } from './search';

const doc = (key: string, title: string, codes: string[] = [], text: string[] = []): SearchDoc => ({ key, title, codes, text });

const golf = doc('car:1', '2004 Volkswagen Golf', ['CAR-001', 'ZG 123-AB', 'WVWZZZ1JZ4W000001'], ['1.9 TDI 77 kW', 'Bought from Marko']);
const octavia = doc('car:2', '2012 Škoda Octavia', ['CAR-002', 'ST 456-CD'], ['Diesel']);
const oil = doc('item:1', 'Ulje 5w30', ['CON-CAST-001'], ['Castrol', 'Shelf A']);
const marko = doc('contact:1', 'Marko Đurić', [], ['091 234 5678']);
const docs = [golf, octavia, oil, marko];

describe('fold / compact', () => {
  it('drops case and accents', () => {
    expect(fold('Škoda Đurđevac ČĆŽ')).toBe('skoda durdevac ccz');
  });
  it('drops spaces and dashes for codes', () => {
    expect(compact('ZG 123-AB')).toBe('zg123ab');
  });
});

describe('search', () => {
  it('finds by name ignoring accents and case', () => {
    expect(search('skoda', docs)).toEqual([octavia]);
    expect(search('duric', docs)).toEqual([marko]);
  });

  it('finds plates and IDs typed without spaces or dashes', () => {
    expect(search('zg123ab', docs)).toEqual([golf]);
    expect(search('car 002', docs)).toEqual([octavia]);
    expect(search('cast-001', docs)).toEqual([oil]);
  });

  it('needs every word to match somewhere', () => {
    expect(search('golf tdi', docs)).toEqual([golf]);
    expect(search('golf petrol', docs)).toEqual([]);
  });

  it('finds words in the other text', () => {
    expect(search('castrol', docs)).toEqual([oil]);
    expect(search('091', docs)).toEqual([marko]);
  });

  it('puts an exact code before a title match', () => {
    const named = doc('item:2', 'Car-001 sticker');
    expect(search('CAR-001', [named, golf])).toEqual([golf, named]);
  });

  it('keeps the original order for equal scores', () => {
    const a = doc('a', 'Brake pads front');
    const b = doc('b', 'Brake pads rear');
    expect(search('brake', [a, b])).toEqual([a, b]);
    expect(search('brake', [b, a])).toEqual([b, a]);
  });

  it('returns nothing for an empty query', () => {
    expect(search('  ', docs)).toEqual([]);
    expect(scoreDoc('', golf)).toBe(0);
  });

  it('respects the limit', () => {
    expect(search('o', docs, 2)).toHaveLength(2);
  });
});
