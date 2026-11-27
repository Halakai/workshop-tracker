import { describe, expect, it } from 'vitest';
import { canBePrivate, carTab, carTitle, carTotals, hasWorkshopMoney, isClosed, nextCarRef, ownerLabel, ownerOptions, ownerText, resolveOwner } from './cars';

const money = { purchase: 100000, stock: 5000, parts: 20000, otherCosts: 7500, sale: 0 };

describe('car totals', () => {
  it('adds up everything invested while the car is in progress', () => {
    expect(carTotals(money, 'in_repair')).toEqual({ invested: 132500, sale: 0, profit: null, marginBp: null, roiBp: null });
  });

  it('shows profit, margin and ROI once sold', () => {
    const t = carTotals({ ...money, sale: 200000 }, 'sold');
    expect(t.invested).toBe(132500);
    expect(t.profit).toBe(67500);
    expect(t.marginBp).toBe(3375); // 675 / 2000 = 33.75 %
    expect(t.roiBp).toBe(5094); // 675 / 1325 = 50.94 %
  });

  it('handles a loss', () => {
    const t = carTotals({ ...money, sale: 90000 }, 'sold');
    expect(t.profit).toBe(-42500);
    expect(t.marginBp).toBe(-4722);
  });

  it('a scrapped car without income is a full loss', () => {
    const t = carTotals(money, 'scrapped');
    expect(t.profit).toBe(-132500);
    expect(t.marginBp).toBeNull();
    expect(t.roiBp).toBe(-10000);
  });

  it('knows which statuses are closed', () => {
    expect(isClosed('sold')).toBe(true);
    expect(isClosed('scrapped')).toBe(true);
    expect(isClosed('listed')).toBe(false);
  });
});

describe('car helpers', () => {
  it('numbers cars', () => {
    expect(nextCarRef([])).toBe('CAR-001');
    expect(nextCarRef(['CAR-001', 'car-004'])).toBe('CAR-005');
  });

  it('builds a title', () => {
    expect(carTitle({ year: 2012, make: 'Škoda', model: 'Octavia' })).toBe('2012 Škoda Octavia');
    expect(carTitle({ year: null, make: 'VW', model: 'Golf' })).toBe('VW Golf');
    expect(carTitle({ year: 2001, make: 'Volkswagen', model: 'Golf', generation: 'IV (1J)' })).toBe('2001 Volkswagen Golf IV (1J)');
  });
});

const ME = 'me';
const people = {
  meId: ME,
  members: [
    { id: 'p', display_name: 'Marko', is_active: true },
    { id: ME, display_name: 'Ivan', is_active: true },
    { id: 'old', display_name: 'Gone', is_active: false },
  ],
  contacts: [
    { id: 'c1', name: 'Ana Horvat' },
    { id: 'c2', name: 'Marko' },
    { id: 'c3', name: 'Đuro Šimić' },
  ],
};

describe('car owners', () => {
  it('puts each car on its tab', () => {
    expect(carTab({ owner_kind: 'workshop', for_sale: true })).toBe('sale');
    expect(carTab({ owner_kind: 'workshop', for_sale: false })).toBe('ours');
    expect(carTab({ owner_kind: 'member', for_sale: false })).toBe('ours');
    expect(carTab({ owner_kind: 'customer', for_sale: false })).toBe('customers');
  });

  it('reads what was typed as the owner', () => {
    expect(resolveOwner('', people)).toBeNull();
    expect(resolveOwner(' workshop ', people)).toEqual({ kind: 'workshop' });
    expect(resolveOwner('ivan', people)).toEqual({ kind: 'member', memberId: ME, name: 'Ivan', me: true });
    // a member wins over a contact with the same name
    expect(resolveOwner('Marko', people)).toEqual({ kind: 'member', memberId: 'p', name: 'Marko', me: false });
    expect(resolveOwner('duro simic', people)).toEqual({ kind: 'customer', name: 'Đuro Šimić', contactId: 'c3' });
    expect(resolveOwner('Petar Novak', people)).toEqual({ kind: 'customer', name: 'Petar Novak', contactId: null });
  });

  it('suggests the workshop, you, the other members, then contacts', () => {
    expect(ownerOptions(people)).toEqual(['Workshop', 'Ivan', 'Marko', 'Ana Horvat', 'Đuro Šimić']);
  });

  it('names the owner', () => {
    const car = { owner_kind: 'member', owner_member_id: ME, owner_contact_id: null, for_sale: false, is_private: true };
    expect(ownerLabel(car, { members: people.members, meId: ME })).toBe('Mine');
    expect(ownerLabel({ ...car, owner_member_id: 'p' }, { members: people.members, meId: ME })).toBe('Marko’s');
    expect(ownerLabel({ ...car, owner_kind: 'workshop', owner_member_id: null, for_sale: true }, { members: [], meId: ME })).toBe('Workshop');
    expect(ownerLabel({ ...car, owner_kind: 'workshop', owner_member_id: null }, { members: [], meId: ME })).toBe('Workshop vehicle');
    expect(ownerLabel({ ...car, owner_kind: 'customer', owner_member_id: null, owner_contact_id: 'c1' }, { members: [], meId: ME, contactName: 'Ana Horvat' })).toBe('Ana Horvat');
    expect(ownerText({ ...car, owner_kind: 'customer', owner_member_id: null, owner_contact_id: 'c1' }, people)).toBe('Ana Horvat');
    expect(ownerText({ ...car, owner_kind: 'workshop', owner_member_id: null }, people)).toBe('Workshop');
  });

  it('offers privacy only on your own car that you added', () => {
    const mine = resolveOwner('Ivan', people);
    expect(canBePrivate(mine, undefined, ME)).toBe(true);
    expect(canBePrivate(mine, ME, ME)).toBe(true);
    expect(canBePrivate(mine, 'p', ME)).toBe(false);
    expect(canBePrivate(resolveOwner('Marko', people), undefined, ME)).toBe(false);
    expect(canBePrivate(resolveOwner('Workshop', people), undefined, ME)).toBe(false);
  });

  it('knows which cars have workshop money', () => {
    expect(hasWorkshopMoney({ owner_kind: 'workshop' })).toBe(true);
    expect(hasWorkshopMoney({ owner_kind: 'member' })).toBe(false);
  });
});
