// The money ledger. Every transaction moves an amount FROM one account TO another
// (wallet, a partner, or "external" = the outside world). Balances are always computed, never stored.
//
// A partner's balance is their capital in the workshop (what the workshop owes them):
//   put in      = everything that left their pocket for the workshop (deposits, expenses they paid,
//                 transfers they made)
//   taken out   = everything that came to them (withdrawals, workshop income they received, transfers to them)
//   profit share = their allocations (share of car/job profits and losses, overhead, stock corrections)
//   balance     = put in − taken out + profit share
import type { Cents } from './money';

export interface LedgerEntry {
  from: string;
  to: string;
  amount: Cents;
}

export interface AllocationEntry {
  partnerId: string;
  amount: Cents;
}

/** Money in minus money out for one account (e.g. the wallet balance). */
export function accountBalance(accountId: string, entries: readonly LedgerEntry[]): Cents {
  let balance = 0;
  for (const e of entries) {
    if (e.to === accountId) balance += e.amount;
    if (e.from === accountId) balance -= e.amount;
  }
  return balance;
}

export interface PartnerPosition {
  partnerId: string;
  accountId: string;
  putIn: Cents;
  takenOut: Cents;
  profitShare: Cents;
  balance: Cents;
}

export function partnerPositions(
  partners: readonly { partnerId: string; accountId: string }[],
  entries: readonly LedgerEntry[],
  allocations: readonly AllocationEntry[],
): PartnerPosition[] {
  return partners.map(({ partnerId, accountId }) => {
    let putIn = 0;
    let takenOut = 0;
    for (const e of entries) {
      if (e.from === accountId) putIn += e.amount;
      if (e.to === accountId) takenOut += e.amount;
    }
    const profitShare = allocations.filter((a) => a.partnerId === partnerId).reduce((s, a) => s + a.amount, 0);
    return { partnerId, accountId, putIn, takenOut, profitShare, balance: putIn - takenOut + profitShare };
  });
}

/** Each partner's part of the total capital, in basis points (only when the total is positive). */
export function capitalShares(positions: readonly PartnerPosition[]): Map<string, number> {
  const total = positions.reduce((s, p) => s + Math.max(0, p.balance), 0);
  const result = new Map<string, number>();
  for (const p of positions) {
    result.set(p.partnerId, total > 0 ? Math.round((Math.max(0, p.balance) * 10000) / total) : 0);
  }
  return result;
}
