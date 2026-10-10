// What a car cost us and what we made on it.
//   invested = purchase + parts from stock (net of returns) + parts bought for it + other costs
//   profit   = sale − invested            (once the car is sold or scrapped)
//   margin   = profit ÷ sale,  ROI = profit ÷ invested   (basis points: 2345 = 23.45 %)
import { mulDivRound, type Cents } from './money';
import { nextPartNumber } from './codes';

export type CarStatus = 'bought' | 'in_repair' | 'ready' | 'listed' | 'sold' | 'scrapped';

export const CAR_STATUSES: { value: CarStatus; label: string }[] = [
  { value: 'bought', label: 'Bought' },
  { value: 'in_repair', label: 'In repair' },
  { value: 'ready', label: 'Ready for sale' },
  { value: 'listed', label: 'Listed' },
  { value: 'sold', label: 'Sold' },
  { value: 'scrapped', label: 'Scrapped' },
];

export function carStatusLabel(status: CarStatus): string {
  return CAR_STATUSES.find((s) => s.value === status)?.label ?? status;
}

/** Sold or scrapped: the car's story is finished and its profit (or loss) is known. */
export function isClosed(status: CarStatus): boolean {
  return status === 'sold' || status === 'scrapped';
}

export interface CarMoney {
  purchase: Cents;
  stock: Cents;
  parts: Cents;
  otherCosts: Cents;
  sale: Cents;
}

export interface CarTotals {
  invested: Cents;
  sale: Cents;
  profit: Cents | null;
  marginBp: number | null;
  roiBp: number | null;
}

export function carTotals(money: CarMoney, status: CarStatus): CarTotals {
  const invested = money.purchase + money.stock + money.parts + money.otherCosts;
  if (!isClosed(status)) return { invested, sale: money.sale, profit: null, marginBp: null, roiBp: null };
  const profit = money.sale - invested;
  return {
    invested,
    sale: money.sale,
    profit,
    marginBp: money.sale > 0 ? mulDivRound(profit, 10000, money.sale) : null,
    roiBp: invested > 0 ? mulDivRound(profit, 10000, invested) : null,
  };
}

/** Next free car ID: CAR-001, CAR-002 … */
export function nextCarRef(existing: Iterable<string>): string {
  return nextPartNumber('CAR', existing);
}

/** "2004 Volkswagen Golf IV (1J)" */
export function carTitle(car: { year: number | null; make: string; model: string; generation?: string | null }): string {
  return [car.year, car.make, car.model, car.generation].filter(Boolean).join(' ');
}
