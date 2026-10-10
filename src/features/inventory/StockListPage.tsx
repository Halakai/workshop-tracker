import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Plus, Search, ShoppingCart } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatQuantity, toMilli } from '@/domain/quantity';
import { cn } from '@/lib/utils';
import { useCategories } from '@/features/catalog/api';
import { itemIsLow, unitOf, useItems, useLowStockItems, type Item } from './api';

/** 'all' | 'low' | 'archived' | a category id */
type Filter = string;

function matches(item: Item, query: string): boolean {
  if (!query) return true;
  const haystack = [item.name, item.brand?.name, item.part_number, item.manufacturer_ref, item.location, item.category?.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

export function StockListPage() {
  const items = useItems();
  const categories = useCategories();
  const lowCount = useLowStockItems().length;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const visible = useMemo(
    () =>
      (items.data ?? []).filter((item) => {
        if (filter === 'archived') return item.archived_at && matches(item, query);
        if (item.archived_at) return false;
        if (filter === 'low' && !itemIsLow(item)) return false;
        if (filter !== 'all' && filter !== 'low' && item.category_id !== filter) return false;
        return matches(item, query);
      }),
    [items.data, filter, query],
  );

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'low', label: lowCount ? `Low (${lowCount})` : 'Low' },
    ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    { value: 'archived', label: 'Archived' },
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        actions={
          <>
            <Button variant="ghost" size="icon" asChild aria-label="Shopping list">
              <Link to="/inventory/shopping-list" className="relative">
                <ShoppingCart className="size-5" />
                {lowCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-4 rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white">
                    {lowCount}
                  </span>
                )}
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/inventory/new">
                <Plus /> Item
              </Link>
            </Button>
          </>
        }
      />
      <PageBody>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search name, brand, part no., shelf"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {filters.map((f) => (
            <Button
              key={f.value}
              variant={filter === f.value ? 'default' : 'outline'}
              size="sm"
              className="shrink-0 rounded-full"
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {items.isPending && Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        {items.isError && <p className="text-destructive">{items.error.message}</p>}
        {items.data && visible.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            {items.data.length === 0 ? (
              <>
                No items yet.{' '}
                <Link to="/inventory/new" className="text-primary underline">
                  Add the first one
                </Link>
                .
              </>
            ) : (
              'Nothing matches.'
            )}
          </div>
        )}

        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
          {visible.map((item) => {
            const low = itemIsLow(item);
            const details = [item.part_number, item.brand?.name, item.location && `📍 ${item.location}`].filter(Boolean).join(' · ');
            return (
              <li key={item.id}>
                <Link to={`/inventory/${item.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-muted">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.name}</p>
                    {details && <p className="truncate text-sm text-muted-foreground">{details}</p>}
                  </div>
                  <div className="text-right">
                    <p className={cn('font-semibold tabular-nums', low && 'text-destructive')}>
                      {formatQuantity(toMilli(item.qty_on_hand), unitOf(item).name)}
                    </p>
                    {low && <Badge variant="destructive">low</Badge>}
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      </PageBody>
    </>
  );
}
