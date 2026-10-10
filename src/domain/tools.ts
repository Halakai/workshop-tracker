// Tools & equipment: labels, IDs (T-001), lending and warranty texts, and what the tools are worth.
import { formatDate } from './dates';
import { nextPartNumber } from './codes';
import type { Cents } from './money';

export type ToolCondition = 'good' | 'needs_repair' | 'broken';
export type GoneReason = 'sold' | 'lost' | 'stolen' | 'scrapped' | 'given_away';

export const TOOL_CONDITIONS: { value: ToolCondition; label: string }[] = [
  { value: 'good', label: 'Works' },
  { value: 'needs_repair', label: 'Needs repair' },
  { value: 'broken', label: 'Broken' },
];

export const GONE_REASONS: { value: GoneReason; label: string }[] = [
  { value: 'sold', label: 'Sold' },
  { value: 'lost', label: 'Lost' },
  { value: 'stolen', label: 'Stolen' },
  { value: 'scrapped', label: 'Thrown away' },
  { value: 'given_away', label: 'Given away' },
];

export function conditionLabel(condition: string): string {
  return TOOL_CONDITIONS.find((c) => c.value === condition)?.label ?? condition;
}

export function goneLabel(reason: string): string {
  return GONE_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

/** Next free tool ID: T-001, T-002 … */
export function nextToolCode(existing: Iterable<string>): string {
  return nextPartNumber('T', existing);
}

/** Whole days from one ISO date to another (0 on the same day). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.UTC(...isoParts(toIso)) - Date.UTC(...isoParts(fromIso))) / 86_400_000);
}

function isoParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return [y, m - 1, d];
}

/** "since 12.10.2026 (today)", "since 12.10.2026 (5 days)" */
export function lentSince(lentOn: string, today: string): string {
  const days = daysBetween(lentOn, today);
  const ago = days <= 0 ? 'today' : days === 1 ? '1 day' : `${days} days`;
  return `since ${formatDate(lentOn)} (${ago})`;
}

/** Warranty state on a given day: running (with the days left) or over. */
export function warrantyState(until: string | null, today: string): { over: boolean; text: string } | null {
  if (!until) return null;
  const left = daysBetween(today, until);
  if (left < 0) return { over: true, text: `ended ${formatDate(until)}` };
  return { over: false, text: `until ${formatDate(until)}${left <= 60 ? ` (${left === 0 ? 'last day' : `${left} days left`})` : ''}` };
}

export interface ToolLike {
  price_cents: number | null;
  gone_on: string | null;
  lent_to: string | null;
  condition: string;
}

/** Tools still owned, what they cost together, and what needs attention. */
export function toolTotals(tools: readonly ToolLike[]): { count: number; value: Cents; lent: number; needsWork: number } {
  let count = 0;
  let value = 0;
  let lent = 0;
  let needsWork = 0;
  for (const t of tools) {
    if (t.gone_on) continue;
    count++;
    value += t.price_cents ?? 0;
    if (t.lent_to) lent++;
    if (t.condition !== 'good') needsWork++;
  }
  return { count, value, lent, needsWork };
}
