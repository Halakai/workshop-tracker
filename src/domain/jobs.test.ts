import { describe, expect, it } from 'vitest';
import { jobTotals, nextJobRef, unitPrice, withMarkup } from './jobs';

describe('job totals', () => {
  const money = { linesCents: 8500, laborCents: 5000, paymentsCents: 0, stockCents: 3000, partsCents: 4000 };

  it('adds lines and labor; cost is stock + bought parts', () => {
    expect(jobTotals(money)).toEqual({
      due: 13500,
      paid: 0,
      outstanding: 13500,
      cost: 7000,
      expectedProfit: 6500,
      profit: -7000,
      fullyPaid: false,
    });
  });

  it('is fully paid once payments cover the total', () => {
    const t = jobTotals({ ...money, paymentsCents: 13500 });
    expect(t).toMatchObject({ outstanding: 0, profit: 6500, fullyPaid: true });
  });

  it('a discount (paid less) lowers the profit', () => {
    const t = jobTotals({ ...money, paymentsCents: 12000 });
    expect(t).toMatchObject({ outstanding: 1500, profit: 5000, fullyPaid: false });
  });

  it('an empty job is not "paid"', () => {
    expect(jobTotals({ linesCents: 0, laborCents: 0, paymentsCents: 0, stockCents: 0, partsCents: 0 }).fullyPaid).toBe(false);
  });
});

describe('job helpers', () => {
  it('numbers jobs', () => {
    expect(nextJobRef([])).toBe('JOB-001');
    expect(nextJobRef(['JOB-001', 'JOB-002'])).toBe('JOB-003');
  });

  it('computes the unit price for the invoice', () => {
    expect(unitPrice(3150, 4500)).toBe(700); // 4.5 L for 31.50 → 7.00 per L
    expect(unitPrice(1000, 3000)).toBe(333);
    expect(unitPrice(1000, 1000)).toBe(1000);
  });

  it('applies a markup', () => {
    expect(withMarkup(1000, 10)).toBe(1100);
    expect(withMarkup(999, 15)).toBe(1149);
    expect(withMarkup(1000, 0)).toBe(1000);
  });
});
