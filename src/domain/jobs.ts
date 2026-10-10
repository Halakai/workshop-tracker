// Small jobs for friends: what the customer owes and what we made.
//   due      = every line's price + the labor price
//   paid     = payments received
//   cost     = parts from stock (net of returns) + parts bought for the job
//   profit   = paid − cost (what settling up splits); expected profit = due − cost
import type { Cents } from './money';
import { nextPartNumber } from './codes';

export type JobStatus = 'open' | 'done' | 'paid';

export const JOB_STATUSES: { value: JobStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
  { value: 'paid', label: 'Paid' },
];

export function jobStatusLabel(status: JobStatus): string {
  return JOB_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export interface JobMoney {
  linesCents: Cents;
  laborCents: Cents;
  paymentsCents: Cents;
  stockCents: Cents;
  partsCents: Cents;
}

export interface JobTotals {
  due: Cents;
  paid: Cents;
  outstanding: Cents;
  cost: Cents;
  expectedProfit: Cents;
  profit: Cents;
  fullyPaid: boolean;
}

export function jobTotals(m: JobMoney): JobTotals {
  const due = m.linesCents + m.laborCents;
  const cost = m.stockCents + m.partsCents;
  return {
    due,
    paid: m.paymentsCents,
    outstanding: Math.max(0, due - m.paymentsCents),
    cost,
    expectedProfit: due - cost,
    profit: m.paymentsCents - cost,
    fullyPaid: due > 0 && m.paymentsCents >= due,
  };
}

/** Next free job ID: JOB-001, JOB-002 … */
export function nextJobRef(existing: Iterable<string>): string {
  return nextPartNumber('JOB', existing);
}

/** Price per unit shown on the invoice: line total ÷ quantity, rounded to cents. */
export function unitPrice(lineTotal: Cents, qtyMilli: number): Cents {
  if (qtyMilli <= 0) return lineTotal;
  return Math.round((lineTotal * 1000) / qtyMilli);
}

/** Applies a markup in percent to a cost: 1000 + 10 % → 1100 (rounded to cents). */
export function withMarkup(cost: Cents, percent: number): Cents {
  return Math.round(cost * (1 + percent / 100));
}
