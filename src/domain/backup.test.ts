import { describe, expect, it } from 'vitest';
import { applyPeopleMap, backupCounts, backupPeople, BackupError, mappingProblem, matchPeople, parseBackup, type Backup } from './backup';

const OLD_DAVID = '11111111-1111-4111-8111-111111111111';
const OLD_IVAN = '22222222-2222-4222-8222-222222222222';
const NEW_DAVID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NEW_IVAN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const backup: Backup = {
  app: 'workshop-tracker',
  exported_at: '2026-10-10T12:00:00Z',
  tables: {
    profiles: [
      { id: OLD_DAVID, display_name: 'David', email: 'david@example.com' },
      { id: OLD_IVAN, display_name: 'Ivan', email: 'ivan@example.com' },
    ],
    accounts: [{ id: 'acc-1', kind: 'partner', partner_id: OLD_IVAN }],
    cars: [{ id: 'car-1', make: 'VW', created_by: OLD_DAVID, updated_by: OLD_IVAN, year: 2004, notes: null }],
    transactions: [{ id: 't1' }, { id: 't2' }],
  },
};

describe('parseBackup', () => {
  it('reads a backup', () => {
    expect(parseBackup(JSON.stringify(backup)).tables.cars).toHaveLength(1);
  });
  it('explains what is wrong with other files', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"app":"other","tables":{}}')).toThrow(/isn’t a Workshop Tracker backup/);
    expect(() => parseBackup('{"app":"workshop-tracker","tables":{"accounts":[],"cars":{}}}')).toThrow(/damaged \(cars/);
    expect(() => parseBackup('{"app":"workshop-tracker","tables":{}}')).toThrow(/no money accounts/);
  });
});

describe('matching people to users', () => {
  const people = backupPeople(backup);

  it('keeps the same user when the ids still exist (same project)', () => {
    const users = [
      { id: OLD_DAVID, name: 'David', email: 'david@example.com' },
      { id: OLD_IVAN, name: 'Ivan', email: 'ivan@example.com' },
    ];
    expect([...matchPeople(people, users)]).toEqual([
      [OLD_DAVID, OLD_DAVID],
      [OLD_IVAN, OLD_IVAN],
    ]);
  });

  it('matches by email, then by name, in a new project', () => {
    const users = [
      { id: NEW_IVAN, name: 'Ivan K.', email: 'IVAN@example.com' },
      { id: NEW_DAVID, name: 'david', email: 'new@example.com' },
    ];
    expect(matchPeople(people, users).get(OLD_IVAN)).toBe(NEW_IVAN);
    expect(matchPeople(people, users).get(OLD_DAVID)).toBe(NEW_DAVID);
  });

  it('leaves people without a fitting user open, and uses each user once', () => {
    const users = [{ id: NEW_DAVID, name: 'David', email: 'ivan@example.com' }];
    const map = matchPeople(people, users);
    expect(map.get(OLD_IVAN)).toBe(NEW_DAVID); // email wins over name
    expect(map.get(OLD_DAVID)).toBeNull();
    expect(mappingProblem(map, people)).toBe('Choose who David is now.');
  });

  it('refuses two people on one user', () => {
    const map = new Map([
      [OLD_DAVID, NEW_DAVID],
      [OLD_IVAN, NEW_DAVID],
    ]);
    expect(mappingProblem(map, people)).toMatch(/can’t be the same user/);
    expect(mappingProblem(new Map([[OLD_DAVID, NEW_DAVID], [OLD_IVAN, NEW_IVAN]]), people)).toBeNull();
  });
});

describe('applyPeopleMap', () => {
  it('swaps person ids everywhere and leaves everything else alone', () => {
    const mapped = applyPeopleMap(
      backup,
      new Map([
        [OLD_DAVID, NEW_DAVID],
        [OLD_IVAN, NEW_IVAN],
      ]),
    );
    expect(mapped.tables.cars[0]).toEqual({ id: 'car-1', make: 'VW', created_by: NEW_DAVID, updated_by: NEW_IVAN, year: 2004, notes: null });
    expect(mapped.tables.accounts[0].partner_id).toBe(NEW_IVAN);
    expect(mapped.tables.profiles.map((p) => p.id)).toEqual([NEW_DAVID, NEW_IVAN]);
    expect(backup.tables.cars[0].created_by).toBe(OLD_DAVID); // original untouched
  });

  it('returns the same backup when nothing changes', () => {
    expect(applyPeopleMap(backup, new Map([[OLD_DAVID, OLD_DAVID]]))).toBe(backup);
  });
});

describe('backupCounts', () => {
  it('counts the main things', () => {
    expect(backupCounts(backup)).toEqual({ cars: 1, jobs: 0, items: 0, money: 2, contacts: 0 });
  });
});
