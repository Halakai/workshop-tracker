import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { AddedBy } from '@/components/AddedBy';
import { formatMoney } from '@/domain/money';
import { formatDate } from '@/domain/dates';
import { carTitle } from '@/domain/cars';
import { cn } from '@/lib/utils';
import { categoryInfo } from './labels';
import { useAccountLabels, type TransactionRow } from './api';
import { modeOf } from './MoneyEntryDrawer';

/**
 * Ledger rows. `perspective` is the account the list is about (wallet or a partner):
 * money coming in shows green with +, going out red with −.
 */
export function TransactionList({
  rows,
  perspective,
  onEdit,
}: {
  rows: TransactionRow[];
  perspective?: string;
  onEdit: (row: TransactionRow) => void;
}) {
  const label = useAccountLabels();
  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing here yet.</p>;
  }
  return (
    <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
      {rows.map((row) => {
        const info = categoryInfo(row.category);
        const Icon = info.icon;
        const incoming = perspective !== undefined && row.to_account_id === perspective;
        const outgoing = perspective !== undefined && row.from_account_id === perspective;
        const title =
          row.category === 'workshop_expense'
            ? [row.expense_category?.name, row.description].filter(Boolean).join(': ')
            : row.category === 'car_cost'
              ? [row.expense_category?.name, row.description].filter(Boolean).join(': ')
              : row.description && !['Purchase', 'Sale'].includes(row.description)
                ? row.description
                : info.label;
        const flow = `${label(row.from_account_id)} → ${label(row.to_account_id)}`;
        const meta = [formatDate(row.occurred_on), flow, row.counterparty].filter(Boolean).join(' · ');
        const editable = modeOf(row) !== null;
        const href = row.car ? `/cars/${row.car.id}` : null;

        const body = (
          <>
            <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{title}</span>
                <span
                  className={cn(
                    'shrink-0 font-semibold tabular-nums',
                    incoming && 'text-success',
                    outgoing && 'text-destructive',
                  )}
                >
                  {incoming ? '+' : outgoing ? '-' : ''}
                  {formatMoney(row.amount_cents)}
                </span>
              </div>
              <p className="truncate text-sm text-muted-foreground">{meta}</p>
              {row.car && (
                <p className="truncate text-xs text-muted-foreground">
                  {info.label} · {row.car.ref} {carTitle(row.car)}
                </p>
              )}
              <AddedBy by={row.created_by} at={row.created_at} />
            </div>
            {(editable || href) && <ChevronRight className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
          </>
        );
        return (
          <li key={row.id}>
            {editable ? (
              <button type="button" onClick={() => onEdit(row)} className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-muted">
                {body}
              </button>
            ) : href ? (
              <Link to={href} className="flex items-start gap-3 px-4 py-3 active:bg-muted">
                {body}
              </Link>
            ) : (
              <div className="flex items-start gap-3 px-4 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
