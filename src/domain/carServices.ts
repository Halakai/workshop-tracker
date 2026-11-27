// A car's history (docs/PLAN.md §13, V2): services and jobs, newest first, each with what it cost.
//   workshop car   a service costs what is filed under it: parts bought, other costs, parts from stock
//   member's car   the parts bought for it + parts from workshop stock (charged to the owner) + the work
//   customer's car its jobs (what the customer is charged) + services done elsewhere (their work price)
import type { Cents } from './money';

export interface ServiceMoney {
  /** the work, typed in (members' and customers' cars) */
  labor: Cents | null;
  /** parts bought for a member's car, filed under the service */
  parts: (Cents | null)[];
  /** workshop money filed under it: bought parts and other costs */
  costs: Cents[];
  /** parts from stock filed under it: what stock gave (positive) */
  stock: Cents[];
}

export function serviceTotal(m: ServiceMoney): Cents {
  const sum = (list: (Cents | null)[]) => list.reduce<number>((s, v) => s + (v ?? 0), 0);
  return (m.labor ?? 0) + sum(m.parts) + sum(m.costs) + sum(m.stock);
}

export interface Dated {
  /** the day it happened (YYYY-MM-DD) */
  date: string;
  /** when it was added, to order a day's entries */
  created: string;
}

/** Newest first; entries of the same day in the order they were added, newest first. */
export function newestFirst<T extends Dated>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
}

export interface MileagePoint {
  km: number | null | undefined;
  date: string | null;
}

/** The highest mileage known (the car's own, its services, its jobs), with the day it was read. */
export function latestMileage(points: readonly MileagePoint[]): { km: number; date: string | null } | null {
  let best: { km: number; date: string | null } | null = null;
  for (const p of points) {
    if (p.km == null) continue;
    if (!best || p.km > best.km || (p.km === best.km && p.date && (!best.date || p.date > best.date))) best = { km: p.km, date: p.date };
  }
  return best;
}

/** Totals of a history: everything, and this year's. */
export function historyTotals(entries: readonly { date: string; total: Cents }[], year: number): { all: Cents; thisYear: Cents } {
  let all = 0;
  let thisYear = 0;
  for (const e of entries) {
    all += e.total;
    if (e.date.startsWith(`${year}-`)) thisYear += e.total;
  }
  return { all, thisYear };
}
