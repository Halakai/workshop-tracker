import { describe, expect, it } from 'vitest';
import { carFunding, minimalTransfers, settle, type SettlementInput, type Transfer } from './settlement';
import { accountBalance, partnerPositions, type AllocationEntry, type LedgerEntry } from './ledger';

const W = 'wallet';
const YOU = 'acc-you';
const FRIEND = 'acc-friend';
const shares = [
  { partnerId: 'you', accountId: YOU, bp: 5000 },
  { partnerId: 'friend', accountId: FRIEND, bp: 5000 },
];

function input(over: Partial<SettlementInput>): SettlementInput {
  return {
    walletAccountId: W,
    shares,
    costs: new Map(),
    receipts: new Map(),
    mode: 'retain',
    reimburse: true,
    ...over,
  };
}

/** Applying the transfers to what is held must give exactly the targets. */
function applyTransfers(held: Map<string, number>, transfers: Transfer[]) {
  const result = new Map(held);
  for (const t of transfers) {
    result.set(t.from, (result.get(t.from) ?? 0) - t.amount);
    result.set(t.to, (result.get(t.to) ?? 0) + t.amount);
  }
  for (const [k, v] of result) if (v === 0) result.delete(k);
  return result;
}
function nonZero(m: Map<string, number>) {
  return new Map([...m].filter(([, v]) => v !== 0));
}

describe('worked example from the plan: profit, buyer paid you in cash', () => {
  // wallet bought the car for 1 000.00, you paid 200.00 of parts, 50.00 of stock used, buyer paid you 2 000.00
  const base = input({
    costs: new Map([
      [W, 100000 + 5000],
      [YOU, 20000],
    ]),
    receipts: new Map([[YOU, 200000]]),
  });

  it('keep profit in wallet (default): +375 each, you hand 1 800 to the wallet', () => {
    const r = settle(base);
    expect(r.invested).toBe(125000);
    expect(r.profit).toBe(75000);
    expect(r.allocations).toEqual([
      { partnerId: 'you', amount: 37500 },
      { partnerId: 'friend', amount: 37500 },
    ]);
    expect(r.transfers).toEqual([{ from: YOU, to: W, amount: 180000 }]);
    expect(applyTransfers(r.held, r.transfers)).toEqual(nonZero(r.targets));
  });

  it('pay out profit: you → wallet 1 050, you → friend 375', () => {
    const r = settle({ ...base, mode: 'payout' });
    expect(r.transfers).toEqual([
      { from: YOU, to: W, amount: 105000 },
      { from: YOU, to: FRIEND, amount: 37500 },
    ]);
  });

  it('retain: the profit stays as capital (+375 each); payout: it was taken out as cash (0 each)', () => {
    for (const [mode, expected] of [
      ['retain', [37500, 37500]],
      ['payout', [0, 0]],
    ] as const) {
      const r = settle({ ...base, mode });
      const ledger: LedgerEntry[] = [
        { from: W, to: 'ext', amount: 100000 }, // purchase
        { from: YOU, to: 'ext', amount: 20000 }, // parts
        { from: 'ext', to: YOU, amount: 200000 }, // sale
        ...r.transfers,
      ];
      const allocations: AllocationEntry[] = r.allocations;
      const positions = partnerPositions(
        shares.map((s) => ({ partnerId: s.partnerId, accountId: s.accountId })),
        ledger,
        allocations,
      );
      expect(positions.map((p) => p.balance)).toEqual(expected);
    }
  });
});

describe('worked example from the plan: loss, sale money into the wallet', () => {
  // wallet bought for 1 000.00, you paid 200.00, the sale brought 900.00 into the wallet
  const base = input({
    costs: new Map([
      [W, 100000],
      [YOU, 20000],
    ]),
    receipts: new Map([[W, 90000]]),
  });

  it('keep in wallet: −150 each, wallet pays you back 200', () => {
    const r = settle(base);
    expect(r.profit).toBe(-30000);
    expect(r.allocations).toEqual([
      { partnerId: 'you', amount: -15000 },
      { partnerId: 'friend', amount: -15000 },
    ]);
    expect(r.transfers).toEqual([{ from: W, to: YOU, amount: 20000 }]);
  });

  it('pay out: friend → wallet 100, friend → you 50', () => {
    const r = settle({ ...base, mode: 'payout' });
    expect(r.transfers).toEqual([
      { from: FRIEND, to: W, amount: 10000 },
      { from: FRIEND, to: YOU, amount: 5000 },
    ]);
    expect(applyTransfers(r.held, r.transfers)).toEqual(nonZero(r.targets));
  });

  it('without reimbursing, nothing moves in retain mode', () => {
    expect(settle({ ...base, reimburse: false }).transfers).toEqual([]);
  });
});

