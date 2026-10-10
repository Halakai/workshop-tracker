import { useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, Car, ChevronRight, DatabaseBackup, MinusCircle, Receipt, ShoppingCart, Wallet, Wrench } from 'lucide-react';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FormDrawer } from '@/components/FormDrawer';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { formatMoney } from '@/domain/money';
import { formatQuantity, toMilli } from '@/domain/quantity';
import { carTitle, isClosed, type CarStatus } from '@/domain/cars';
import { formatDate, formatDateTime } from '@/domain/dates';
import { cn } from '@/lib/utils';
import { useCurrentProfile, useProfileNames } from '@/features/auth/profiles';
import { unitOf, useLowStockItems, type Item } from '@/features/inventory/api';
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

type Quick = 'expense' | 'pick-use' | 'pick-buy' | null;

export function HomePage() {
  const me = useCurrentProfile();
  const lowStock = useLowStockItems();
  const wallet = useWalletBalance();
  const partners = usePartnerPositions();
  const cars = useCars();
  const jobs = useJobs();
  const settings = useSettings();
  const [quick, setQuick] = useState<Quick>(null);
  const [useItem, setUseItem] = useState<Item | null>(null);
  const [buyItem, setBuyItem] = useState<Item | null>(null);

  const activeCars = (cars.data ?? []).filter((c) => !isClosed(c.status as CarStatus));
  const openJobs = (jobs.data ?? []).filter((j) => j.status !== 'paid');
  const lastExport = settings.data?.last_export_at;
  const backupDue = me.role === 'admin' && settings.isSuccess && (!lastExport || Date.now() - new Date(lastExport).getTime() > 30 * 86_400_000);

  return (
    <>
      <PageHeader title="Workshop" />
      <PageBody>
        <p className="text-lg">
          Hi <span className="font-semibold">{me.display_name}</span> 👋
        </p>

        <div className="grid grid-cols-5 gap-1.5">
          <QuickButton icon={Receipt} label="Expense" onClick={() => setQuick('expense')} />
          <QuickButton icon={MinusCircle} label="Use stock" onClick={() => setQuick('pick-use')} />
          <QuickButton icon={ShoppingCart} label="Buy stock" onClick={() => setQuick('pick-buy')} />
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
            <CardContent>
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
                  <Link to="/stock/shopping-list">Shopping list</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {lowStock.slice(0, 5).map((item) => (
                  <li key={item.id}>
                    <Link to={`/stock/${item.id}`} className="flex items-center justify-between gap-2 py-2">
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

function RecentActivity() {
  const activity = useActivity(20);
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
    </section>
  );
}
