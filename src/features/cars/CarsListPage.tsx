import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CAR_STATUSES, isClosed, type CarStatus } from '@/domain/cars';
import { formatMoney } from '@/domain/money';
import { useCars, type Car } from './api';
import { CarCard } from './CarCard';

type Filter = 'active' | 'all' | CarStatus;
type Sort = 'newest' | 'invested' | 'profit';

export function CarsListPage() {
  const cars = useCars();
  const [filter, setFilter] = useState<Filter>('active');
  const [sort, setSort] = useState<Sort>('newest');

  const visible = useMemo(() => {
    const list = (cars.data ?? []).filter((c) => {
      if (filter === 'all') return true;
      if (filter === 'active') return !isClosed(c.status as CarStatus);
      return c.status === filter;
    });
    const byProfit = (c: Car) => c.totals.profit ?? Number.NEGATIVE_INFINITY;
    return [...list].sort((a, b) => {
      if (sort === 'invested') return b.totals.invested - a.totals.invested;
      if (sort === 'profit') return byProfit(b) - byProfit(a);
      return b.created_at.localeCompare(a.created_at);
    });
  }, [cars.data, filter, sort]);

  const active = (cars.data ?? []).filter((c) => !isClosed(c.status as CarStatus));
  const investedInActive = active.reduce((s, c) => s + c.totals.invested, 0);
  const counts = new Map<string, number>();
  for (const c of cars.data ?? []) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);

  const filters: { value: Filter; label: string }[] = [
    { value: 'active', label: `In progress (${active.length})` },
    { value: 'all', label: 'All' },
    ...CAR_STATUSES.filter((s) => counts.get(s.value)).map((s) => ({
      value: s.value as Filter,
      label: `${s.label} (${counts.get(s.value)})`,
    })),
  ];

  return (
    <>
      <PageHeader
        title="Cars"
        actions={
          <Button size="sm" asChild>
            <Link to="/cars/new">
              <Plus /> Car
            </Link>
          </Button>
        }
      />
      <PageBody>
        {active.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {active.length} car{active.length === 1 ? '' : 's'} in progress ·{' '}
            <span className="font-semibold text-foreground">{formatMoney(investedInActive)}</span> invested
          </p>
        )}
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
        <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="invested">Most invested first</SelectItem>
            <SelectItem value="profit">Most profit first</SelectItem>
          </SelectContent>
        </Select>

        {cars.isPending && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        {cars.isError && <p className="text-destructive">{cars.error.message}</p>}
        {cars.data && visible.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            {cars.data.length === 0 ? (
              <>
                No cars yet.{' '}
                <Link to="/cars/new" className="text-primary underline">
                  Add the first one
                </Link>
                .
              </>
            ) : (
              'No cars here.'
            )}
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {visible.map((car) => (
            <li key={car.id}>
              <CarCard car={car} />
            </li>
          ))}
        </ul>
      </PageBody>
    </>
  );
}