describe('more cases', () => {
  it('a job that belongs to one person: they keep the cash and pay back the stock used', () => {
    // 30.00 of parts from stock, customer paid you 120.00, all profit to you, pay out
    const r = settle(
      input({
        shares: [
          { partnerId: 'you', accountId: YOU, bp: 10000 },
          { partnerId: 'friend', accountId: FRIEND, bp: 0 },
        ],
        costs: new Map([[W, 3000]]),
        receipts: new Map([[YOU, 12000]]),
        mode: 'payout',
      }),
    );
    expect(r.profit).toBe(9000);
    expect(r.allocations).toEqual([{ partnerId: 'you', amount: 9000 }]);
    expect(r.transfers).toEqual([{ from: YOU, to: W, amount: 3000 }]);
  });

  it('three partners and payments split between people', () => {
    const C = 'acc-c';
    const r = settle(
      input({
        shares: [
          { partnerId: 'you', accountId: YOU, bp: 3334 },
          { partnerId: 'friend', accountId: FRIEND, bp: 3333 },
          { partnerId: 'c', accountId: C, bp: 3333 },
        ],
        costs: new Map([
          [W, 50000],
          [C, 10001],
        ]),
        receipts: new Map([
          [YOU, 40000],
          [FRIEND, 40000],
        ]),
        mode: 'payout',
      }),
    );
    expect(r.allocations.reduce((s, a) => s + a.amount, 0)).toBe(r.profit);
    expect(applyTransfers(r.held, r.transfers)).toEqual(nonZero(r.targets));
    expect(r.transfers.length).toBeLessThanOrEqual(3);
  });

  it('nothing to move when everything is already where it belongs', () => {
    const r = settle(input({ costs: new Map([[W, 1000]]), receipts: new Map([[W, 1500]]) }));
    expect(r.transfers).toEqual([]);
    expect(r.allocations).toEqual([
      { partnerId: 'you', amount: 250 },
      { partnerId: 'friend', amount: 250 },
    ]);
  });

  it('a scrapped car with no income: everyone shares the loss, pay back pockets from the wallet', () => {
    const r = settle(input({ costs: new Map([[W, 80000], [FRIEND, 5000]]), receipts: new Map() }));
    expect(r.profit).toBe(-85000);
    // the wallet has no car money to pay from, so the friend is paid back from wallet cash
    expect(r.transfers).toEqual([{ from: W, to: FRIEND, amount: 5000 }]);
  });
});

describe('minimalTransfers', () => {
  it('refuses totals that do not match', () => {
    expect(() => minimalTransfers(new Map([['a', 100]]), new Map([['b', 50]]))).toThrow();
  });
});

describe('ledger', () => {
  it('computes the wallet balance and partner positions', () => {
    const entries: LedgerEntry[] = [
      { from: YOU, to: W, amount: 100000 }, // deposit
      { from: FRIEND, to: W, amount: 50000 }, // deposit
      { from: W, to: 'ext', amount: 30000 }, // expense from wallet
      { from: YOU, to: 'ext', amount: 2000 }, // you paid something
      { from: W, to: FRIEND, amount: 10000 }, // withdrawal
    ];
    expect(accountBalance(W, entries)).toBe(110000);
    const [you, friend] = partnerPositions(
      shares.map((s) => ({ partnerId: s.partnerId, accountId: s.accountId })),
      entries,
      [
        { partnerId: 'you', amount: -1000 },
        { partnerId: 'friend', amount: -1000 },
      ],
    );
    expect(you).toMatchObject({ putIn: 102000, takenOut: 0, profitShare: -1000, balance: 101000 });
    expect(friend).toMatchObject({ putIn: 50000, takenOut: 10000, profitShare: -1000, balance: 39000 });
  });
});

describe('carFunding', () => {
  it('collects costs by payer (stock = wallet) and sale money by receiver', () => {
    const { costs, receipts } = carFunding(
      [
        { category: 'car_purchase', from: W, to: 'ext', amount: 100000 },
        { category: 'car_part', from: YOU, to: 'ext', amount: 12000 },
        { category: 'car_part', from: YOU, to: 'ext', amount: 8000 },
        { category: 'car_cost', from: FRIEND, to: 'ext', amount: 3000 },
        { category: 'car_sale', from: 'ext', to: YOU, amount: 150000 },
        { category: 'car_sale', from: 'ext', to: W, amount: 50000 },
        { category: 'settlement', from: YOU, to: W, amount: 1 },
      ],
      5000,
      W,
    );
    expect(Object.fromEntries(costs)).toEqual({ [W]: 105000, [YOU]: 20000, [FRIEND]: 3000 });
    expect(Object.fromEntries(receipts)).toEqual({ [YOU]: 150000, [W]: 50000 });
  });
});

describe('jobFunding', () => {
  it('bought parts are costs, payments are receipts, stock is the wallet', () => {
    const { costs, receipts } = carFunding(
      [
        { category: 'job_part', from: YOU, to: 'ext', amount: 4000 },
        { category: 'job_payment', from: 'ext', to: FRIEND, amount: 13500 },
      ],
      3000,
      W,
    );
    expect(Object.fromEntries(costs)).toEqual({ [YOU]: 4000, [W]: 3000 });
    expect(Object.fromEntries(receipts)).toEqual({ [FRIEND]: 13500 });
  });
});
