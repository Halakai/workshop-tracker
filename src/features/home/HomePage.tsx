import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  Car,
  ChevronRight,
  DatabaseBackup,
  MinusCircle,
  Package,
  Receipt,
  Search,
  ShoppingCart,
  TrendingUp,
  Wallet,
  Wrench,
} from 'lucide-react';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FormDrawer } from '@/components/FormDrawer';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { formatMoney } from '@/domain/money';
import { formatQuantity, toMilli } from '@/domain/quantity';
import { CAR_STATUSES, carTitle, isClosed, type CarStatus } from '@/domain/cars';
import { lastMonths } from '@/domain/dashboard';
import { formatDate, formatDateTime, todayIso } from '@/domain/dates';
import { cn } from '@/lib/utils';
import { useCurrentProfile, useProfileNames } from '@/features/auth/profiles';
import { itemIsLow, unitOf, useItems, type Item } from '@/features/inventory/api';
import { usePartnerPositions, useWalletBalance } from '@/features/money/api';
import { MoneyEntryDrawer } from '@/features/money/MoneyEntryDrawer';
import { useCars } from '@/features/cars/api';
import { CarStatusBadge } from '@/features/cars/CarCard';
import { ItemPicker } from '@/features/cars/CarStockDrawers';
import { UseDrawer } from '@/features/inventory/UseDrawer';
import { BuyDrawer } from '@/features/inventory/BuyDrawer';
import { useJobs } from '@/features/jobs/api';
import { useSettings } from '@/features/settings/api';
import { activityLink, useActivity } from '@/features/activity/api';
import { useMoneyFlow } from './api';
import { MoneyChart } from './MoneyChart';
import { readRecent } from './recent';

type Quick = 'expense' | 'pick-use' | 'pick-buy' | null;

