import { describe, expect, it } from 'vitest';
import { conditionLabel, daysBetween, goneLabel, lentSince, nextToolCode, toolTotals, warrantyState } from './tools';

describe('tool IDs', () => {
  it('numbers tools T-001, T-002 … after the highest one', () => {
    expect(nextToolCode([])).toBe('T-001');
    expect(nextToolCode(['T-001', 'T-007', 'CUSTOM'])).toBe('T-008');
    expect(nextToolCode(['t-002'])).toBe('T-003');
  });
});

describe('labels', () => {
  it('names conditions and reasons a tool is gone', () => {
    expect(conditionLabel('needs_repair')).toBe('Needs repair');
    expect(goneLabel('scrapped')).toBe('Thrown away');
    expect(goneLabel('something')).toBe('something');
  });
});

describe('dates', () => {
  it('counts whole days, across months and leap days', () => {
    expect(daysBetween('2026-10-10', '2026-10-10')).toBe(0);
    expect(daysBetween('2026-09-30', '2026-10-02')).toBe(2);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-10-12', '2026-10-10')).toBe(-2);
  });

  it('says how long a tool has been away', () => {
    expect(lentSince('2026-10-10', '2026-10-10')).toBe('since 10.10.2026 (today)');
    expect(lentSince('2026-10-09', '2026-10-10')).toBe('since 09.10.2026 (1 day)');
    expect(lentSince('2026-09-10', '2026-10-10')).toBe('since 10.09.2026 (30 days)');
  });

  it('tells whether the warranty still runs', () => {
    expect(warrantyState(null, '2026-10-10')).toBeNull();
    expect(warrantyState('2028-01-01', '2026-10-10')).toEqual({ over: false, text: 'until 01.01.2028' });
    expect(warrantyState('2026-11-09', '2026-10-10')).toEqual({ over: false, text: 'until 09.11.2026 (30 days left)' });
    expect(warrantyState('2026-10-10', '2026-10-10')).toEqual({ over: false, text: 'until 10.10.2026 (last day)' });
    expect(warrantyState('2026-10-09', '2026-10-10')).toEqual({ over: true, text: 'ended 09.10.2026' });
  });
});

describe('totals', () => {
  it('counts only tools still owned', () => {
    const tools = [
      { price_cents: 12000, gone_on: null, lent_to: null, condition: 'good' },
      { price_cents: null, gone_on: null, lent_to: 'Marko', condition: 'needs_repair' },
      { price_cents: 50000, gone_on: '2026-01-01', lent_to: null, condition: 'broken' },
      { price_cents: 3000, gone_on: null, lent_to: null, condition: 'broken' },
    ];
    expect(toolTotals(tools)).toEqual({ count: 3, value: 15000, lent: 1, needsWork: 2 });
  });
});
