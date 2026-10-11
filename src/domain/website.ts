// The public website (docs/PLAN.md §10): page addresses, default titles, contact numbers.

const LETTERS: Record<string, string> = { đ: 'd', ð: 'd', ø: 'o', ł: 'l', ß: 'ss', æ: 'ae', œ: 'oe', þ: 'th' };

/** "Škoda Octavia 1.9 TDI (2004)" → "skoda-octavia-1-9-tdi-2004": the name in a page's address. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[đðøłßæœþ]/g, (c) => LETTERS[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/, '');
}

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The first of slug, slug-2, slug-3 … that no other page uses. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const start = base || 'auto';
  if (!used.has(start)) return start;
  for (let n = 2; ; n++) {
    const candidate = `${start}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

export interface CarNameParts {
  make: string | null;
  model: string | null;
  generation?: string | null;
  engine?: string | null;
}

/** "BMW 3 Series E46 330d": the title a car or job gets on the website until someone changes it. */
export function defaultWebsiteTitle({ make, model, generation, engine }: CarNameParts): string {
  return [make, model, generation, engine]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 100);
}

export const PHONE_PATTERN = /^\+[0-9][0-9 ]{6,24}$/;

/** What people type ("00385 91/234-5678") → "+385 91 234 5678"; a number without the country code stays as typed. */
export function cleanPhone(input: string): string {
  const trimmed = input.trim().replace(/^00/, '+');
  return trimmed
    .replace(/[^\d+ ]+/g, ' ')
    .replace(/(?!^)\+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Digits only, for wa.me and tel: links ("+385 91 234 5678" → "385912345678"). */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** "08:00:00" (how Postgres returns a time) → "08:00". */
export function shortTime(time: string | null): string {
  return time ? time.slice(0, 5) : '';
}

export type BeforeAfter = 'before' | 'after';

/** The "Before" / "After" albums (also in Croatian): their photos are labelled and come first when picking a before/after pair. */
export function albumSide(albumName: string | null | undefined): BeforeAfter | null {
  const name = albumName?.trim().toLowerCase();
  if (name === 'before' || name === 'prije') return 'before';
  if (name === 'after' || name === 'poslije') return 'after';
  return null;
}
