import { describe, expect, it } from 'vitest';
import { formatInteger, formatQuantity, milliToDb, milliToInput, parseQuantity, toMilli } from './quantity';

describe('quantities', () => {
  it('converts database numbers to milli without float noise', () => {
    expect(toMilli(4.5)).toBe(4500);
    expect(toMilli(0.1)).toBe(100);
    expect(toMilli(1234.567)).toBe(1234567);
    expect(toMilli('0.300')).toBe(300);
  });

  it('writes exact decimal strings for the database', () => {
    expect(milliToDb(4500)).toBe('4.500');
    expect(milliToDb(-250)).toBe('-0.250');
    expect(milliToDb(1)).toBe('0.001');
    expect(milliToInput(4500)).toBe('4.5');
    expect(milliToInput(12000)).toBe('12');
  });

  it('formats with unit and thousands', () => {
    expect(formatQuantity(4500, 'L')).toBe('4.5\u00A0L');
    expect(formatQuantity(12000, 'pcs')).toBe('12\u00A0pcs');
    expect(formatQuantity(1234500, 'm')).toBe('1\u00A0234.5\u00A0m');
    expect(formatQuantity(-250, 'kg')).toBe('-0.25\u00A0kg');
  });

  it.each([
    ['4.5', 4500],
    ['4,5', 4500],
    ['12', 12000],
    ['0.25', 250],
    ['0,001', 1],
    [' 3 ', 3000],
    ['1.2345', null],
    ['abc', null],
    ['', null],
    ['0', null],
    ['-1', null],
  ])('parses %j → %j', (input, expected) => {
    expect(parseQuantity(input)).toBe(expected);
  });

  it('respects options', () => {
    expect(parseQuantity('0', { allowZero: true })).toBe(0);
    expect(parseQuantity('-1.5', { allowNegative: true })).toBe(-1500);
    expect(parseQuantity('2', { wholeOnly: true })).toBe(2000);
    expect(parseQuantity('2.5', { wholeOnly: true })).toBeNull();
  });
});

describe('formatInteger', () => {
  it('groups thousands', () => {
    expect(formatInteger(123456)).toBe('123\u00A0456');
    expect(formatInteger(999)).toBe('999');
    expect(formatInteger(-1500)).toBe('-1\u00A0500');
  });
});
