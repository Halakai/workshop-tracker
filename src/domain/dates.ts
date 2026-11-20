// Dates in the database are either `date` ("2026-03-12") or `timestamptz` (ISO string).
// The UI always shows European DD.MM.YYYY.

const pad = (n: number) => n.toString().padStart(2, '0');

/** "2026-03-12" or an ISO timestamp → "12.03.2026" (timestamps in local time). */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}.${m}.${y}`;
  }
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/** ISO timestamp → "12.03.2026 14:05" in local time. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Today's local date as "YYYY-MM-DD" (the value format of <input type="date">). */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * A date as people type it → "2026-03-12"; null if it isn't a real date.
 * Day first: "12.03.2026", "12.3.26", "12/3/2026", "12-3-2026", "12 3 2026", "12032026", "120326";
 * without a year it's this year: "12.3", "12.3.", "1203". A pasted "2026-03-12" works too.
 * Two-digit years up to 20 years ahead are 20xx, the rest 19xx ("98" → 1998, "30" → 2030).
 */
export function parseTypedDate(input: string, now: Date = new Date()): string | null {
  const text = input.trim();
  if (!text) return null;
  let day: number;
  let month: number;
  let year: number | null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const parts = /^(\d{1,2})[.\-/, ]+(\d{1,2})(?:[.\-/, ]+(\d{2}|\d{4}))?\.?$/.exec(text);
  const digits = /^\d+$/.test(text) ? text : null;
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (parts) [day, month, year] = [Number(parts[1]), Number(parts[2]), parts[3] ? Number(parts[3]) : null];
  else if (digits && [4, 6, 8].includes(digits.length))
    [day, month, year] = [Number(digits.slice(0, 2)), Number(digits.slice(2, 4)), digits.length > 4 ? Number(digits.slice(4)) : null];
  else return null;

  if (year === null) year = now.getFullYear();
  else if (year < 100) year += 2000 + year <= now.getFullYear() + 20 ? 2000 : 1900;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}
