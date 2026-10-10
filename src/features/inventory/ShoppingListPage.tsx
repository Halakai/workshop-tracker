import { Link } from 'react-router';
import { ChevronRight, PartyPopper } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney, mulDivRound } from '@/domain/money';
import { MILLI_PER_UNIT, formatQuantity, toMilli } from '@/domain/quantity';
import { formatDate } from '@/domain/dates';
import { unitOf, useItems, useLastPurchases, useLowStockItems } from './api';

export function ShoppingListPage() {
  const items = useItems();
  const low = useLowStockItems();
  const lastPurchases = useLastPurchases();

  return (
    <>
      <PageHeader title="Shopping list" back="/inventory" />
      <PageBody>
        {items.isPending && <Skeleton className="h-24 rounded-xl" />}
        {items.isSuccess && low.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            <PartyPopper className="size-8" />
            Nothing is below its minimum.
          </div>
        )}
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
          {low.map((item) => {
            const unit = unitOf(item).name;
            const last = lastPurchases.data?.get(item.id);
            const lastQty = last?.qty != null ? toMilli(last.qty) : null;
            return (
              <li key={item.id}>
                <Link to={`/inventory/${item.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-muted">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{item.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {item.part_number}
                      {item.brand && ` · ${item.brand.name}`}
                      {item.manufacturer_ref && ` · ${item.manufacturer_ref}`}
                    </p>
                    <p className="text-sm">
                      <span className="font-semibold text-destructive">{formatQuantity(toMilli(item.qty_on_hand), unit)}</span>
                      <span className="text-muted-foreground"> of min {formatQuantity(toMilli(item.min_qty), unit)}</span>
                    </p>
                    {last && lastQty && last.total_cents != null && (
                      <p className="truncate text-xs text-muted-foreground">
                        Last: {formatQuantity(lastQty, unit)} for {formatMoney(last.total_cents)} (
                        {formatMoney(mulDivRound(last.total_cents, MILLI_PER_UNIT, lastQty))}/{unit})
                        {last.supplier && ` at ${last.supplier}`}, {formatDate(last.occurred_on)}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="size-5 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      </PageBody>
    </>
  );
}
