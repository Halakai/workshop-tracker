import { describe, expect, it } from 'vitest';
import { formatShare, parseSharePercent, sharesAreComplete, splitByShares } from './shares';

const half = [
  { id: 'a', bp: 5000 },
  { id: 'b', bp: 5000 },
];
const thirds = [
  { id: 'a', bp: 3334 },
  { id: 'b', bp: 3333 },
  { id: 'c', bp: 3333 },
];

describe('splitByShares', () => {
  it('splits evenly', () => {
    expect(Object.fromEntries(splitByShares(75000, half))).toEqual({ a: 37500, b: 37500 });
  });

  it('gives the odd cent to one partner so the total is exact', () => {
    const parts = splitByShares(101, half);
    expect(parts.get('a')! + parts.get('b')!).toBe(101);
    expect(Object.fromEntries(parts)).toEqual({ a: 51, b: 50 });
  });

  it('splits losses symmetrically', () => {
    expect(Object.fromEntries(splitByShares(-30000, half))).toEqual({ a: -15000, b: -15000 });
    const parts = splitByShares(-101, half);
    expect(parts.get('a')! + parts.get('b')!).toBe(-101);
  });

  it('handles three partners and always adds up', () => {
    for (const amount of [0, 1, 2, 100, 99999, 123457, -77777]) {
      const parts = splitByShares(amount, thirds);
      expect([...parts.values()].reduce((s, v) => s + v, 0)).toBe(amount);
    }
    expect(Object.fromEntries(splitByShares(100, thirds))).toEqual({ a: 34, b: 33, c: 33 });
  });

  it('supports all-to-one shares', () => {
    expect(Object.fromEntries(splitByShares(5000, [{ id: 'a', bp: 10000 }, { id: 'b', bp: 0 }]))).toEqual({
      a: 5000,
      b: 0,
    });
  });

  it('refuses shares that do not add up to 100 %', () => {
    expect(() => splitByShares(100, [{ id: 'a', bp: 5000 }])).toThrow();
  });
});

describe('share helpers', () => {
  it('validates completeness', () => {
    expect(sharesAreComplete(half)).toBe(true);
    expect(sharesAreComplete([{ id: 'a', bp: 9999 }])).toBe(false);
    expect(sharesAreComplete([{ id: 'a', bp: 10001 }, { id: 'b', bp: -1 }])).toBe(false);
  });

  it('formats and parses percentages', () => {
    expect(formatShare(5000)).toBe('50 %');
    expect(formatShare(3333)).toBe('33.33 %');
    expect(formatShare(2550)).toBe('25.5 %');
    expect(parseSharePercent('50')).toBe(5000);
    expect(parseSharePercent('33,33')).toBe(3333);
    expect(parseSharePercent('25.5 %')).toBe(2550);
    expect(parseSharePercent('101')).toBeNull();
    expect(parseSharePercent('1.234')).toBeNull();
  });
});
