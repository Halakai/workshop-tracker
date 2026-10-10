import { describe, expect, it } from 'vitest';
import {
  applyDelta,
  averageUnitCost,
  buildAdjustment,
  buildOverheadUse,
  buildPurchase,
  adjustmentDelta,
  countDelta,
  isLowStock,
  issueDelta,
  purchaseDelta,
  type StockLevel,
} from './stock';

const empty: StockLevel = { qty: 0, value: 0 };
const half = [
  { id: 'a', bp: 5000 },
  { id: 'b', bp: 5000 },
];

describe('moving weighted average', () => {
  it('averages purchases at different prices', () => {
    // 5 L at 6.00€/L, then 5 L at 8.00€/L → 10 L worth 70.00€ → 7.00€/L
    let stock = applyDelta(empty, purchaseDelta(5000, 3000));
    stock = applyDelta(stock, purchaseDelta(5000, 4000));
    expect(stock).toEqual({ qty: 10000, value: 7000 });
    expect(averageUnitCost(stock)).toBe(700);
  });

  it('charges 4.5 L of oil at the average cost', () => {
    const stock = { qty: 10000, value: 7000 };
    expect(issueDelta(stock, 4500)).toEqual({ qty: -4500, value: -3150 });
  });

  it('rounds each use but leaves no crumbs when the stock is used up', () => {
    // 3 pcs bought for 10.00€ → 3.333€ each
    let stock = applyDelta(empty, purchaseDelta(3000, 1000));
    const first = issueDelta(stock, 1000);
    expect(first.value).toBe(-333);
    stock = applyDelta(stock, first);
    const second = issueDelta(stock, 1000);
    expect(second.value).toBe(-334); // 667 × 1/2 = 333.5 → 334
    stock = applyDelta(stock, second);
    const last = issueDelta(stock, 1000);
    expect(last.value).toBe(-333); // everything that's left
    stock = applyDelta(stock, last);
    expect(stock).toEqual({ qty: 0, value: 0 });
    expect(first.value + second.value + last.value).toBe(-1000);
  });

  it('total cost of everything used equals what was paid, whatever the order', () => {
    let stock = empty;
    let paid = 0;
    let used = 0;
    const steps: Array<['buy', number, number] | ['use', number]> = [
      ['buy', 4000, 2399],
      ['use', 1500],
      ['buy', 2500, 1801],
      ['use', 333],
      ['use', 2000],
      ['buy', 1000, 777],
      ['use', 3667],
    ];
    for (const step of steps) {
      if (step[0] === 'buy') {
        stock = applyDelta(stock, purchaseDelta(step[1], step[2]));
        paid += step[2];
      } else {
        const d = issueDelta(stock, step[1]);
        stock = applyDelta(stock, d);
        used -= d.value;
      }
    }
    expect(stock).toEqual({ qty: 0, value: 0 });
    expect(used).toBe(paid);
  });

  it('refuses to use more than is in stock', () => {
    expect(() => issueDelta({ qty: 1000, value: 500 }, 1500)).toThrow('Not enough');
    expect(() => issueDelta({ qty: 1000, value: 500 }, 0)).toThrow();
  });

  it('handles free stock (value 0)', () => {
    const stock = applyDelta(empty, purchaseDelta(2000, 0));
    expect(averageUnitCost(stock)).toBe(0);
    expect(issueDelta(stock, 1000)).toEqual({ qty: -1000, value: 0 });
  });

  it('has no average cost when empty', () => {
    expect(averageUnitCost(empty)).toBeNull();
  });
});

describe('stock counts', () => {
  const stock = { qty: 10000, value: 7000 };

  it('counting less takes the difference out at average cost', () => {
    expect(countDelta(stock, 8000)).toEqual({ qty: -2000, value: -1400 });
  });

  it('counting more adds the difference at average cost', () => {
    expect(countDelta(stock, 11000)).toEqual({ qty: 1000, value: 700 });
  });

  it('opening stock needs a unit cost', () => {
    expect(() => countDelta(empty, 5000)).toThrow('worth');
    expect(countDelta(empty, 5000, 1250)).toEqual({ qty: 5000, value: 6250 });
    expect(countDelta(empty, 500, 999)).toEqual({ qty: 500, value: 500 }); // 0.5 × 9.99 = 4.995 → 5.00
  });

  it('a matching count is not a correction', () => {
    expect(() => countDelta(stock, 10000)).toThrow();
  });
});

