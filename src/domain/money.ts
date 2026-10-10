// Money is always an integer number of euro cents. Never do money math with floats.
export type Cents = number;

const NBSP = ' ';

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** 123456 → "1 234.56€" (non-breaking space between thousands, dot for decimals). */
export function formatMoney(cents: Cents, options: { sign?: boolean } = {}): string {
  assertCents(cents);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const euros = groupThousands(Math.floor(abs / 100).toString());
  const rest = (abs % 100).toString().padStart(2, '0');
  const prefix = negative ? '-' : options.sign && cents > 0 ? '+' : '';
  return `${prefix}${euros}.${rest}€`;
}

/** Plain number for inputs and CSV: 123456 → "1234.56". */
export function centsToInput(cents: Cents): string {
  assertCents(cents);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  return `${negative ? '-' : ''}${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, '0')}`;
}

/**
 * Parses what people type on a phone into cents, without floating point.
 * Accepts "12", "12.5", "12,50", "1 234.56", "1 234,56", "€ 12", "12€", "-3.20".
 * A single "." or "," is the decimal separator; at most 2 decimals.
 * Returns null for anything else.
 */
export function parseMoney(input: string, options: { allowNegative?: boolean } = {}): Cents | null {
  let s = input.trim().replace(/[\s  €]/g, '').replace(/^EUR|EUR$/i, '');
  if (s === '') return null;

  let negative = false;
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = true;
    s = s.slice(1);
  }
  if (negative && !options.allowNegative) return null;

  const match = /^(\d+)(?:[.,](\d{0,2}))?$/.exec(s);
  if (!match) return null;

  const euros = Number(match[1]);
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const cents = euros * 100 + Number(fraction);
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

export function assertCents(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Money must be a whole number of cents, got ${value}`);
  }
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
  }
  return total;
}

/**
 * Divides a * b / c and rounds half away from zero, using BigInt so large intermediate
 * products stay exact. Used for proportional amounts (average cost, shares).
 */
export function mulDivRound(a: number, b: number, c: number): number {
  if (c === 0) throw new Error('Division by zero');
  const num = BigInt(a) * BigInt(b);
  const den = BigInt(c);
  const negative = (num < 0n) !== (den < 0n);
  const absNum = num < 0n ? -num : num;
  const absDen = den < 0n ? -den : den;
  let q = absNum / absDen;
  const r = absNum % absDen;
  if (r * 2n >= absDen) q += 1n;
  return Number(negative ? -q : q);
}
