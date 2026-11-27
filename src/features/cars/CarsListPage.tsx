import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CAR_STATUSES, CAR_TABS, carTab, isClosed, type CarStatus, type CarTab } from '@/domain/cars';
import { formatMoney } from '@/domain/money';
import { compact, fold } from '@/domain/search';
import { cn } from '@/lib/utils';
import { jobDate, useJobsByCar } from '@/features/jobs/api';
import { useCars, type Car } from './api';
import { CarCard, type LastJob } from './CarCard';
import { useOwnerPeople } from './owners';

const TAB_KEY = 'workshop-cars-tab';

function rememberedTab(): CarTab {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    return CAR_TABS.some((t) => t.value === saved) ? (saved as CarTab) : 'sale';
  } catch {
    return 'sale';
  }
}

/** Cars in three tabs: flips for sale, our own vehicles, and the customers' cars we work on. */
export function CarsListPage() {
  const cars = useCars();
  const [params, setParams] = useSearchParams();
  const tab = (CAR_TABS.find((t) => t.value === params.get('tab'))?.value ?? rememberedTab()) as CarTab;
  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      // only a convenience
    }
  }, [tab]);

  const counts = useMemo(() => {
    const c: Record<CarTab, number> = { sale: 0, ours: 0, customers: 0 };
    for (const car of cars.data ?? []) {
      const t = carTab(car);
      if (t !== 'sale' || !isClosed(car.status as CarStatus)) c[t]++;
    }
    return c;
  }, [cars.data]);

  return (
    <>
      <PageHeader
        title="Cars"
        actions={
          <Button size="sm" asChild>
            <Link to={`/cars/new?tab=${tab}`}>
              <Plus /> Car
            </Link>
          </Button>
        }
      />
      <PageBody>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="tablist">
          {CAR_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setParams({ tab: t.value }, { replace: true })}
              className={cn(
                'flex h-10 items-center justify-center gap-1 rounded-lg text-sm font-medium text-muted-foreground transition-colors',
                tab === t.value && 'bg-background text-foreground shadow-sm',
              )}
            >
              {t.label}
              {cars.data && counts[t.value] > 0 && <span className="text-xs font-normal">{counts[t.value]}</span>}
            </button>
          ))}
        </div>

        {cars.isPending && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        {cars.isError && <p className="text-destructive">{cars.error.message}</p>}
        {cars.data && tab === 'sale' && <ForSale cars={cars.data.filter((c) => carTab(c) === 'sale')} />}
        {cars.data && tab === 'ours' && <Ours cars={cars.data.filter((c) => carTab(c) === 'ours')} />}
        {cars.data && tab === 'customers' && <Customers cars={cars.data.filter((c) => carTab(c) === 'customers')} />}
      </PageBody>
    </>
  );
}

type SaleFilter = 'active' | 'all' | CarStatus;
type Sort = 'newest' | 'invested' | 'profit';

function ForSale({ cars }: { cars: Car[] }) {
  const [filter, setFilter] = useState<SaleFilter>('active');
  const [sort, setSort] = useState<Sort>('newest');

  const visible = useMemo(() => {
    const list = cars.filter((c) => {
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
  }, [cars, filter, sort]);

  const active = cars.filter((c) => !isClosed(c.status as CarStatus));
  const investedInActive = active.reduce((s, c) => s + c.totals.invested, 0);
  const counts = new Map<string, number>();
  for (const c of cars) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);

  const filters: { value: SaleFilter; label: string }[] = [
    { value: 'active', label: `In progress (${active.length})` },
    { value: 'all', label: 'All' },
    ...CAR_STATUSES.filter((s) => counts.get(s.value)).map((s) => ({
      value: s.value as SaleFilter,
      label: `${s.label} (${counts.get(s.value)})`,
    })),
  ];

  return (
    <>
      {active.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {active.length} car{active.length === 1 ? '' : 's'} in progress ·{' '}
          <span className="font-semibold text-foreground">{formatMoney(investedInActive)}</span> invested
        </p>
      )}
      <Chips filters={filters} value={filter} onChange={setFilter} />
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
      <CarList cars={visible} empty={cars.length === 0 ? <Empty tab="sale" text="No cars for sale yet." /> : 'No cars here.'} />
    </>
  );
}

