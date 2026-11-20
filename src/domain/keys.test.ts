import { describe, expect, it } from 'vitest';
import { SHOW_EVERYTHING, endOfDay, expiresAt, keyState, lastDay, readShows, shareMessage } from './keys';

describe('how long a key works', () => {
  const now = new Date(2026, 10, 20, 15, 30);

  it('until switched off, for a number of days, or through a chosen day', () => {
    expect(expiresAt('forever', '', now)).toBeNull();
    expect(new Date(expiresAt('7', '', now)!).getTime() - now.getTime()).toBe(7 * 86_400_000);
    expect(expiresAt('date', '2026-12-24', now)).toBe(new Date(2026, 11, 25).toISOString());
    expect(expiresAt('date', '', now)).toBeNull();
  });

  it('the last day it works, back from the end moment', () => {
    expect(lastDay(endOfDay('2026-12-24'))).toBe('2026-12-24');
    expect(lastDay(endOfDay('2026-12-31'))).toBe('2026-12-31');
  });

  it('working, expired or switched off', () => {
    expect(keyState({ switched_off_at: null, expires_at: null }, now)).toBe('working');
    expect(keyState({ switched_off_at: null, expires_at: new Date(2026, 10, 21).toISOString() }, now)).toBe('working');
    expect(keyState({ switched_off_at: null, expires_at: new Date(2026, 10, 19).toISOString() }, now)).toBe('expired');
    expect(keyState({ switched_off_at: '2026-11-01T00:00:00Z', expires_at: null }, now)).toBe('off');
  });
});

describe('what a website key shows', () => {
  it('reads what the database keeps, with safe defaults', () => {
    expect(readShows(null)).toEqual(SHOW_EVERYTHING);
    expect(readShows({ sections: ['for_sale', 'nonsense'], cars: 'chosen', car_ids: ['a', 1], prices: false })).toEqual({
      sections: ['for_sale'],
      cars: 'chosen',
      car_ids: ['a'],
      prices: false,
    });
  });
});

describe('the message sent with a key', () => {
  it('fits the kind of key and holds the link and the code', () => {
    const m = shareMessage('buyer', 'https://x/?k=K7M4-QX9P', 'K7M4-QX9P');
    expect(m).toContain('detalji auta');
    expect(m).toContain('https://x/?k=K7M4-QX9P');
    expect(m).toContain('Kod: K7M4-QX9P');
  });
});
