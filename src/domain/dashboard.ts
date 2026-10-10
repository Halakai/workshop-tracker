// Numbers for the dashboard charts: money going out (expenses) and coming in (income) per month,
// and what it went on. Moves between the wallet and partners (deposits, withdrawals, transfers,
// settling up) are neither: they don't leave or enter the workshop.
import type { Cents } from './money';

export type MoneyGroup =
  | 'cars_bought'
  | 'car_parts'
  | 'car_costs'
  | 'inventory'
  | 'job_parts'
  | 'workshop'
  | 'other_out'
  | 'car_sales'
  | 'job_payments'
  | 'other_in';

export const GROUP_LABELS: Record<MoneyGroup, string> = {
  cars_bought: 'Buying cars',
  car_parts: 'Parts for cars',
  car_costs: 'Other car costs',
  inventory: 'Inventory',
  job_parts: 'Parts for jobs',
  workshop: 'Workshop expenses',
  other_out: 'Other',
  car_sales: 'Car sales',
  job_payments: 'Job payments',
  other_in: 'Other income',
};

const BY_CATEGORY: Record<string, MoneyGroup> = {
  car_purchase: 'cars_bought',
  car_part: 'car_parts',
  car_cost: 'car_costs',
  stock_purchase: 'inventory',
  job_part: 'job_parts',
  workshop_expense: 'workshop',
  car_sale: 'car_sales',
  job_payment: 'job_payments',
  other_income: 'other_in',
};

export interface MoneyRow {
  occurredOn: string; // YYYY-MM-DD
  kind: string;
  category: string;
  amount: Cents;
}

/** Where a row goes on the charts; null for money that only moves between the wallet and partners. */
export function classify(row: Pick<MoneyRow, 'kind' | 'category'>): { group: MoneyGroup; direction: 'out' | 'in' } | null {
  if (row.kind !== 'expense' && row.kind !== 'income') return null;
  const direction = row.kind === 'expense' ? 'out' : 'in';
  return { group: BY_CATEGORY[row.category] ?? (direction === 'out' ? 'other_out' : 'other_in'), direction };
}

/** "2026-03-12" → "2026-03" */
export const monthOf = (date: string) => date.slice(0, 7);

/** The last `count` months up to and including today's, oldest first: ["2026-05", …, "2026-10"]. */
export function lastMonths(count: number, today: string): string[] {
  const [y, m] = today.split('-').map(Number);
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const index = y * 12 + (m - 1) - i;
    months.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`);
  }
  return months;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-03" → "Mar" */
export function monthLabel(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
}

export interface MonthTotals {
  month: string;
  out: Cents;
  in: Cents;
}

export function monthlyTotals(rows: readonly MoneyRow[], months: readonly string[]): MonthTotals[] {
  const totals = new Map(months.map((month) => [month, { month, out: 0, in: 0 }]));
  for (const row of rows) {
    const c = classify(row);
    const t = c && totals.get(monthOf(row.occurredOn));
    if (t) t[c.direction] += row.amount;
  }
  return [...totals.values()];
}

/** Totals per group for rows dated from `from` to `to` (inclusive, YYYY-MM-DD), biggest first. */
export function groupTotals(
  rows: readonly MoneyRow[],
  direction: 'out' | 'in',
  from: string,
  to: string,
): { group: MoneyGroup; label: string; amount: Cents }[] {
  const sums = new Map<MoneyGroup, Cents>();
  for (const row of rows) {
    if (row.occurredOn < from || row.occurredOn > to) continue;
    const c = classify(row);
    if (c?.direction === direction) sums.set(c.group, (sums.get(c.group) ?? 0) + row.amount);
  }
  return [...sums]
    .map(([group, amount]) => ({ group, label: GROUP_LABELS[group], amount }))
    .sort((a, b) => b.amount - a.amount);
}
