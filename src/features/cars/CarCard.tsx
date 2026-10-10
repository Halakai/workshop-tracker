import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { carStatusLabel, carTitle, type CarStatus } from '@/domain/cars';
import { formatMoney } from '@/domain/money';
import { formatPercentBp } from '@/domain/shares';
import { cn } from '@/lib/utils';
import type { Car } from './api';

const STATUS_STYLES: Record<CarStatus, string> = {
  bought: 'bg-secondary text-secondary-foreground',
  in_repair: 'bg-warning/20 text-foreground',
  ready: 'bg-primary/15 text-foreground',
  listed: 'bg-primary text-primary-foreground',
  sold: 'bg-success/20 text-foreground',
  scrapped: 'bg-muted text-muted-foreground',
};

export function CarStatusBadge({ status }: { status: CarStatus }) {
  return <Badge className={cn('border-transparent', STATUS_STYLES[status])}>{carStatusLabel(status)}</Badge>;
}

export function CarCard({ car }: { car: Car }) {
  const { totals } = car;
  return (
    <Link to={`/cars/${car.id}`} className="flex flex-col gap-2 rounded-xl border bg-card p-4 active:bg-muted">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{carTitle(car)}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {car.ref}
            {car.plate && ` · ${car.plate}`}
          </p>
        </div>
        <CarStatusBadge status={car.status as CarStatus} />
      </div>
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
    </Link>
  );
}
