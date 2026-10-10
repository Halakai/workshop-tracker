// Settling up a sold car (or a paid job) between partners.
//
// 1. Profit or loss → allocations: profit = sale − everything invested, split by the car's shares.
//    These are added to each partner's balance whatever happens with the cash.
// 2. Cash → suggested transfers. Where should the car's money end up?
//      partner: their out-of-pocket costs (if `reimburse`) + their profit share (if mode = 'payout')
//      wallet:  everything else (so in 'retain' mode the profit stays in the wallet)
//    Compared with who actually holds the sale money, the fewest transfers that get there are suggested.
// Moving cash between a partner and the wallet never changes anyone's balance, only where money sits,
// so a suggested transfer that isn't made never breaks the accounts.
import type { Cents } from './money';
import { splitByShares } from './shares';

export type PayoutMode = 'retain' | 'payout';

export interface ShareWithAccount {
  partnerId: string;
  accountId: string;
  bp: number;
}

export interface SettlementInput {
  walletAccountId: string;
  shares: ShareWithAccount[];
  /** what each account paid for the car; parts from stock count as paid by the wallet */
  costs: Map<string, Cents>;
  /** sale money by the account that received it */
  receipts: Map<string, Cents>;
  mode: PayoutMode;
  /** pay partners back what they paid out of their own pocket */
  reimburse: boolean;
}

export interface Transfer {
  from: string;
  to: string;
  amount: Cents;
}

export interface SettlementResult {
  invested: Cents;
  sale: Cents;
  profit: Cents;
  allocations: { partnerId: string; amount: Cents }[];
  /** what each account holds of the car's money right now */
  held: Map<string, Cents>;
  /** where the car's money should end up */
  targets: Map<string, Cents>;
  transfers: Transfer[];
}

const sum = (m: Map<string, Cents>) => [...m.values()].reduce((s, v) => s + v, 0);

export function settle(input: SettlementInput): SettlementResult {
  const invested = sum(input.costs);
  const sale = sum(input.receipts);
  const profit = sale - invested;

  const split = splitByShares(
    profit,
    input.shares.map((s) => ({ id: s.partnerId, bp: s.bp })),
  );
  const allocations = input.shares
    .map((s) => ({ partnerId: s.partnerId, amount: split.get(s.partnerId) ?? 0 }))
    .filter((a) => a.amount !== 0);

  const targets = new Map<string, Cents>();
  let partnerTotal = 0;
  for (const s of input.shares) {
    const reimbursement = input.reimburse ? (input.costs.get(s.accountId) ?? 0) : 0;
    const payout = input.mode === 'payout' ? (split.get(s.partnerId) ?? 0) : 0;
    const target = reimbursement + payout;
    targets.set(s.accountId, target);
    partnerTotal += target;
  }
  targets.set(input.walletAccountId, sale - partnerTotal);

  const held = new Map(input.receipts);
  return { invested, sale, profit, allocations, held, targets, transfers: minimalTransfers(held, targets) };
}

/**
 * The fewest transfers (at most accounts − 1) that turn `held` into `targets`.
 * Largest giver pays largest receiver first.
 */
export function minimalTransfers(held: Map<string, Cents>, targets: Map<string, Cents>): Transfer[] {
  const accounts = [...new Set([...targets.keys(), ...held.keys()])];
  const deltas = accounts.map((account, order) => ({
    account,
    order,
    delta: (held.get(account) ?? 0) - (targets.get(account) ?? 0),
  }));
  if (deltas.reduce((s, d) => s + d.delta, 0) !== 0) {
    throw new Error('Held money and targets don’t add up');
  }
  const byAmount = (a: { delta: number; order: number }, b: { delta: number; order: number }) =>
    Math.abs(b.delta) - Math.abs(a.delta) || a.order - b.order;
  const givers = deltas.filter((d) => d.delta > 0).sort(byAmount);
  const receivers = deltas.filter((d) => d.delta < 0).sort(byAmount);

  const transfers: Transfer[] = [];
  let g = 0;
  let r = 0;
  while (g < givers.length && r < receivers.length) {
    const amount = Math.min(givers[g].delta, -receivers[r].delta);
    transfers.push({ from: givers[g].account, to: receivers[r].account, amount });
    givers[g].delta -= amount;
    receivers[r].delta += amount;
    if (givers[g].delta === 0) g++;
    if (receivers[r].delta === 0) r++;
  }
  return transfers;
}

export interface CarLedgerRow {
  category: string;
  from: string;
  to: string;
  amount: Cents;
}

/**
 * Who paid what for a car and who received its sale money, from the car's ledger rows.
 * Parts from stock count as paid by the wallet (stock belongs to the workshop).
 */
export function carFunding(rows: readonly CarLedgerRow[], stockCents: Cents, walletAccountId: string) {
  const costs = new Map<string, Cents>();
  const receipts = new Map<string, Cents>();
  const add = (m: Map<string, Cents>, k: string, v: Cents) => m.set(k, (m.get(k) ?? 0) + v);
  for (const r of rows) {
    if (r.category === 'car_purchase' || r.category === 'car_part' || r.category === 'car_cost') add(costs, r.from, r.amount);
    if (r.category === 'car_sale') add(receipts, r.to, r.amount);
  }
  if (stockCents !== 0) add(costs, walletAccountId, stockCents);
  return { costs, receipts };
}
