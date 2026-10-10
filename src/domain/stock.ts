// Stock valuation: moving weighted average.
// Each item keeps two running totals, quantity and value. Everything else follows from them:
//   purchase:  qty += q, value += what we paid
//   use:       qty −= q, value −= value × q / qty   (all remaining value when the stock is used up)
//   count up:  at the current average cost (or a unit cost you enter when the stock was empty)
// Because the leftover value is taken exactly when stock reaches zero, rounding never piles up.
import { mulDivRound, type Cents } from './money';
import { MILLI_PER_UNIT, type Milli } from './quantity';
import { splitByShares, type Share } from './shares';

export interface StockLevel {
  qty: Milli;
  value: Cents;
}

export interface StockDelta {
  qty: Milli;
  value: Cents;
}

export class StockError extends Error {}

function assertLevel(stock: StockLevel) {
  if (stock.qty < 0 || stock.value < 0 || (stock.qty === 0 && stock.value !== 0)) {
    throw new StockError(`Inconsistent stock: ${stock.qty} / ${stock.value}`);
  }
}

/** Average cost of ONE unit, rounded to cents (for display). Null when nothing is in stock. */
export function averageUnitCost(stock: StockLevel): Cents | null {
  if (stock.qty <= 0) return null;
  return mulDivRound(stock.value, MILLI_PER_UNIT, stock.qty);
}

export function purchaseDelta(qty: Milli, totalCost: Cents): StockDelta {
  if (qty <= 0) throw new StockError('Quantity must be more than 0');
  if (totalCost < 0) throw new StockError('Price can’t be negative');
  return { qty, value: totalCost };
}

/** Taking qty out of stock (use on a car or job, workshop overhead, count down). */
export function issueDelta(stock: StockLevel, qty: Milli): StockDelta {
  assertLevel(stock);
  if (qty <= 0) throw new StockError('Quantity must be more than 0');
  if (qty > stock.qty) throw new StockError('Not enough in stock');
  const cost = qty === stock.qty ? stock.value : mulDivRound(stock.value, qty, stock.qty);
  return { qty: -qty, value: cost === 0 ? 0 : -cost };
}

/**
 * Adding stock without a purchase (found, counted more): valued at the current average cost;
 * if the stock was empty, `unitCostIfEmpty` (cents per unit) is required, e.g. for opening stock.
 */
export function increaseDelta(stock: StockLevel, qty: Milli, unitCostIfEmpty?: Cents): StockDelta {
  assertLevel(stock);
  if (qty <= 0) throw new StockError('Quantity must be more than 0');
  if (stock.qty > 0) return { qty, value: mulDivRound(stock.value, qty, stock.qty) };
  if (unitCostIfEmpty === undefined || unitCostIfEmpty < 0) {
    throw new StockError('Enter what one unit is worth');
  }
  return { qty, value: mulDivRound(unitCostIfEmpty, qty, MILLI_PER_UNIT) };
}

/** A stock count: the counted quantity replaces what the app thought we had. */
export function countDelta(stock: StockLevel, counted: Milli, unitCostIfEmpty?: Cents): StockDelta {
  assertLevel(stock);
  if (counted < 0) throw new StockError('Count can’t be negative');
  const diff = counted - stock.qty;
  if (diff === 0) throw new StockError('The count matches the stock – nothing to correct');
  return diff < 0 ? issueDelta(stock, -diff) : increaseDelta(stock, diff, unitCostIfEmpty);
}

/**
 * Ways to correct stock without buying or using it:
 *   count   – enter what is on the shelf (the difference is booked)
 *   damaged – enter how much was damaged (taken out)
 *   lost    – enter how much is missing (taken out)
 *   found   – enter how much turned up (added)
 */
export type AdjustMode = 'count' | 'damaged' | 'lost' | 'found';

export function adjustmentDelta(stock: StockLevel, mode: AdjustMode, amount: Milli, unitCostIfEmpty?: Cents): StockDelta {
  switch (mode) {
    case 'count':
      return countDelta(stock, amount, unitCostIfEmpty);
    case 'damaged':
    case 'lost':
      return issueDelta(stock, amount);
    case 'found':
      return increaseDelta(stock, amount, unitCostIfEmpty);
  }
}

/** The reason stored with the correction. */
export function adjustmentReason(mode: AdjustMode, stock: StockLevel): string {
  switch (mode) {
    case 'count':
      return stock.qty === 0 ? 'Opening stock' : 'Stock count';
    case 'damaged':
      return 'Damaged';
    case 'lost':
      return 'Lost';
    case 'found':
      return 'Found';
  }
}

/**
 * What of an item is "on" a car: everything used on it minus what came back.
 * Movements are the car's use_car (negative) and return (positive) rows for that item.
 */
