import { describe, expect, it } from 'vitest';
import { classify, groupTotals, lastMonths, monthLabel, monthlyTotals, type MoneyRow } from './dashboard';

const row = (occurredOn: string, kind: string, category: string, amount: number): MoneyRow => ({ occurredOn, kind, category, amount });

const rows: MoneyRow[] = [
  row('2026-09-03', 'expense', 'car_purchase', 150000),
  row('2026-09-10', 'expense', 'stock_purchase', 4500),
  row('2026-10-01', 'expense', 'car_part', 12000),
  row('2026-10-02', 'expense', 'workshop_expense', 3000),
  row('2026-10-05', 'income', 'car_sale', 220000),
  row('2026-10-06', 'income', 'job_payment', 13500),
  row('2026-10-07', 'deposit', 'deposit', 50000),
  row('2026-10-08', 'transfer', 'settlement', 20000),
  row('2025-12-31', 'expense', 'car_cost', 999),
];

describe('classify', () => {
  it('sorts expenses and income into groups', () => {
    expect(classify({ kind: 'expense', category: 'job_part' })).toEqual({ group: 'job_parts', direction: 'out' });
    expect(classify({ kind: 'income', category: 'other_income' })).toEqual({ group: 'other_in', direction: 'in' });
  });
  it('ignores money moving between the wallet and partners', () => {
    expect(classify({ kind: 'deposit', category: 'deposit' })).toBeNull();
    expect(classify({ kind: 'transfer', category: 'settlement' })).toBeNull();
  });
  it('puts unknown categories under other', () => {
    expect(classify({ kind: 'expense', category: 'something_new' })?.group).toBe('other_out');
  });
});

describe('months', () => {
  it('lists the last months across a year end', () => {
    expect(lastMonths(3, '2026-02-15')).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(lastMonths(1, '2026-10-10')).toEqual(['2026-10']);
  });
  it('names months', () => {
    expect(monthLabel('2026-03')).toBe('Mar');
  });
});

describe('monthlyTotals', () => {
  it('adds up money out and in per month, skipping moves and other months', () => {
    expect(monthlyTotals(rows, ['2026-09', '2026-10'])).toEqual([
      { month: '2026-09', out: 154500, in: 0 },
      { month: '2026-10', out: 15000, in: 233500 },
    ]);
  });
});

describe('groupTotals', () => {
  it('sums a period by group, biggest first', () => {
    expect(groupTotals(rows, 'out', '2026-01-01', '2026-12-31')).toEqual([
      { group: 'cars_bought', label: 'Buying cars', amount: 150000 },
      { group: 'car_parts', label: 'Parts for cars', amount: 12000 },
      { group: 'inventory', label: 'Inventory', amount: 4500 },
      { group: 'workshop', label: 'Workshop expenses', amount: 3000 },
    ]);
    expect(groupTotals(rows, 'in', '2026-10-01', '2026-10-31').map((g) => g.amount)).toEqual([220000, 13500]);
  });
  it('includes both ends of the period', () => {
    expect(groupTotals(rows, 'out', '2025-12-31', '2026-09-03')).toHaveLength(2);
  });
});
