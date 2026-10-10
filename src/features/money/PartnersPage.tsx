import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeftRight, ChevronRight } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/domain/money';
import { formatShare } from '@/domain/shares';
import { cn } from '@/lib/utils';
import { useAccounts } from './accounts';
import { usePartnerPositions, useTransactions, type PartnerRow, type TransactionRow } from './api';
import { MoneyEntryDrawer, modeOf, type EntryMode, type EntryPrefill } from './MoneyEntryDrawer';
import { usePartnerAllocations } from '@/features/settlement/api';
import { formatDate } from '@/domain/dates';
import { carTitle } from '@/domain/cars';
import { TransactionList } from './TransactionList';

function Figures({ p }: { p: PartnerRow }) {
  return (
    <dl className="grid grid-cols-3 gap-2 text-sm">
      <div>
        <dt className="text-muted-foreground">Put in</dt>
        <dd className="font-medium tabular-nums">{formatMoney(p.putIn)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Taken out</dt>
        <dd className="font-medium tabular-nums">{formatMoney(p.takenOut)}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">Profit share</dt>
        <dd className={cn('font-medium tabular-nums', p.profitShare < 0 && 'text-destructive')}>{formatMoney(p.profitShare, { sign: true })}</dd>
      </div>
    </dl>
  );
}

export function PartnersPage() {
  const positions = usePartnerPositions();
  const total = (positions ?? []).reduce((s, p) => s + p.balance, 0);
  return (
    <>
      <PageHeader title="Partners" back="/money" />
      <PageBody>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Balance</strong> = what the workshop owes each partner: put in − taken out +
          share of profits and losses. Together the balances are worth{' '}
          <span className="font-semibold text-foreground">{formatMoney(total)}</span>.
        </p>
        {!positions && <Skeleton className="h-40 rounded-xl" />}
        {positions?.map((p) => (
          <Link key={p.partnerId} to={`/partners/${p.partnerId}`}>
            <Card className="active:bg-muted">
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{formatShare(p.capitalBp)} of the capital</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={cn('text-xl font-semibold tabular-nums', p.balance < 0 && 'text-destructive')}>{formatMoney(p.balance)}</span>
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </div>
                </div>
                <Figures p={p} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </PageBody>
    </>
  );
}

export function PartnerPage() {
  const { id } = useParams();
  const positions = usePartnerPositions();
  const transactions = useTransactions();
  const accounts = useAccounts();
  const wallet = accounts.data?.find((a) => a.kind === 'wallet');
  const partner = positions?.find((p) => p.partnerId === id);
  const [drawer, setDrawer] = useState<{ mode: EntryMode; row?: TransactionRow; prefill?: EntryPrefill } | null>(null);

  const rows = useMemo(
    () => (transactions.data ?? []).filter((t) => partner && (t.from_account_id === partner.accountId || t.to_account_id === partner.accountId)),
    [transactions.data, partner],
  );

  if (!positions) {
    return (
      <>
        <PageHeader title="Partner" back="/partners" />
        <PageBody>
          <Skeleton className="h-40 rounded-xl" />
        </PageBody>
      </>
    );
  }
  if (!partner) {
    return (
      <>
        <PageHeader title="Partner" back="/partners" />
        <PageBody>
          <p className="text-muted-foreground">Partner not found.</p>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title={partner.name} back="/partners" />
      <PageBody>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Balance</p>
              <p className={cn('text-3xl font-semibold tabular-nums', partner.balance < 0 && 'text-destructive')}>{formatMoney(partner.balance)}</p>
            </div>
            <Figures p={partner} />
          </CardContent>
        </Card>
        <Button
          variant="outline"
          size="lg"
          onClick={() => setDrawer({ mode: 'transfer', prefill: { from: wallet?.id, to: partner.accountId, description: 'Pay back' } })}
        >
          <ArrowLeftRight /> Pay back from the wallet
        </Button>
        <h2 className="font-semibold">Money in and out</h2>
        {transactions.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <TransactionList
            rows={rows}
            perspective={partner.accountId}
            onEdit={(row) => {
              const mode = modeOf(row);
              if (mode) setDrawer({ mode, row });
            }}
          />
        )}
        <h2 className="font-semibold">Profit shares</h2>
        <AllocationList partnerId={partner.partnerId} />
        <p className="text-xs text-muted-foreground">
          Green: money that came to {partner.name}. Red: money {partner.name} paid. Profit shares are added when cars and
          jobs are settled, and for workshop overhead.
        </p>
      </PageBody>
      <MoneyEntryDrawer mode={drawer?.mode ?? null} row={drawer?.row} prefill={drawer?.prefill} onClose={() => setDrawer(null)} />
    </>
  );
}

function AllocationList({ partnerId }: { partnerId: string }) {
  const allocations = usePartnerAllocations(partnerId);
  if (allocations.isPending) return <Skeleton className="h-24 rounded-xl" />;
  const rows = allocations.data ?? [];
  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No profit shares yet.</p>;
  }
  return (
    <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
      {rows.map((a) => {
        const source = a.settlement?.car
          ? `Settled ${a.settlement.car.ref} ${carTitle(a.settlement.car)}`
          : a.stock_movement
            ? `${a.stock_movement.type === 'overhead' ? 'Workshop use' : (a.stock_movement.reason ?? 'Stock correction')}: ${a.stock_movement.item?.name ?? ''}`
            : a.transaction
              ? `${a.transaction.category === 'other_income' ? 'Other income' : 'Workshop expense'}${a.transaction.description ? `: ${a.transaction.description}` : ''}`
              : 'Profit share';
        return (
          <li key={a.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{source}</p>
              <p className="text-sm text-muted-foreground">{formatDate(a.occurred_on)}</p>
            </div>
            <span className={cn('shrink-0 font-semibold tabular-nums', a.amount_cents < 0 ? 'text-destructive' : 'text-success')}>
              {formatMoney(a.amount_cents, { sign: true })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
