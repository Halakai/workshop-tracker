// Small pure helpers for the website (unit-tested in format.test.ts).
import type { Lang } from './i18n';
import type { SiteCar, SiteContact, Snapshot } from './types';

const NBSP = ' ';

function groupThousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 650000 cents → "6 500 €" (whole euros; prices on the website are round). */
export function formatPrice(cents: number): string {
  return `${groupThousands(cents / 100)}${NBSP}€`;
}

export function formatKm(km: number): string {
  return `${groupThousands(km)}${NBSP}km`;
}

export function digits(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function telLink(phone: string): string {
  return `tel:+${digits(phone)}`;
}

export function whatsappLink(phone: string, text?: string): string {
  return `https://wa.me/${digits(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function viberLink(phone: string): string {
  return `viber://chat?number=%2B${digits(phone)}`;
}

export function mapLink(snapshot: Snapshot): string | null {
  if (snapshot.site.map_url) return snapshot.site.map_url;
  const address = snapshot.workshop.address?.trim();
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null;
}

/** The buttons in the top part of the page and the bar at the bottom of a phone: the first number to call and to message. */
export function mainContacts(contacts: SiteContact[]): { call: SiteContact | null; whatsapp: SiteContact | null; viber: SiteContact | null } {
  return {
    call: contacts.find((c) => c.call) ?? null,
    whatsapp: contacts.find((c) => c.whatsapp) ?? null,
    viber: contacts.find((c) => c.viber) ?? null,
  };
}

/** "08:00–16:00", or null when closed. */
export function hoursText(opens: string | null, closes: string | null): string | null {
  return opens && closes ? `${opens}–${closes}` : null;
}

/** "Ponedjeljak – Petak 08:00–16:00": consecutive days with the same hours shown as one line. */
export function groupHours(hours: Snapshot['hours'], dayNames: readonly string[]): { days: string; weekdays: number[]; time: string | null }[] {
  const sorted = [...hours].sort((a, b) => a.weekday - b.weekday);
  const groups: { weekdays: number[]; time: string | null }[] = [];
  for (const h of sorted) {
    const time = hoursText(h.opens, h.closes);
    const last = groups.at(-1);
    if (last && last.time === time && last.weekdays.at(-1) === h.weekday - 1) last.weekdays.push(h.weekday);
    else groups.push({ weekdays: [h.weekday], time });
  }
  return groups.map((g) => ({
    ...g,
    days: g.weekdays.length > 1 ? `${dayNames[g.weekdays[0] - 1]} – ${dayNames[g.weekdays.at(-1)! - 1]}` : dayNames[g.weekdays[0] - 1],
  }));
}

/** The fuel in the page's language ("Diesel" → "Dizel"); unknown values as typed. */
export function fuelName(fuel: string, names: Record<string, string>): string {
  return names[fuel] ?? fuel;
}

/** "2003 · 210 000 km · Dizel": the short spec line on a card. */
export function specLine(car: SiteCar, fuels: Record<string, string>): string {
  return [car.year, car.mileage_km != null ? formatKm(car.mileage_km) : null, car.fuel ? fuelName(car.fuel, fuels) : null].filter(Boolean).join(' · ');
}

/** Texts typed in the app → paragraphs (empty lines split them) of lines. */
export function paragraphs(text: string | null | undefined): string[][] {
  return (text ?? '')
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((p) => p.length > 0);
}

/** The car's cover photo: the favorite, else the first chosen one. */
export function coverOf<T extends { favorite: boolean }>(photos: T[]): T | null {
  return photos.find((p) => p.favorite) ?? photos[0] ?? null;
}

export function carPath(base: string, lang: Lang, slug: string): string {
  return lang === 'hr' ? `${base}auti/${slug}/` : `${base}en/cars/${slug}/`;
}

export function homePath(base: string, lang: Lang): string {
  return lang === 'hr' ? base : `${base}en/`;
}

/** For sale = a flip in status Listed; those leave "Our work" while they are for sale. */
export function isForSale(car: SiteCar): boolean {
  return car.kind === 'flip' && car.status === 'listed';
}

/** "Short line" for meta descriptions: at most n characters, cut at a word. */
export function clip(text: string, n = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= n) return clean;
  const cut = clean.slice(0, n - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), n * 0.6))}…`;
}
