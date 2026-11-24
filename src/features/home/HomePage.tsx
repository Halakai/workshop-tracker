import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BookOpen, Car, ChevronRight, DatabaseBackup, Hammer, Package, Search, Wallet, Wrench, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { formatMoney } from '@/domain/money';
import { isClosed, type CarStatus } from '@/domain/cars';
import { formatDate } from '@/domain/dates';
import { toolTotals } from '@/domain/tools';
import { useCurrentProfile } from '@/features/auth/profiles';
import { itemIsLow, useItems } from '@/features/inventory/api';
import { useWalletBalance } from '@/features/money/api';
import { useCars } from '@/features/cars/api';
import { useJobs } from '@/features/jobs/api';
import { useSettings } from '@/features/settings/api';
import { useTools } from '@/features/tools/api';
import { cn } from '@/lib/utils';
import { AddNew } from './AddNew';

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Home is a menu: one big tile per area, with what's going on there, and one button for adding anything. */
export function HomePage() {
  const me = useCurrentProfile();
  const items = useItems();
  const wallet = useWalletBalance();
  const cars = useCars();
  const jobs = useJobs();
  const settings = useSettings();
  const tools = useTools();

  const lowStock = useMemo(() => (items.data ?? []).filter(itemIsLow).length, [items.data]);
  const activeCars = useMemo(() => (cars.data ?? []).filter((c) => !isClosed(c.status as CarStatus)).length, [cars.data]);
  const openJobs = (jobs.data ?? []).filter((j) => j.status === 'open').length;
  const unpaid = (jobs.data ?? []).filter((j) => j.status === 'done');
  const toCollect = unpaid.reduce((s, j) => s + j.totals.outstanding, 0);
  const owned = useMemo(() => (tools.data ?? []).filter((t) => !t.gone_on), [tools.data]);
  const toolInfo = toolTotals(owned);
  const lastExport = settings.data?.last_export_at;
  const backupDue = me.role === 'admin' && settings.isSuccess && (!lastExport || Date.now() - new Date(lastExport).getTime() > 30 * 86_400_000);

  return (
    <>
      <PageHeader
        title={settings.data?.workshop_name ?? 'Workshop'}
        actions={
          <Button variant="ghost" size="icon" asChild aria-label="Search">
            <Link to="/search">
              <Search className="size-6" />
            </Link>
          </Button>
        }
      />
      <PageBody>
        {backupDue && (
          <Link to="/export" className="flex items-center gap-3 rounded-xl border border-warning/50 bg-warning/10 px-4 py-2.5 text-sm">
            <DatabaseBackup className="size-5 shrink-0" />
            <span className="flex-1">{lastExport ? `Last backup ${formatDate(lastExport)}.` : 'No backup made yet.'} Save a copy now.</span>
            <ChevronRight className="size-5 text-muted-foreground" />
          </Link>
        )}

        <nav className="grid grid-cols-2 gap-3 pc:grid-cols-3" aria-label="Areas">
          <Tile to="/cars" icon={Car} label="Cars" note={cars.data && `${activeCars} in progress`} />
          <Tile
            to="/jobs"
            icon={Wrench}
            label="Jobs"
            note={jobs.data && `${openJobs} open`}
            alert={unpaid.length > 0 ? `${unpaid.length} not paid${toCollect > 0 ? ` · ${formatMoney(toCollect)}` : ''}` : null}
          />
          <Tile
            to="/inventory"
            icon={Package}
            label="Parts"
            note={items.data && count(items.data.filter((i) => !i.archived_at).length, 'item')}
            alert={lowStock > 0 ? `${lowStock} running low` : null}
          />
          <Tile
            to="/money"
            icon={Wallet}
            label="Money"
            note={wallet !== null && <span className={cn('tabular-nums', wallet < 0 && 'text-destructive')}>{formatMoney(wallet)}</span>}
          />
          <Tile to="/manuals" icon={BookOpen} label="Manuals" note="Services and repairs" />
          <Tile
            to="/inventory/tools"
            icon={Hammer}
            label="Tools"
            note={tools.data && (toolInfo.lent > 0 ? `${toolInfo.lent} lent out` : count(owned.length, 'tool'))}
            alert={toolInfo.needsWork > 0 ? `${toolInfo.needsWork} to repair` : null}
          />
        </nav>

        <AddNew />
      </PageBody>
    </>
  );
}

function Tile({ to, icon: Icon, label, note, alert }: { to: string; icon: LucideIcon; label: string; note: ReactNode; alert?: string | null }) {
  return (
    <Link to={to} className="flex min-h-36 flex-col gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/50 active:bg-muted">
      <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="size-7 text-primary" />
      </span>
      <span className="min-w-0">
        <span className="block text-lg leading-tight font-semibold">{label}</span>
        <span className="block truncate text-sm text-muted-foreground">{note || <Skeleton className="mt-1 inline-block h-4 w-20" />}</span>
        {alert && <span className="block truncate text-sm font-medium text-destructive">{alert}</span>}
      </span>
    </Link>
  );
}