export function HomePage() {
  const me = useCurrentProfile();
  const items = useItems();
  const wallet = useWalletBalance();
  const partners = usePartnerPositions();
  const cars = useCars();
  const jobs = useJobs();
  const settings = useSettings();
  const today = todayIso();
  const flow = useMoneyFlow(`${lastMonths(12, today)[0]}-01`);
  const [quick, setQuick] = useState<Quick>(null);
  const [useItem, setUseItem] = useState<Item | null>(null);
  const [buyItem, setBuyItem] = useState<Item | null>(null);

  const lowStock = useMemo(() => (items.data ?? []).filter(itemIsLow), [items.data]);
  const activeCars = useMemo(() => (cars.data ?? []).filter((c) => !isClosed(c.status as CarStatus)), [cars.data]);
  const openJobs = useMemo(() => (jobs.data ?? []).filter((j) => j.status !== 'paid'), [jobs.data]);
  const lastExport = settings.data?.last_export_at;
  const backupDue = me.role === 'admin' && settings.isSuccess && (!lastExport || Date.now() - new Date(lastExport).getTime() > 30 * 86_400_000);

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

  const statusCounts = CAR_STATUSES.filter((s) => !isClosed(s.value))
    .map((s) => ({ ...s, count: activeCars.filter((c) => c.status === s.value).length }))
    .filter((s) => s.count > 0);

  return (
    <>
      <PageHeader title={settings.data?.workshop_name ?? 'Workshop'} />
      <PageBody>
        <Link
          to="/search"
          className="flex h-12 items-center gap-3 rounded-xl border bg-card px-4 text-muted-foreground shadow-xs active:bg-muted"
        >
          <Search className="size-5" />
          <span className="truncate">Search cars, jobs, parts, contacts…</span>
        </Link>

        <div className="grid grid-cols-5 gap-1.5">
          <QuickButton icon={Receipt} label="Expense" onClick={() => setQuick('expense')} />
          <QuickButton icon={MinusCircle} label="Use part" onClick={() => setQuick('pick-use')} />
          <QuickButton icon={ShoppingCart} label="Buy part" onClick={() => setQuick('pick-buy')} />
          <QuickButton icon={Car} label="New car" to="/cars/new" />
          <QuickButton icon={Wrench} label="New job" to="/jobs/new" />
        </div>

        {backupDue && (
          <Link to="/export" className="flex items-center gap-3 rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm">
            <DatabaseBackup className="size-5 shrink-0" />
            <span className="flex-1">
              {lastExport ? `Last backup ${formatDate(lastExport)}.` : 'No backup made yet.'} Save a copy of the data now.
            </span>
            <ChevronRight className="size-5 text-muted-foreground" />
          </Link>
        )}

        <Link to="/money">
          <Card className="active:bg-muted">
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Wallet className="size-4" /> Wallet
                  </p>
                  {wallet === null ? (
                    <Skeleton className="mt-1 h-8 w-32" />
                  ) : (
                    <p className={cn('text-2xl font-semibold tabular-nums', wallet < 0 && 'text-destructive')}>{formatMoney(wallet)}</p>
                  )}
                </div>
                <ChevronRight className="size-5 text-muted-foreground" />
              </div>
              {partners && partners.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {partners.map((p) => (
                    <span key={p.partnerId}>
                      <span className="text-muted-foreground">{p.name}</span>{' '}
                      <span className={cn('font-medium tabular-nums', p.balance < 0 && 'text-destructive')}>{formatMoney(p.balance)}</span>
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <Tile
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
          <Tile
            to="/cars"
            icon={Car}
            label="In unsold cars"
            value={cars.data ? formatMoney(figures.inCars) : null}
            note={`${activeCars.length} ${activeCars.length === 1 ? 'car' : 'cars'}`}
          />
          <Tile
            to="/jobs"
            icon={Wrench}
            label="To collect"
            value={jobs.data ? formatMoney(figures.toCollect) : null}
            note={
              figures.doneUnpaid > 0 ? (
                <span className="text-destructive">{figures.doneUnpaid} done, not paid</span>
              ) : (
                `${openJobs.length} open`
              )
            }
          />
          <Tile
            icon={TrendingUp}
            label={`Profit ${figures.year}`}
            value={cars.data && jobs.data && flow.data ? formatMoney(figures.carProfit + figures.jobProfit) : null}
            note={`cars ${formatMoney(figures.carProfit)} · jobs ${formatMoney(figures.jobProfit)}`}
          />
        </div>

        <MoneyChart rows={flow.data} today={today} />

        <RecentlyOpened cars={cars.data} jobs={jobs.data} items={items.data} />

        {activeCars.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Cars in progress</CardTitle>
              <CardAction>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/cars">All</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{statusCounts.map((s) => `${s.count} ${s.label.toLowerCase()}`).join(' · ')}</p>
              <ul className="flex flex-col divide-y">
                {activeCars.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link to={`/cars/${c.id}`} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{carTitle(c)}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{c.plate ?? c.ref}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-sm font-semibold tabular-nums">{formatMoney(c.totals.invested)}</span>
                        <CarStatusBadge status={c.status as CarStatus} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {openJobs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Open jobs</CardTitle>
              <CardAction>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/jobs">All</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {openJobs.slice(0, 6).map((j) => (
                  <li key={j.id}>
                    <Link to={`/jobs/${j.id}`} className="flex items-center justify-between gap-2 py-2">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{j.customer?.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{j.description}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end">
                        <span className="text-sm font-semibold tabular-nums">{formatMoney(j.totals.due)}</span>
                        <span className={cn('text-xs', j.status === 'done' ? 'text-destructive' : 'text-muted-foreground')}>
                          {j.status === 'done' ? 'done, not paid' : 'open'}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {lowStock.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-5 text-destructive" /> Low stock ({lowStock.length})
              </CardTitle>
              <CardAction>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/inventory/shopping-list">Shopping list</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {lowStock.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <Link to={`/inventory/${item.id}`} className="flex items-center justify-between gap-2 py-2">
                      <span className="truncate">{item.name}</span>
                      <span className="flex items-center gap-1 text-sm font-semibold text-destructive tabular-nums">
                        {formatQuantity(toMilli(item.qty_on_hand), unitOf(item).name)}
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <RecentActivity />
      </PageBody>

      <MoneyEntryDrawer mode={quick === 'expense' ? 'expense' : null} onClose={() => setQuick(null)} />
      <FormDrawer
        open={quick === 'pick-use' || quick === 'pick-buy'}
        onOpenChange={(o) => !o && setQuick(null)}
        title={quick === 'pick-buy' ? 'Buy which item?' : 'Use which item?'}
      >
        {(quick === 'pick-use' || quick === 'pick-buy') && (
          <ItemPicker
            includeEmpty={quick === 'pick-buy'}
            onPick={(item) => {
              if (quick === 'pick-buy') setBuyItem(item);
              else setUseItem(item);
              setQuick(null);
            }}
          />
        )}
      </FormDrawer>
      {useItem && <UseDrawer item={useItem} open onOpenChange={(o) => !o && setUseItem(null)} />}
      {buyItem && <BuyDrawer item={buyItem} open onOpenChange={(o) => !o && setBuyItem(null)} />}
    </>
  );
}

function QuickButton({ icon: Icon, label, onClick, to }: { icon: typeof Car; label: string; onClick?: () => void; to?: string }) {
  const content = (
    <>
      <Icon className="size-5 text-primary" />
      <span className="text-[11px] leading-tight">{label}</span>
    </>
  );
  return to ? (
    <Button variant="outline" className="h-16 flex-col gap-1 px-1" asChild>
      <Link to={to}>{content}</Link>
    </Button>
  ) : (
    <Button variant="outline" className="h-16 flex-col gap-1 px-1" onClick={onClick}>
      {content}
    </Button>
  );
}

function Tile({ to, icon: Icon, label, value, note }: { to?: string; icon: typeof Car; label: string; value: string | null; note: ReactNode }) {
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

function RecentlyOpened({
  cars,
  jobs,
  items,
}: {
  cars: ReturnType<typeof useCars>['data'];
  jobs: ReturnType<typeof useJobs>['data'];
  items: ReturnType<typeof useItems>['data'];
}) {
  const [visits] = useState(readRecent);
  const entries = useMemo(() => {
    const list: { key: string; to: string; icon: typeof Car; title: string; sub: string }[] = [];
    for (const v of visits) {
      if (v.kind === 'car') {
        const c = cars?.find((x) => x.id === v.id);
        if (c) list.push({ key: `car:${c.id}`, to: `/cars/${c.id}`, icon: Car, title: carTitle(c), sub: c.plate ?? c.ref });
      } else if (v.kind === 'job') {
        const j = jobs?.find((x) => x.id === v.id);
        if (j) list.push({ key: `job:${j.id}`, to: `/jobs/${j.id}`, icon: Wrench, title: j.customer?.name ?? j.ref, sub: j.ref });
      } else {
        const i = items?.find((x) => x.id === v.id);
        if (i) list.push({ key: `item:${i.id}`, to: `/inventory/${i.id}`, icon: Package, title: i.name, sub: i.part_number });
      }
    }
    return list.slice(0, 8);
  }, [visits, cars, jobs, items]);

  if (entries.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">Recently opened</h2>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {entries.map(({ key, to, icon: Icon, title, sub }) => (
          <Link key={key} to={to} className="flex w-40 shrink-0 items-center gap-2 rounded-xl border bg-card p-3 active:bg-muted">
            <Icon className="size-5 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{title}</span>
              <span className="block truncate font-mono text-xs text-muted-foreground">{sub}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function RecentActivity() {
  const [limit, setLimit] = useState(8);
  const activity = useActivity(limit);
  const names = useProfileNames();
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">Recent activity</h2>
      {activity.isPending && <Skeleton className="h-32 rounded-xl" />}
      {activity.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border empty:hidden">
        {activity.data?.map((a) => {
          const href = activityLink(a.entity_type, a.entity_id);
          const body = (
            <>
              <p className="text-sm">{a.summary}</p>
              <p className="text-xs text-muted-foreground">
                {a.actor_id ? (names.get(a.actor_id) ?? 'someone') : 'system'} · {formatDateTime(a.at)}
              </p>
            </>
          );
          return (
            <li key={a.id}>
              {href ? (
                <Link to={href} className="block px-4 py-2.5 active:bg-muted">
                  {body}
                </Link>
              ) : (
                <div className="px-4 py-2.5">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {activity.data && activity.data.length >= limit && limit < 50 && (
        <Button variant="ghost" size="sm" onClick={() => setLimit(50)}>
          Show more
        </Button>
      )}
    </section>
  );
}
