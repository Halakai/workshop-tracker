import { describe, expect, it } from 'vitest';
import { centsToInput, formatMoney, mulDivRound, parseMoney, sumCents } from './money';

const NBSP = ' ';

describe('formatMoney', () => {
  it('formats with space thousands, dot decimals and € suffix', () => {
    expect(formatMoney(123456)).toBe(`1${NBSP}234.56€`);
    expect(formatMoney(0)).toBe('0.00€');
    expect(formatMoney(5)).toBe('0.05€');
    expect(formatMoney(100)).toBe('1.00€');
    expect(formatMoney(123456789)).toBe(`1${NBSP}234${NBSP}567.89€`);
  });

  it('formats negatives and optional plus sign', () => {
    expect(formatMoney(-123456)).toBe(`-1${NBSP}234.56€`);
    expect(formatMoney(2500, { sign: true })).toBe('+25.00€');
    expect(formatMoney(0, { sign: true })).toBe('0.00€');
  });

  it('rejects non-integer cents', () => {
    expect(() => formatMoney(1.5)).toThrow();
  });
});

describe('parseMoney', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12,5', 1250],
    ['12,50', 1250],
    ['12.', 1200],
    ['0.05', 5],
    ['1 234.56', 123456],
    [`1${NBSP}234,56`, 123456],
    ['€ 12', 1200],
    ['12€', 1200],
    ['  7.99  ', 799],
    ['1.005', null], // three decimals
    ['1.234,56', null], // ambiguous mixed separators
    ['abc', null],
    ['', null],
    ['-3.20', null], // negatives off by default
  ])('parses %j → %j', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it('allows negatives when asked', () => {
    expect(parseMoney('-3.20', { allowNegative: true })).toBe(-320);
  });

  it('is exact where floats are not (0.1 + 0.2 style)', () => {
    expect(parseMoney('0.29')).toBe(29);
    expect(parseMoney('1.15')).toBe(115);
    expect(parseMoney('4.35')).toBe(435);
  });

  it('round-trips through centsToInput', () => {
    for (const cents of [0, 1, 99, 100, 123456, 999999]) {
      expect(parseMoney(centsToInput(cents))).toBe(cents);
    }
  });
});

describe('sumCents', () => {
  it('adds integer cents', () => {
    expect(sumCents([100, 250, -50])).toBe(300);
    expect(sumCents([])).toBe(0);
  });
});

describe('mulDivRound', () => {
  it('rounds half away from zero', () => {
    expect(mulDivRound(10, 1, 4)).toBe(3); // 2.5 → 3
    expect(mulDivRound(-10, 1, 4)).toBe(-3);
    expect(mulDivRound(1000, 1, 3)).toBe(333);
    expect(mulDivRound(2000, 1, 3)).toBe(667);
  });

  it('stays exact for large products', () => {
    expect(mulDivRound(9_000_000_000, 9_000_000, 9_000_000)).toBe(9_000_000_000);
  });
});
