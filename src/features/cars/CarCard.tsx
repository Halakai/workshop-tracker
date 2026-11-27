import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { carStatusLabel, carTitle, hasWorkshopMoney, type CarStatus, type OwnerPeople } from '@/domain/cars';
import { formatMoney } from '@/domain/money';
import { formatPercentBp } from '@/domain/shares';
import { formatDate } from '@/domain/dates';
import { formatInteger } from '@/domain/quantity';
import { cn } from '@/lib/utils';
import { CarLogo } from '@/components/CarLogo';
import type { Car } from './api';
import { OwnerBadge } from './owners';

const STATUS_STYLES: Record<CarStatus, string> = {
  bought: 'bg-secondary text-secondary-foreground',
  in_repair: 'bg-warning/20 text-foreground',
  ready: 'bg-primary/15 text-foreground',
  listed: 'bg-primary text-primary-foreground',
  sold: 'bg-success/20 text-foreground',
  scrapped: 'bg-muted text-muted-foreground',
};

/** A workshop vehicle (not for sale) is "In use" rather than "Bought". */
export function CarStatusBadge({ status, forSale = true }: { status: CarStatus; forSale?: boolean }) {
  const label = !forSale && status === 'bought' ? 'In use' : carStatusLabel(status);
  return <Badge className={cn('border-transparent', STATUS_STYLES[status])}>{label}</Badge>;
}

/** The latest job done on a car, for cards. */
export interface LastJob {
  ref: string;
  date: string;
  count: number;
}

export function CarCard({ car, people, lastJob }: { car: Car; people?: Pick<OwnerPeople, 'members' | 'meId'>; lastJob?: LastJob }) {
  const { totals } = car;
  const workshop = hasWorkshopMoney(car);
  return (
    <Link to={`/cars/${car.id}`} className="flex flex-col gap-2 rounded-xl border bg-card p-4 active:bg-muted">
      <div className="flex items-start gap-3">
        <CarLogo make={car.make} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{carTitle(car)}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {car.ref}
            {car.plate && ` · ${car.plate}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {workshop && <CarStatusBadge status={car.status as CarStatus} forSale={car.for_sale} />}
          {people && (!workshop || !car.for_sale) && <OwnerBadge car={car} people={people} />}
        </div>
      </div>
      {workshop ? (
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">Invested</p>
            <p className="font-semibold tabular-nums">{formatMoney(totals.invested)}</p>
          </div>
          {totals.profit !== null && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{totals.profit >= 0 ? 'Profit' : 'Loss'}</p>
              <p className={cn('font-semibold tabular-nums', totals.profit >= 0 ? 'text-success' : 'text-destructive')}>
                {formatMoney(totals.profit, { sign: true })}
                {totals.marginBp !== null && <span className="ml-1 text-xs font-normal">({formatPercentBp(totals.marginBp)})</span>}
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {lastJob
            ? `Last job ${formatDate(lastJob.date)} · ${lastJob.ref}${lastJob.count > 1 ? ` · ${lastJob.count} jobs` : ''}`
            : car.owner_kind === 'customer'
              ? 'No jobs yet'
              : [car.fuel, car.mileage_km != null && `${formatInteger(car.mileage_km)} km`].filter(Boolean).join(' · ') || '—'}
        </p>
      )}
    </Link>
  );
}