describe('low stock', () => {
  it('is low at or below the minimum, only when a minimum is set', () => {
    expect(isLowStock(2000, 2000)).toBe(true);
    expect(isLowStock(1000, 2000)).toBe(true);
    expect(isLowStock(3000, 2000)).toBe(false);
    expect(isLowStock(0, 0)).toBe(false);
  });
});

describe('movement builders', () => {
  it('purchase records the payer only when it cost something', () => {
    expect(buildPurchase({ qty: 5000, totalCost: 4500, paidBy: 'acc', occurredOn: '2026-10-10' })).toMatchObject({
      type: 'purchase',
      delta: { qty: 5000, value: 4500 },
      paidBy: 'acc',
      allocations: [],
    });
    expect(buildPurchase({ qty: 1000, totalCost: 0, paidBy: null, occurredOn: '2026-10-10' }).paidBy).toBeUndefined();
    expect(() => buildPurchase({ qty: 1000, totalCost: 100, paidBy: null, occurredOn: '2026-10-10' })).toThrow('who paid');
  });

  it('overhead use is split between partners and adds up to the cost', () => {
    const m = buildOverheadUse({ stock: { qty: 3000, value: 1001 }, qty: 1000, shares: half, occurredOn: '2026-10-10' });
    expect(m.delta).toEqual({ qty: -1000, value: -334 });
    expect(m.allocations).toEqual([
      { partnerId: 'a', amount: -167 },
      { partnerId: 'b', amount: -167 },
    ]);
    expect(m.allocations.reduce((s, a) => s + a.amount, 0)).toBe(m.delta.value);
  });

  it('free overhead has no allocations', () => {
    expect(buildOverheadUse({ stock: { qty: 1000, value: 0 }, qty: 1000, shares: half, occurredOn: '2026-10-10' }).allocations).toEqual([]);
  });

  it('adjustments are split by shares and add up to the value change', () => {
    const m = buildAdjustment({ stock: { qty: 2000, value: 1001 }, mode: 'found', amount: 1000, shares: half, occurredOn: '2026-10-10' });
    expect(m).toMatchObject({ type: 'adjustment', reason: 'Found', delta: { qty: 1000, value: 501 } });
    expect(m.allocations.reduce((s, a) => s + a.amount, 0)).toBe(501);
  });
});

describe('adjustment modes', () => {
  const stock = { qty: 3000, value: 5400 }; // 3 L at 18.00€/L

  it('damaged and lost take the entered amount out at average cost', () => {
    expect(adjustmentDelta(stock, 'damaged', 1235)).toEqual({ qty: -1235, value: -2223 });
    expect(adjustmentDelta(stock, 'lost', 3000)).toEqual({ qty: -3000, value: -5400 });
    expect(() => adjustmentDelta(stock, 'lost', 3500)).toThrow('Not enough');
  });

  it('found adds the entered amount at average cost, or at a unit cost when empty', () => {
    expect(adjustmentDelta(stock, 'found', 500)).toEqual({ qty: 500, value: 900 });
    expect(adjustmentDelta({ qty: 0, value: 0 }, 'found', 2000, 450)).toEqual({ qty: 2000, value: 900 });
    expect(() => adjustmentDelta({ qty: 0, value: 0 }, 'found', 2000)).toThrow('worth');
  });

  it('count takes the counted total', () => {
    expect(adjustmentDelta(stock, 'count', 2000)).toEqual({ qty: -1000, value: -1800 });
  });

  it('stores a readable reason; counting an empty item is opening stock', () => {
    expect(buildAdjustment({ stock: { qty: 0, value: 0 }, mode: 'count', amount: 4000, unitCostIfEmpty: 550, shares: half, occurredOn: '2026-10-10' }).reason).toBe('Opening stock');
    expect(buildAdjustment({ stock, mode: 'count', amount: 1000, shares: half, occurredOn: '2026-10-10' }).reason).toBe('Stock count');
    expect(buildAdjustment({ stock, mode: 'damaged', amount: 1000, shares: half, occurredOn: '2026-10-10' }).reason).toBe('Damaged');
  });
});
