// What a car cost us and what we made on it.
//   invested = purchase + parts from stock (net of returns) + parts bought for it + other costs
//   profit   = sale − invested            (once the car is sold or scrapped)
//   margin   = profit ÷ sale,  ROI = profit ÷ invested   (basis points: 2345 = 23.45 %)
import { mulDivRound, type Cents } from './money';
import { nextPartNumber } from './codes';
import { fold } from './search';

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

// ---------------------------------------------------------------------------
// Owners (docs/PLAN.md §13)
//   workshop  flips (for sale) and the workshop's own vehicles: money as before
//   member    a member's own car, private when its owner added it and wants it so
//   customer  someone else's car (a contact); work on it goes through jobs
// ---------------------------------------------------------------------------

export type OwnerKind = 'workshop' | 'member' | 'customer';

export interface CarOwnerFields {
  owner_kind: string;
  owner_member_id: string | null;
  owner_contact_id: string | null;
  for_sale: boolean;
  is_private: boolean;
  created_by?: string | null;
}

/** The three tabs of the Cars page. */
export type CarTab = 'sale' | 'ours' | 'customers';

export const CAR_TABS: { value: CarTab; label: string }[] = [
  { value: 'sale', label: 'For sale' },
  { value: 'ours', label: 'Ours' },
  { value: 'customers', label: 'Customers' },
];

export function carTab(car: Pick<CarOwnerFields, 'owner_kind' | 'for_sale'>): CarTab {
  if (car.owner_kind === 'customer') return 'customers';
  return car.owner_kind === 'workshop' && car.for_sale ? 'sale' : 'ours';
}

/** Purchase, status, shares, costs and sale: only the workshop's cars have money. */
export function hasWorkshopMoney(car: Pick<CarOwnerFields, 'owner_kind'>): boolean {
  return car.owner_kind === 'workshop';
}

/** The word the owner field shows for the workshop. */
export const WORKSHOP_OWNER = 'Workshop';

export interface OwnerPeople {
  members: readonly { id: string; display_name: string; is_active?: boolean }[];
  contacts: readonly { id: string; name: string }[];
  meId: string;
}

export type OwnerChoice =
  | { kind: 'workshop' }
  | { kind: 'member'; memberId: string; name: string; me: boolean }
  /** contactId null: a new contact, added when the car is saved */
  | { kind: 'customer'; name: string; contactId: string | null };

const same = (a: string, b: string) => fold(a.trim()) === fold(b.trim());

/** What a typed owner means: the workshop, a member (by name), a known contact, or a new outside owner. */
export function resolveOwner(text: string, people: OwnerPeople): OwnerChoice | null {
  const name = text.trim();
  if (!name) return null;
  if (same(name, WORKSHOP_OWNER)) return { kind: 'workshop' };
  const member = people.members.find((m) => same(m.display_name, name));
  if (member) return { kind: 'member', memberId: member.id, name: member.display_name, me: member.id === people.meId };
  const contact = people.contacts.find((c) => same(c.name, name));
  return contact ? { kind: 'customer', name: contact.name, contactId: contact.id } : { kind: 'customer', name, contactId: null };
}

/** Suggestions for the owner field: the workshop, then you, the other members, then contacts. */
export function ownerOptions(people: OwnerPeople): string[] {
  const me = people.members.filter((m) => m.id === people.meId);
  const others = people.members.filter((m) => m.id !== people.meId && m.is_active !== false);
  const memberNames = [...me, ...others].map((m) => m.display_name);
  const contacts = people.contacts
    .map((c) => c.name)
    .filter((n) => !same(n, WORKSHOP_OWNER) && !memberNames.some((m) => same(m, n)));
  return [WORKSHOP_OWNER, ...memberNames, ...contacts];
}

/** The owner field's text for a saved car. */
export function ownerText(car: CarOwnerFields, people: Omit<OwnerPeople, 'meId'>): string {
  if (car.owner_kind === 'member') return people.members.find((m) => m.id === car.owner_member_id)?.display_name ?? '';
  if (car.owner_kind === 'customer') return people.contacts.find((c) => c.id === car.owner_contact_id)?.name ?? '';
  return WORKSHOP_OWNER;
}

/** "Workshop", "Mine", "Marko's", "Ana Horvat" — as cards and the car page name the owner. */
export function ownerLabel(car: CarOwnerFields, people: { members: OwnerPeople['members']; meId: string; contactName?: string | null }): string {
  if (car.owner_kind === 'member') {
    if (car.owner_member_id === people.meId) return 'Mine';
    const name = people.members.find((m) => m.id === car.owner_member_id)?.display_name;
    return name ? `${name}’s` : 'A partner’s';
  }
  if (car.owner_kind === 'customer') return people.contactName ?? 'Customer';
  return car.for_sale ? 'Workshop' : 'Workshop vehicle';
}

/**
 * Whether the "only I can see it" switch is offered: the car is (or will be) yours and you added it.
 * A car added for another member is always visible to everyone.
 */
export function canBePrivate(owner: OwnerChoice | null, createdBy: string | null | undefined, meId: string): boolean {
  return owner?.kind === 'member' && owner.me && (createdBy == null || createdBy === meId);
}
