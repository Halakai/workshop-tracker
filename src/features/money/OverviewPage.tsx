import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Car, Package, TrendingUp, Wrench, type LucideIcon } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { isClosed, type CarStatus } from '@/domain/cars';
import { lastMonths } from '@/domain/dashboard';
import { todayIso } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { cn } from '@/lib/utils';
import { useCars } from '@/features/cars/api';
import { itemIsLow, useItems } from '@/features/inventory/api';
import { useJobs } from '@/features/jobs/api';
import { useMoneyFlow } from '@/features/home/api';
import { MoneyChart } from '@/features/home/MoneyChart';
import { MoneyTabs } from './MoneyTabs';

/** What the workshop's money is in, what was earned this year, and money in and out per month. */
export function OverviewPage() {
  const items = useItems();
  const cars = useCars();
  const jobs = useJobs();
  const today = todayIso();
  const flow = useMoneyFlow(`${lastMonths(12, today)[0]}-01`);

  const lowStock = useMemo(() => (items.data ?? []).filter(itemIsLow), [items.data]);
  const activeCars = useMemo(() => (cars.data ?? []).filter((c) => !isClosed(c.status as CarStatus)), [cars.data]);
  const openJobs = useMemo(() => (jobs.data ?? []).filter((j) => j.status !== 'paid'), [jobs.data]);

  const figures = useMemo(() => {
    const year = today.slice(0, 4);
    const stockValue = (items.data ?? []).reduce((s, i) => s + i.stock_value_cents, 0);
    const inCars = activeCars.reduce((s, c) => s + c.totals.invested, 0);
    const doneUnpaid = openJobs.filter((j) => j.status === 'done');
    const toCollect = doneUnpaid.reduce((s, j) => s + j.totals.outstanding, 0);
    // profit of cars sold this year and of jobs whose last payment came this year
    const carProfit = (cars.data ?? [])
      .filter((c) => c.totals.profit !== null && (c.sale_date ?? c.status_changed_at).startsWith(year))
      .reduce((s, c) => s + (c.totals.profit ?? 0), 0);
    const lastPayment = new Map<string, string>();
    for (const r of flow.data ?? []) {
      if (r.category === 'job_payment' && r.jobId && r.occurredOn > (lastPayment.get(r.jobId) ?? '')) lastPayment.set(r.jobId, r.occurredOn);
    }
    const jobProfit = (jobs.data ?? [])
      .filter((j) => j.status === 'paid' && lastPayment.get(j.id)?.startsWith(year))
      .reduce((s, j) => s + j.totals.profit, 0);
    return { year, stockValue, inCars, doneUnpaid: doneUnpaid.length, toCollect, carProfit, jobProfit };
  }, [today, items.data, activeCars, openJobs, cars.data, jobs.data, flow.data]);

  return (
    <>
      <PageHeader title="Money" back />
      <PageBody>
        <MoneyTabs current="overview" />
        <div className="grid grid-cols-2 gap-3">
          <Figure
            to="/inventory"
            icon={Package}
            label="Inventory value"
            value={items.data ? formatMoney(figures.stockValue) : null}
            note={
              lowStock.length > 0 ? (
                <span className="text-destructive">{lowStock.length} running low</span>
              ) : (
                `${items.data?.filter((i) => !i.archived_at).length ?? 0} items`
              )
            }
          />
          <Figure
            to="/cars"
            icon={Car}
            label="In unsold cars"
            value={cars.data ? formatMoney(figures.inCars) : null}
            note={`${activeCars.length} ${activeCars.length === 1 ? 'car' : 'cars'}`}
          />
          <Figure
            to="/jobs"
            icon={Wrench}
            label="To collect"
            value={jobs.data ? formatMoney(figures.toCollect) : null}
            note={figures.doneUnpaid > 0 ? <span className="text-destructive">{figures.doneUnpaid} done, not paid</span> : `${openJobs.length} open`}
          />
          <Figure
            icon={TrendingUp}
            label={`Profit ${figures.year}`}
            value={cars.data && jobs.data && flow.data ? formatMoney(figures.carProfit + figures.jobProfit) : null}
            note={`cars ${formatMoney(figures.carProfit)} · jobs ${formatMoney(figures.jobProfit)}`}
          />
        </div>
        <MoneyChart rows={flow.data} today={today} />
      </PageBody>
    </>
  );
}

function Figure({ to, icon: Icon, label, value, note }: { to?: string; icon: LucideIcon; label: string; value: string | null; note: ReactNode }) {
  const body = (
    <Card className={cn('h-full gap-1 py-4', to && 'active:bg-muted')}>
      <CardContent className="flex flex-col gap-0.5 px-4">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5" /> {label}
        </p>
        {value === null ? <Skeleton className="my-1 h-6 w-24" /> : <p className="text-lg font-semibold tabular-nums">{value}</p>}
        <p className="truncate text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