export function onCar(movements: readonly StockDelta[]): StockLevel {
  const qty = -movements.reduce((s, m) => s + m.qty, 0);
  const value = -movements.reduce((s, m) => s + m.value, 0);
  return { qty: qty || 0, value: value || 0 }; // || 0 turns -0 into 0
}

/** Returning parts from a car: they come back at exactly what the car was charged for them. */
export function returnDelta(fromCar: StockLevel, qty: Milli): StockDelta {
  if (qty <= 0) throw new StockError('Quantity must be more than 0');
  if (qty > fromCar.qty) throw new StockError('More than was used on this car');
  const value = qty === fromCar.qty ? fromCar.value : mulDivRound(fromCar.value, qty, fromCar.qty);
  return { qty, value };
}

export function applyDelta(stock: StockLevel, delta: StockDelta): StockLevel {
  const next = { qty: stock.qty + delta.qty, value: stock.value + delta.value };
  assertLevel(next);
  return next;
}

/** Low when a minimum is set and we're at or below it. */
export function isLowStock(qty: Milli, minQty: Milli): boolean {
  return minQty > 0 && qty <= minQty;
}

// ---------------------------------------------------------------------------
// Movements as sent to the database (post_stock_movement)
// ---------------------------------------------------------------------------

export type MovementType = 'purchase' | 'overhead' | 'adjustment' | 'use_car' | 'return';

export interface Allocation {
  partnerId: string;
  amount: Cents;
}

export interface MovementInput {
  type: MovementType;
  delta: StockDelta;
  occurredOn: string;
  supplier?: string;
  reason?: string;
  note?: string;
  /** account that paid (purchases with a price) */
  paidBy?: string;
  /** profit-share allocations (overhead and corrections); they add up to delta.value */
  allocations: Allocation[];
  /** the car parts go on / come back from */
  carId?: string;
}

/** Splits a change in what the workshop owns across partners by their default shares. */
export function allocateByShares(amount: Cents, shares: Share[]): Allocation[] {
  if (amount === 0) return [];
  return [...splitByShares(amount, shares)]
    .filter(([, cents]) => cents !== 0)
    .map(([partnerId, cents]) => ({ partnerId, amount: cents }));
}

export function buildPurchase(args: {
  qty: Milli;
  totalCost: Cents;
  paidBy: string | null;
  occurredOn: string;
  supplier?: string;
  note?: string;
}): MovementInput {
  if (args.totalCost > 0 && !args.paidBy) throw new StockError('Choose who paid');
  return {
    type: 'purchase',
    delta: purchaseDelta(args.qty, args.totalCost),
    occurredOn: args.occurredOn,
    supplier: args.supplier,
    note: args.note,
    paidBy: args.totalCost > 0 ? args.paidBy! : undefined,
    allocations: [],
  };
}

export function buildOverheadUse(args: {
  stock: StockLevel;
  qty: Milli;
  shares: Share[];
  occurredOn: string;
  note?: string;
}): MovementInput {
  const delta = issueDelta(args.stock, args.qty);
  return {
    type: 'overhead',
    delta,
    occurredOn: args.occurredOn,
    note: args.note,
    allocations: allocateByShares(delta.value, args.shares),
  };
}

export function buildAdjustment(args: {
  stock: StockLevel;
  mode: AdjustMode;
  amount: Milli;
  unitCostIfEmpty?: Cents;
  shares: Share[];
  occurredOn: string;
  note?: string;
}): MovementInput {
  const delta = adjustmentDelta(args.stock, args.mode, args.amount, args.unitCostIfEmpty);
  return {
    type: 'adjustment',
    delta,
    occurredOn: args.occurredOn,
    reason: adjustmentReason(args.mode, args.stock),
    note: args.note,
    allocations: allocateByShares(delta.value, args.shares),
  };
}

/** Parts from stock used on a car: they become part of what the car cost (no profit split yet). */
export function buildUseOnCar(args: {
  stock: StockLevel;
  qty: Milli;
  carId: string;
  occurredOn: string;
  note?: string;
}): MovementInput {
  return {
    type: 'use_car',
    delta: issueDelta(args.stock, args.qty),
    occurredOn: args.occurredOn,
    note: args.note,
    carId: args.carId,
    allocations: [],
  };
}

export function buildReturnFromCar(args: {
  fromCar: StockLevel;
  qty: Milli;
  carId: string;
  occurredOn: string;
  note?: string;
}): MovementInput {
  return {
    type: 'return',
    delta: returnDelta(args.fromCar, args.qty),
    occurredOn: args.occurredOn,
    note: args.note,
    carId: args.carId,
    allocations: [],
  };
}
