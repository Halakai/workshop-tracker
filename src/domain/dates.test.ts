import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, parseTypedDate, todayIso } from './dates';

describe('dates', () => {
  it('formats plain dates without timezone shifts', () => {
    expect(formatDate('2026-03-12')).toBe('12.03.2026');
    expect(formatDate('2026-12-31')).toBe('31.12.2026');
    expect(formatDate(null)).toBe('');
  });

  it('formats timestamps in local time', () => {
    const d = new Date(2026, 2, 12, 14, 5);
    expect(formatDate(d)).toBe('12.03.2026');
    expect(formatDateTime(d)).toBe('12.03.2026 14:05');
    expect(formatDate('not a date')).toBe('');
  });

  it('gives today as YYYY-MM-DD', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  describe('typed dates', () => {
    const now = new Date(2026, 10, 20);
    const parse = (s: string) => parseTypedDate(s, now);

    it('reads day.month.year with any separator', () => {
      expect(parse('12.03.2026')).toBe('2026-03-12');
      expect(parse('1.2.26')).toBe('2026-02-01');
      expect(parse('12/3/2026')).toBe('2026-03-12');
      expect(parse('12-3-2026')).toBe('2026-03-12');
      expect(parse('12, 3, 2026')).toBe('2026-03-12');
      expect(parse(' 12 3 2026 ')).toBe('2026-03-12');
      expect(parse('12.3.2026.')).toBe('2026-03-12');
    });

    it('reads digits only', () => {
      expect(parse('12032026')).toBe('2026-03-12');
      expect(parse('120326')).toBe('2026-03-12');
      expect(parse('1203')).toBe('2026-03-12');
      expect(parse('123')).toBeNull();
      expect(parse('12345')).toBeNull();
    });

    it('uses this year when there is none', () => {
      expect(parse('5.1')).toBe('2026-01-05');
      expect(parse('5.1.')).toBe('2026-01-05');
    });

    it('puts two-digit years in the right century', () => {
      expect(parse('1.6.98')).toBe('1998-06-01');
      expect(parse('1.6.30')).toBe('2030-06-01');
      expect(parse('1.6.46')).toBe('2046-06-01');
      expect(parse('1.6.47')).toBe('1947-06-01');
    });

    it('accepts a pasted ISO date', () => {
      expect(parse('2026-03-12')).toBe('2026-03-12');
    });

    it('refuses dates that do not exist', () => {
      expect(parse('31.02.2026')).toBeNull();
      expect(parse('29.02.2025')).toBeNull();
      expect(parse('29.02.2028')).toBe('2028-02-29');
      expect(parse('0.1.2026')).toBeNull();
      expect(parse('1.13.2026')).toBeNull();
      expect(parse('')).toBeNull();
      expect(parse('today')).toBeNull();
    });
  });
});
