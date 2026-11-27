import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight, Disc3, Package, Plus, Wrench, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { hasWorkshopMoney } from '@/domain/cars';
import { historyTotals, newestFirst } from '@/domain/carServices';
import { partKind, partSummary, PART_STATES, type PartState } from '@/domain/carParts';
import { jobStatusLabel, type JobStatus } from '@/domain/jobs';
import { formatMoney } from '@/domain/money';
import { formatDate } from '@/domain/dates';
import { formatInteger, formatQuantity, toMilli } from '@/domain/quantity';
import { cn } from '@/lib/utils';
import { jobDate, type Job } from '@/features/jobs/api';
import type { Car } from './api';
import { serviceTitle, useCarParts, useCarServices, useServiceMoney } from './services';
import { ServiceDrawer } from './ServiceDrawer';

interface Entry {
  key: string;
  date: string;
  created: string;
  to?: string;
  icon: LucideIcon;
  title: string;
  meta: string;
  total: number;
}

/**
 * A car's history: its services and the jobs done on it, newest first, with prices; on our own cars also the
 * parts taken from workshop stock outside a service.
 */
export function CarHistory({ car, jobs, showAdd = true }: { car: Car; jobs: Job[]; showAdd?: boolean }) {
  const navigate = useNavigate();
  const services = useCarServices(car.id);
  const money = useServiceMoney(car);
  const [adding, setAdding] = useState(false);
  const workshop = hasWorkshopMoney(car);

  const entries = useMemo(() => {
    const list: Entry[] = (services.data ?? []).map((s) => ({
      key: `service:${s.id}`,
      date: s.performed_on,
      created: s.created_at,
      to: `/cars/${car.id}/services/${s.id}`,
      icon: Wrench,
      title: serviceTitle(s),
      meta: [s.mileage_km != null && `${formatInteger(s.mileage_km)} km`, s.garage ?? 'by us'].filter(Boolean).join(' · '),
      total: money.total(s),
    }));
    for (const job of jobs) {
      list.push({
        key: `job:${job.id}`,
        date: jobDate(job),
        created: job.created_at,
        to: `/jobs/${job.id}`,
        icon: Wrench,
        title: job.description,
        meta: [job.ref, jobStatusLabel(job.status as JobStatus), job.mileage_km != null && `${formatInteger(job.mileage_km)} km`].filter(Boolean).join(' · '),
        total: job.totals.due,
      });
    }
    // on our own cars, parts bought and stock taken outside a service are part of the story too
    if (car.owner_kind === 'member') {
      for (const p of money.parts.filter((x) => !x.service_id)) {
        list.push({
          key: `part:${p.id}`,
          date: p.bought_on ?? p.created_at.slice(0, 10),
          created: p.created_at,
          to: `/cars/${car.id}/parts/${p.id}`,
          icon: Disc3,
          title: `Bought: ${p.name}${p.brand ? ` · ${p.brand.name}` : ''}`,
          meta: [partSummary(p.kind, p.details), p.bought_from].filter(Boolean).join(' · '),
          total: p.price_cents ?? 0,
        });
      }
      for (const m of money.stock.filter((r) => !r.service_id)) {
        const qty = Math.abs(toMilli(m.qty_delta));
        list.push({
          key: `stock:${m.id}`,
          date: m.occurred_on,
          created: m.created_at,
          icon: Package,
          title: `${m.type === 'return' ? 'Back to stock' : 'From workshop stock'}: ${m.item?.name ?? 'part'}`,
          meta: formatQuantity(qty, m.item?.unit?.name ?? ''),
          total: -m.value_delta_cents,
        });
      }
    }
    return newestFirst(list);
  }, [services.data, jobs, money, car.id, car.owner_kind]);

  const totals = historyTotals(entries, new Date().getFullYear());

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          {showAdd && <h2 className="font-semibold">History</h2>}
          {!workshop && entries.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {formatMoney(totals.all)} in all · {formatMoney(totals.thisYear)} this year
            </p>
          )}
        </div>
        {showAdd && (
        <div className="flex gap-2">
          {car.owner_kind === 'customer' && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/jobs/new?car=${car.id}`}>
                <Plus /> Job
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus /> Service
          </Button>
        </div>
        )}
      </div>
      {services.isPending && <Skeleton className="h-16 rounded-xl" />}
      {services.isSuccess && entries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {car.owner_kind === 'customer' ? 'No jobs or services yet.' : 'No services yet. Add one when the car gets work done.'}
        </p>
      )}
      {entries.length > 0 && (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
          {entries.map((e) => {
            const content = (
              <>
                <e.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-medium">{e.title}</span>
                    <span className="font-semibold tabular-nums">{formatMoney(e.total)}</span>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">{[formatDate(e.date), e.meta].filter(Boolean).join(' · ')}</p>
                </div>
                {e.to && <ChevronRight className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
              </>
            );
            return (
              <li key={e.key}>
                {e.to ? (
                  <Link to={e.to} className="flex items-start gap-3 px-4 py-3 active:bg-muted">
                    {content}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 px-4 py-3">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ServiceDrawer car={car} open={adding} onOpenChange={setAdding} onSaved={(id) => navigate(`/cars/${car.id}/services/${id}`)} />
    </section>
  );
}

/** Parts bought for our own car: on the car, stored (summer/winter tyres …), and gone. */
export function CarParts({ car, showAdd = true }: { car: Car; showAdd?: boolean }) {
  const parts = useCarParts(car.id);
  const [showGone, setShowGone] = useState(false);
  const groups = PART_STATES.map((s) => ({ ...s, parts: (parts.data ?? []).filter((p) => p.state === s.value) }));
  const gone = groups.find((g) => g.value === 'gone')!.parts.length;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {showAdd && <h2 className="font-semibold">Parts</h2>}
        {showAdd && (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/cars/${car.id}/parts/new`}>
              <Plus /> Part
            </Link>
          </Button>
        )}
      </div>
      {parts.isPending && <Skeleton className="h-16 rounded-xl" />}
      {parts.isSuccess && parts.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Tyres, battery, wheels… what you buy for the car, with its details and receipt.</p>
      )}
      {groups
        .filter((g) => g.parts.length > 0 && (g.value !== 'gone' || showGone))
        .map((g) => (
          <div key={g.value} className="flex flex-col gap-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.label}</p>
            <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
              {g.parts.map((p) => (
                <li key={p.id}>
                  <Link to={`/cars/${car.id}/parts/${p.id}`} className={cn('flex items-start gap-3 px-4 py-3 active:bg-muted', g.value === 'gone' && 'opacity-60')}>
                    <Disc3 className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">
                          {p.name}
                          {p.brand && <span className="font-normal text-muted-foreground"> · {p.brand.name}</span>}
                        </span>
                        {p.price_cents != null && <span className="font-semibold tabular-nums">{formatMoney(p.price_cents)}</span>}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {[partSummary(p.kind, p.details) || partKind(p.kind).label, p.bought_on && formatDate(p.bought_on)].filter((x) => x && x !== p.name).join(' · ')}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      {gone > 0 && (
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowGone((s) => !s)}>
          {showGone ? 'Hide gone parts' : `Show gone parts (${gone})`}
        </Button>
      )}
    </section>
  );
}

export function PartStateBadge({ state }: { state: string }) {
  const label = PART_STATES.find((s) => s.value === (state as PartState))?.label ?? state;
  return (
    <Badge variant={state === 'fitted' ? 'default' : 'secondary'} className="border-transparent">
      {label}
    </Badge>
  );
}
