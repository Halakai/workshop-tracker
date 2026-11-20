// Customer keys (docs/PLAN.md §11): kinds, how long they work, and what a website key shows.

export type KeyKind = 'job' | 'buyer' | 'owner' | 'website';

export const KEY_KIND_LABEL: Record<KeyKind, string> = {
  job: 'Customer',
  buyer: 'For a buyer',
  owner: 'For the owner',
  website: 'Website',
};

/** The parts of the website a website key can show. */
export const WEBSITE_SECTIONS = [
  { value: 'for_sale', label: 'For sale' },
  { value: 'work', label: 'Our work' },
  { value: 'services', label: 'Services' },
  { value: 'about', label: 'About us' },
  { value: 'reviews', label: 'Reviews' },
  { value: 'contact', label: 'Contact & hours' },
] as const;
export type WebsiteSection = (typeof WEBSITE_SECTIONS)[number]['value'];

export interface KeyShows {
  sections: WebsiteSection[];
  cars: 'all' | 'chosen';
  car_ids: string[];
  prices: boolean;
}

export const SHOW_EVERYTHING: KeyShows = { sections: WEBSITE_SECTIONS.map((s) => s.value), cars: 'all', car_ids: [], prices: true };

/** What the database keeps for a website key (it cleans it up too), read safely. */
export function readShows(value: unknown): KeyShows {
  const v = (value ?? {}) as Partial<KeyShows>;
  const known = new Set<string>(WEBSITE_SECTIONS.map((s) => s.value));
  return {
    sections: Array.isArray(v.sections) ? (v.sections.filter((s) => known.has(s)) as WebsiteSection[]) : SHOW_EVERYTHING.sections,
    cars: v.cars === 'chosen' ? 'chosen' : 'all',
    car_ids: Array.isArray(v.car_ids) ? v.car_ids.filter((id): id is string => typeof id === 'string') : [],
    prices: v.prices !== false,
  };
}

/** How long a key works, as picked when making or changing it. */
export type Lasts = 'forever' | '7' | '30' | '90' | 'date';

export const LASTS_OPTIONS: { value: Lasts; label: string }[] = [
  { value: 'forever', label: 'Until I switch it off' },
  { value: '7', label: '1 week' },
  { value: '30', label: '1 month' },
  { value: '90', label: '3 months' },
  { value: 'date', label: 'Until a date…' },
];

/** The end of a day ("2026-12-24" → the moment 25.12. starts, local time): a key works all of its last day. */
export function endOfDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d + 1).toISOString();
}

/** null = until switched off */
export function expiresAt(lasts: Lasts, date: string, now: Date = new Date()): string | null {
  if (lasts === 'forever') return null;
  if (lasts === 'date') return date ? endOfDay(date) : null;
  return new Date(now.getTime() + Number(lasts) * 86_400_000).toISOString();
}

/** The last day a key works ("2026-12-24"), for showing and editing; the day before its end moment. */
export function lastDay(expires: string): string {
  const end = new Date(new Date(expires).getTime() - 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
}

export type KeyState = 'working' | 'expired' | 'off';

export function keyState(key: { switched_off_at: string | null; expires_at: string | null }, now: Date = new Date()): KeyState {
  if (key.switched_off_at) return 'off';
  if (key.expires_at && new Date(key.expires_at) <= now) return 'expired';
  return 'working';
}

/** The message "Send to the customer" shares (Croatian: the customers' language). */
export function shareMessage(kind: KeyKind, link: string, code: string): string {
  const lead = {
    job: 'Pozdrav! Ovdje možete pratiti posao na svom autu:',
    buyer: 'Pozdrav! Ovdje su fotografije i detalji auta:',
    owner: 'Pozdrav! Ovdje je sve što smo napravili na vašem autu:',
    website: 'Pozdrav! Ovdje možete pogledati naše radove:',
  }[kind];
  return `${lead} ${link}\nKod: ${code}`;
}