function Ours({ cars }: { cars: Car[] }) {
  const people = useOwnerPeople();
  const lastJobs = useLastJobs();
  const [filter, setFilter] = useState('all');

  const partners = [...new Set(cars.map((c) => c.owner_member_id).filter((id): id is string => Boolean(id) && id !== people.meId))];
  const name = (id: string) => people.members.find((m) => m.id === id)?.display_name ?? 'Partner';
  const filters = [
    { value: 'all', label: `All (${cars.length})` },
    ...(cars.some((c) => c.owner_kind === 'workshop') ? [{ value: 'workshop', label: 'Workshop' }] : []),
    ...(cars.some((c) => c.owner_member_id === people.meId) ? [{ value: people.meId, label: 'Mine' }] : []),
    ...partners.map((id) => ({ value: id, label: `${name(id)}’s` })),
  ];
  const visible = cars
    .filter((c) => filter === 'all' || (filter === 'workshop' ? c.owner_kind === 'workshop' : c.owner_member_id === filter))
    .sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model));

  return (
    <>
      <p className="text-sm text-muted-foreground">The workshop’s own vehicles and our private cars.</p>
      {filters.length > 2 && <Chips filters={filters} value={filter} onChange={setFilter} />}
      <CarList
        cars={visible}
        people={people}
        lastJobs={lastJobs}
        empty={cars.length === 0 ? <Empty tab="ours" text="No vehicles of our own yet." /> : 'No cars here.'}
      />
    </>
  );
}

function Customers({ cars }: { cars: Car[] }) {
  const people = useOwnerPeople();
  const lastJobs = useLastJobs();
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    const plate = compact(query);
    return cars
      .filter((c) => {
        if (!words.length) return true;
        if (plate.length >= 3 && compact(c.plate ?? '').includes(plate)) return true;
        const text = fold([c.ref, c.make, c.model, c.generation, c.year, c.plate, c.vin, c.owner_contact?.name, c.owner_contact?.phone].filter(Boolean).join(' '));
        return words.every((w) => text.includes(w));
      })
      .sort((a, b) => (lastJobs.get(b.id)?.date ?? b.created_at).localeCompare(lastJobs.get(a.id)?.date ?? a.created_at));
  }, [cars, query, lastJobs]);

  return (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Plate, car or owner" className="pl-9" type="search" />
      </div>
      <CarList
        cars={visible}
        people={people}
        lastJobs={lastJobs}
        empty={cars.length === 0 ? <Empty tab="customers" text="No customers’ cars yet. They are added with their first job, or here." /> : 'Nothing found.'}
      />
    </>
  );
}

function useLastJobs(): Map<string, LastJob> {
  const byCar = useJobsByCar();
  return useMemo(
    () => new Map([...byCar].map(([carId, jobs]) => [carId, { ref: jobs[0].ref, date: jobDate(jobs[0]), count: jobs.length }])),
    [byCar],
  );
}

function Chips<T extends string>({ filters, value, onChange }: { filters: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {filters.map((f) => (
        <Button
          key={f.value}
          variant={value === f.value ? 'default' : 'outline'}
          size="sm"
          className="shrink-0 rounded-full"
          onClick={() => onChange(f.value)}
        >
          {f.label}
        </Button>
      ))}
    </div>
  );
}

function CarList({
  cars,
  people,
  lastJobs,
  empty,
}: {
  cars: Car[];
  people?: ReturnType<typeof useOwnerPeople>;
  lastJobs?: Map<string, LastJob>;
  empty: ReactNode;
}) {
  if (cars.length === 0) return <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">{empty}</div>;
  return (
    <ul className="flex flex-col gap-2">
      {cars.map((car) => (
        <li key={car.id}>
          <CarCard car={car} people={people} lastJob={lastJobs?.get(car.id)} />
        </li>
      ))}
    </ul>
  );
}

function Empty({ tab, text }: { tab: CarTab; text: string }) {
  return (
    <>
      {text}{' '}
      <Link to={`/cars/new?tab=${tab}`} className="text-primary underline">
        Add one
      </Link>
      .
    </>
  );
}
