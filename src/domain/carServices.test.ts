import { describe, expect, it } from 'vitest';
import { historyTotals, latestMileage, newestFirst, serviceTotal } from './carServices';
import { badNumbers, cleanDetails, dotAgeYears, dotLabel, partKind, partSummary, PART_KINDS } from './carParts';

describe('service totals', () => {
  it('add the work, parts, costs and stock', () => {
    // small service on a private car: oil 45€ + filters 25€ + work 50€
    expect(serviceTotal({ labor: 5000, parts: [4500, 2500], costs: [], stock: [] })).toBe(12000);
    // on a flip: a bought part, another cost and oil from stock
    expect(serviceTotal({ labor: null, parts: [], costs: [2500, 4000], stock: [3200] })).toBe(9700);
    // parts without a price count as nothing
    expect(serviceTotal({ labor: null, parts: [null, 1000], costs: [], stock: [] })).toBe(1000);
  });
});

describe('history', () => {
  it('lists the newest first, and the latest added first on the same day', () => {
    const list = [
      { id: 'a', date: '2026-03-12', created: '2026-03-12T10:00:00Z' },
      { id: 'b', date: '2026-11-01', created: '2026-11-01T08:00:00Z' },
      { id: 'c', date: '2026-03-12', created: '2026-03-13T09:00:00Z' },
    ];
    expect(newestFirst(list).map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('knows the highest mileage and when it was read', () => {
    expect(latestMileage([])).toBeNull();
    expect(latestMileage([{ km: null, date: '2026-01-01' }])).toBeNull();
    expect(
      latestMileage([
        { km: 214000, date: null },
        { km: 236900, date: '2026-05-21' },
        { km: 251300, date: '2026-11-21' },
        { km: 240000, date: '2026-08-01' },
      ]),
    ).toEqual({ km: 251300, date: '2026-11-21' });
  });

  it('adds up all of it and this year', () => {
    expect(
      historyTotals(
        [
          { date: '2026-03-12', total: 12000 },
          { date: '2025-10-01', total: 30000 },
          { date: '2026-11-01', total: 5000 },
        ],
        2026,
      ),
    ).toEqual({ all: 47000, thisYear: 17000 });
  });
});

describe('part kinds', () => {
  it('match the database list', () => {
    expect(PART_KINDS.map((k) => k.value)).toEqual([
      'tyres', 'wheels', 'battery', 'oil', 'filter', 'brakes', 'wipers', 'bulbs', 'suspension', 'timing', 'clutch', 'plugs', 'coolant', 'other',
    ]);
    expect(partKind('nonsense').value).toBe('other');
  });

  it('keep only their own, filled-in, valid details', () => {
    expect(
      cleanDetails('tyres', { season: 'winter', size: ' 205/55 R16 ', dot: '3823', count: '4', tread_mm: '7,5', capacity_ah: '74', on_rims: 'maybe', load_speed: '' }),
    ).toEqual({ season: 'winter', size: '205/55 R16', dot: '3823', count: '4', tread_mm: '7.5' });
    expect(cleanDetails('other', { size: '1' })).toEqual({});
    expect(badNumbers('battery', { capacity_ah: '74Ah', cca: '680' })).toEqual(['capacity_ah']);
  });

  it('read as one line', () => {
    expect(partSummary('tyres', { season: 'winter', size: '205/55 R16', load_speed: '91H', dot: '3823', count: '4', on_rims: 'yes' })).toBe(
      'Winter · 205/55 R16 · 91H · made 38/2023 · ×4 · On rims',
    );
    expect(partSummary('battery', { capacity_ah: '74', cca: '680', technology: 'agm', warranty_until: '2028-03-12' })).toBe(
      '74 Ah · 680 A · AGM · warranty to 12.03.2028',
    );
    expect(partSummary('filter', { filter_type: 'cabin' })).toBe('Cabin / pollen filter');
    expect(partSummary('oil', { viscosity: '5W-30', litres: '4.3' })).toBe('5W-30 · 4.3 L');
    expect(partSummary('tyres', null)).toBe('');
  });

  it('read a tyre’s DOT date and age', () => {
    expect(dotLabel('3823')).toBe('made 38/2023');
    expect(dotLabel('9923')).toBeNull();
    expect(dotLabel('DOT')).toBeNull();
    expect(dotAgeYears('3819', '2026-11-27')).toBe(7);
    expect(dotAgeYears('0126', '2026-11-27')).toBe(0);
  });
});
