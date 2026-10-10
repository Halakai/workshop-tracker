import { assertCents, type Cents } from './money';

/** Profit shares are basis points: 10000 = 100 %. */
export const FULL_SHARE_BP = 10000;

export interface Share<Id extends string = string> {
  id: Id;
  bp: number;
}

export function totalShareBp(shares: readonly Share[]): number {
  return shares.reduce((sum, s) => sum + s.bp, 0);
}

export function sharesAreComplete(shares: readonly Share[]): boolean {
  return shares.every((s) => Number.isInteger(s.bp) && s.bp >= 0) && totalShareBp(shares) === FULL_SHARE_BP;
}

/** 5000 → "50 %", 3333 → "33.33 %". */
export function formatShare(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const frac = Math.abs(bp % 100);
  return frac === 0 ? `${whole} %` : `${whole}.${frac.toString().padStart(2, '0').replace(/0$/, '')} %`;
}

/** Basis points as a percentage with one decimal: 3375 → "33.8 %", -4722 → "-47.2 %". */
export function formatPercentBp(bp: number): string {
  const tenths = Math.round(Math.abs(bp) / 10);
  const sign = bp < 0 && tenths !== 0 ? '-' : '';
  return `${sign}${Math.floor(tenths / 10)}.${tenths % 10} %`;
}

/** "50" → 5000, "33,33" → 3333. Null if not a percentage between 0 and 100 with ≤ 2 decimals. */
export function parseSharePercent(input: string): number | null {
  const match = /^(\d{1,3})(?:[.,](\d{0,2}))?$/.exec(input.trim().replace(/\s|%/g, ''));
  if (!match) return null;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return bp <= FULL_SHARE_BP ? bp : null;
}

/**
 * Splits an amount of cents by shares so the parts add up exactly to the amount
 * (largest-remainder method; ties go to the earlier share in the list).
 * Negative amounts (losses) are split symmetrically.
 */
export function splitByShares<Id extends string>(amount: Cents, shares: readonly Share<Id>[]): Map<Id, Cents> {
  assertCents(amount);
  if (!sharesAreComplete(shares)) {
    throw new Error(`Shares must add up to 100 % (got ${totalShareBp(shares)} bp)`);
  }
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);

  const parts = shares.map((s, index) => {
    const exact = BigInt(abs) * BigInt(s.bp);
    const floor = exact / BigInt(FULL_SHARE_BP);
    const remainder = exact % BigInt(FULL_SHARE_BP);
    return { id: s.id, index, cents: Number(floor), remainder };
  });

  let leftover = abs - parts.reduce((sum, p) => sum + p.cents, 0);
  const byRemainder = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const p of byRemainder) {
    if (leftover === 0) break;
    if (p.remainder === 0n) continue;
    p.cents += 1;
    leftover -= 1;
  }

  const result = new Map<Id, Cents>();
  for (const p of parts) result.set(p.id, sign * p.cents === 0 ? 0 : sign * p.cents);
  return result;
}
