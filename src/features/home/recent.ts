// "Recently opened" on the dashboard: the last cars, jobs and items this person opened on this device.
// A per-device convenience, so it lives in localStorage (and the app works fine without it).
import { useEffect } from 'react';

export type RecentKind = 'car' | 'job' | 'item';
export interface RecentVisit {
  kind: RecentKind;
  id: string;
  at: number;
}

const KEY = 'workshop.recent.v1';
const MAX = 12;

export function readRecent(): RecentVisit[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as RecentVisit[]).filter((v) => v && typeof v.id === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberVisit(kind: RecentKind, id: string) {
  try {
    const rest = readRecent().filter((v) => !(v.kind === kind && v.id === id));
    localStorage.setItem(KEY, JSON.stringify([{ kind, id, at: Date.now() }, ...rest].slice(0, MAX)));
  } catch {
    // storage blocked (private mode): nothing to remember
  }
}

/** Call on a record's page once it has loaded. */
export function useRememberVisit(kind: RecentKind, id: string | undefined) {
  useEffect(() => {
    if (id) rememberVisit(kind, id);
  }, [kind, id]);
}
