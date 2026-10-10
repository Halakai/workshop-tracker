import { describe, expect, it } from 'vitest';
import { carTitle, carTotals, isClosed, nextCarRef } from './cars';

const money = { purchase: 100000, stock: 5000, parts: 20000, otherCosts: 7500, sale: 0 };

describe('car totals', () => {
  it('adds up everything invested while the car is in progress', () => {
    expect(carTotals(money, 'in_repair')).toEqual({ invested: 132500, sale: 0, profit: null, marginBp: null, roiBp: null });
  });

  it('shows profit, margin and ROI once sold', () => {
    const t = carTotals({ ...money, sale: 200000 }, 'sold');
    expect(t.invested).toBe(132500);
    expect(t.profit).toBe(67500);
    expect(t.marginBp).toBe(3375); // 675 / 2000 = 33.75 %
    expect(t.roiBp).toBe(5094); // 675 / 1325 = 50.94 %
  });

  it('handles a loss', () => {
    const t = carTotals({ ...money, sale: 90000 }, 'sold');
    expect(t.profit).toBe(-42500);
    expect(t.marginBp).toBe(-4722);
  });

  it('a scrapped car without income is a full loss', () => {
    const t = carTotals(money, 'scrapped');
    expect(t.profit).toBe(-132500);
    expect(t.marginBp).toBeNull();
    expect(t.roiBp).toBe(-10000);
  });

  it('knows which statuses are closed', () => {
    expect(isClosed('sold')).toBe(true);
    expect(isClosed('scrapped')).toBe(true);
    expect(isClosed('listed')).toBe(false);
  });
});

describe('car helpers', () => {
  it('numbers cars', () => {
    expect(nextCarRef([])).toBe('CAR-001');
    expect(nextCarRef(['CAR-001', 'car-004'])).toBe('CAR-005');
  });

  it('builds a title', () => {
    expect(carTitle({ year: 2012, make: 'Škoda', model: 'Octavia' })).toBe('2012 Škoda Octavia');
    expect(carTitle({ year: null, make: 'VW', model: 'Golf' })).toBe('VW Golf');
    expect(carTitle({ year: 2001, make: 'Volkswagen', model: 'Golf', generation: 'IV (1J)' })).toBe('2001 Volkswagen Golf IV (1J)');
  });
});
