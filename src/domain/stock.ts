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
 * A stock count: the counted quantity replaces what the app thought we had.
 * Going up is valued at the current average cost; if the stock was empty, `unitCostIfEmpty`
 * (cents per unit) is required, e.g. for opening stock.
 */
export function countDelta(stock: StockLevel, counted: Milli, unitCostIfEmpty?: Cents): StockDelta {
  assertLevel(stock);
  if (counted < 0) throw new StockError('Count can’t be negative');
  const diff = counted - stock.qty;
  if (diff === 0) throw new StockError('The count matches the stock – nothing to correct');
  if (diff < 0) return issueDelta(stock, -diff);
  if (stock.qty > 0) return { qty: diff, value: mulDivRound(stock.value, diff, stock.qty) };
  if (unitCostIfEmpty === undefined || unitCostIfEmpty < 0) {
    throw new StockError('Enter what one unit is worth');
  }
  return { qty: diff, value: mulDivRound(unitCostIfEmpty, diff, MILLI_PER_UNIT) };
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

export type MovementType = 'purchase' | 'overhead' | 'adjustment';

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

export function buildCount(args: {
  stock: StockLevel;
  counted: Milli;
  unitCostIfEmpty?: Cents;
  reason: string;
  shares: Share[];
  occurredOn: string;
  note?: string;
}): MovementInput {
  if (!args.reason.trim()) throw new StockError('Give a reason for the correction');
  const delta = countDelta(args.stock, args.counted, args.unitCostIfEmpty);
  return {
    type: 'adjustment',
    delta,
    occurredOn: args.occurredOn,
    reason: args.reason.trim(),
    note: args.note,
    allocations: allocateByShares(delta.value, args.shares),
  };
}
