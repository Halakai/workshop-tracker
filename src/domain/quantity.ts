// Quantities are handled as integer THOUSANDTHS of a unit ("milli"): 4.5 L → 4500.
// The database stores numeric(12,3), so three decimals are exact and no float math is needed.
export type Milli = number;
export const MILLI_PER_UNIT = 1000;

export type Unit = 'pcs' | 'L' | 'ml' | 'kg' | 'm';
export const UNITS: Unit[] = ['pcs', 'L', 'ml', 'kg', 'm'];

/** Value from the database (numeric arrives as a JSON number, e.g. 4.5) → milli. */
export function toMilli(value: number | string): Milli {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) throw new Error(`Not a quantity: ${value}`);
  return Math.round(n * MILLI_PER_UNIT);
}

/** Milli → exact decimal string for the database ("4.500"). */
export function milliToDb(milli: Milli): string {
  assertMilli(milli);
  const negative = milli < 0;
  const abs = Math.abs(milli);
  return `${negative ? '-' : ''}${Math.floor(abs / MILLI_PER_UNIT)}.${(abs % MILLI_PER_UNIT).toString().padStart(3, '0')}`;
}

/** Milli → plain input text without trailing zeros: 4500 → "4.5". */
export function milliToInput(milli: Milli): string {
  return milliToDb(milli).replace(/\.?0+$/, '');
}

/** "4.5 L", "12 pcs", "-0.25 kg". */
export function formatQuantity(milli: Milli, unit?: Unit): string {
  const number = milliToInput(milli).replace(/^(-?)(\d+)/, (_, sign: string, int: string) =>
    sign + int.replace(/\B(?=(\d{3})+(?!\d))/g, ' '),
  );
  return unit ? `${number} ${unit}` : number;
}

/**
 * Parses typed quantities: "4.5", "4,5", "12", "0.25". Up to 3 decimals.
 * Pieces must be whole numbers. Returns null if invalid.
 */
export function parseQuantity(
  input: string,
  options: { unit?: Unit; allowZero?: boolean; allowNegative?: boolean } = {},
): Milli | null {
  let s = input.trim().replace(/[\s ]/g, '');
  let negative = false;
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = true;
    s = s.slice(1);
  }
  const match = /^(\d+)(?:[.,](\d{0,3}))?$/.exec(s);
  if (!match) return null;
  const milli = Number(match[1]) * MILLI_PER_UNIT + Number((match[2] ?? '').padEnd(3, '0'));
  if (!Number.isSafeInteger(milli)) return null;
  if (negative && !options.allowNegative) return null;
  if (milli === 0 && !options.allowZero) return null;
  if (options.unit === 'pcs' && milli % MILLI_PER_UNIT !== 0) return null;
  return negative ? -milli : milli;
}

export function assertMilli(value: number): void {
  if (!Number.isSafeInteger(value)) throw new Error(`Quantity must be whole thousandths, got ${value}`);
}
