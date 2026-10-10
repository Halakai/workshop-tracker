// Short codes for categories and brands, and the item IDs ("part numbers") built from them:
//   category "Fluid" → FLD, brand "Castrol" → CAST, item → FLD-CAST-001
// Pure functions; the database enforces uniqueness.
import { fold } from './search';

const FOLD: Record<string, string> = { đ: 'd', Đ: 'D', ß: 'ss', ø: 'o', Ø: 'O', æ: 'ae', Æ: 'AE', ł: 'l', Ł: 'L' };

/** "Liqui Moly" → "LIQUIMOLY", "Škoda" → "SKODA" (letters and digits only, no accents). */
export function codeLetters(name: string): string {
  return name
    .replace(/[đĐßøØæÆłŁ]/g, (c) => FOLD[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** A unique code of up to `length` characters derived from a name: base, then base2, base3 … */
export function deriveCode(name: string, taken: Iterable<string>, length = 4): string {
  const used = new Set([...taken].map((c) => c.toUpperCase()));
  const base = codeLetters(name).slice(0, length).padEnd(2, 'X');
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = String(n);
    const candidate = base.slice(0, Math.max(2, length + 1 - suffix.length)) + suffix;
    if (!used.has(candidate)) return candidate;
  }
}

export const CODE_PATTERN = /^[A-Z0-9]{2,6}$/;

/** "FLD" + "CAST" → "FLD-CAST"; without a brand just "FLD". */
export function partNumberPrefix(categoryCode: string, brandCode?: string | null): string {
  return brandCode ? `${categoryCode}-${brandCode}` : categoryCode;
}

/** Next free number for a prefix: existing FLD-CAST-001 and FLD-CAST-007 → FLD-CAST-008. */
export function nextPartNumber(prefix: string, existing: Iterable<string>): string {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}-(\\d+)$`, 'i');
  let max = 0;
  const taken = new Set<string>();
  for (const pn of existing) {
    taken.add(pn.toUpperCase());
    const m = pattern.exec(pn.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  for (let n = max + 1; ; n++) {
    const candidate = `${prefix}-${String(n).padStart(3, '0')}`;
    if (!taken.has(candidate.toUpperCase())) return candidate;
  }
}

/** Case-insensitive check against other items' part numbers. */
export function partNumberTaken(partNumber: string, existing: Iterable<string>): boolean {
  const wanted = partNumber.trim().toUpperCase();
  for (const pn of existing) if (pn.toUpperCase() === wanted) return true;
  return false;
}

/**
 * Suggestions for a typed text: entries that start with it first, then ones that contain it
 * (ignoring case and accents: "skoda" finds Škoda), at most `limit`.
 */
export function suggest(query: string, options: readonly string[], limit = 6): string[] {
  const q = fold(query.trim());
  if (!q) return options.slice(0, limit);
  const starts: string[] = [];
  const contains: string[] = [];
  for (const o of options) {
    const lower = fold(o);
    if (lower === q && o === query.trim()) continue; // exact pick already made
    if (lower.startsWith(q)) starts.push(o);
    else if (lower.includes(q)) contains.push(o);
  }
  return [...starts, ...contains].slice(0, limit);
}
