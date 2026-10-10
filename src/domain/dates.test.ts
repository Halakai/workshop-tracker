import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, parseEuropeanDate, todayIso } from './dates';

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

  it('parses European dates', () => {
    expect(parseEuropeanDate('12.03.2026')).toBe('2026-03-12');
    expect(parseEuropeanDate('1.2.26')).toBe('2026-02-01');
    expect(parseEuropeanDate('31.02.2026')).toBeNull();
    expect(parseEuropeanDate('2026-03-12')).toBeNull();
  });
});
