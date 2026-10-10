// Backup files (More → Backup & restore): reading them back in.
//   { app: 'workshop-tracker', version, exported_at, tables: { profiles: […], cars: […], … } }
// People are matched to the users that exist now (same id, else same email, else same name), so a
// backup can also be loaded into a fresh Supabase project where everyone got a new user id.

export type BackupRow = Record<string, unknown>;

export interface Backup {
  app: 'workshop-tracker';
  version?: number;
  exported_at?: string;
  tables: Record<string, BackupRow[]>;
}

export interface Person {
  id: string;
  name: string;
  email: string | null;
}

export class BackupError extends Error {}

/** Reads a backup file's text; throws a BackupError with a plain explanation when it isn't one. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('This file isn’t a backup (it isn’t JSON). Choose the .json file from Backup & export.');
  }
  const b = data as Partial<Backup> | null;
  if (!b || typeof b !== 'object' || b.app !== 'workshop-tracker' || !b.tables || typeof b.tables !== 'object') {
    throw new BackupError('This file isn’t a Workshop Tracker backup.');
  }
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!Array.isArray(rows)) throw new BackupError(`The backup is damaged (${name} isn’t a list).`);
  }
  if (!Array.isArray(b.tables.accounts)) throw new BackupError('The backup is incomplete: it has no money accounts.');
  return b as Backup;
}

export function backupPeople(backup: Backup): Person[] {
  return (backup.tables.profiles ?? []).map((p) => ({
    id: String(p.id),
    name: typeof p.display_name === 'string' ? p.display_name : 'Unknown',
    email: typeof p.email === 'string' ? p.email : null,
  }));
}

/** Backup person id → current user id (or null when nobody fits). Each user is used once at most. */
export function matchPeople(people: readonly Person[], users: readonly Person[]): Map<string, string | null> {
  const result = new Map<string, string | null>(people.map((p) => [p.id, null]));
  const used = new Set<string>();
  const same = (a: string | null, b: string | null) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
  const rules: ((p: Person, u: Person) => boolean)[] = [
    (p, u) => p.id === u.id,
    (p, u) => same(p.email, u.email),
    (p, u) => same(p.name, u.name),
  ];
  for (const rule of rules) {
    for (const p of people) {
      if (result.get(p.id)) continue;
      const user = users.find((u) => !used.has(u.id) && rule(p, u));
      if (user) {
        result.set(p.id, user.id);
        used.add(user.id);
      }
    }
  }
  return result;
}

/** What still stops a restore with this mapping, or null when it's ready. */
export function mappingProblem(map: ReadonlyMap<string, string | null>, people: readonly Person[]): string | null {
  const missing = people.filter((p) => !map.get(p.id));
  if (missing.length) return `Choose who ${missing.map((p) => p.name).join(', ')} ${missing.length === 1 ? 'is' : 'are'} now.`;
  const targets = [...map.values()];
  if (new Set(targets).size !== targets.length) return 'Two people from the backup can’t be the same user.';
  return null;
}

/** The backup with every backup person id replaced by the matched user id (in every table and column). */
export function applyPeopleMap(backup: Backup, map: ReadonlyMap<string, string | null>): Backup {
  const ids = new Map([...map].filter((e): e is [string, string] => Boolean(e[1]) && e[0] !== e[1]));
  if (ids.size === 0) return backup;
  const tables: Record<string, BackupRow[]> = {};
  for (const [name, rows] of Object.entries(backup.tables)) {
    tables[name] = rows.map((row) => {
      const copy: BackupRow = {};
      for (const [key, value] of Object.entries(row)) copy[key] = typeof value === 'string' ? (ids.get(value) ?? value) : value;
      return copy;
    });
  }
  return { ...backup, tables };
}

/** Rows per table, for the "this backup has …" line. */
export function backupCounts(backup: Backup) {
  const n = (t: string) => backup.tables[t]?.length ?? 0;
  return { cars: n('cars'), jobs: n('jobs'), items: n('items'), money: n('transactions'), contacts: n('contacts') };
}
