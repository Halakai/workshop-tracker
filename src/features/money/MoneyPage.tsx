import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Banknote, Receipt, Users } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/domain/money';
import { cn } from '@/lib/utils';
import { useAccounts } from './accounts';
import { useTransactions, useWalletBalance, type TransactionRow } from './api';
import { MoneyEntryDrawer, modeOf, type EntryMode } from './MoneyEntryDrawer';
import { TransactionList } from './TransactionList';

type Filter = 'wallet' | 'all' | 'expenses' | 'income' | 'moves';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'wallet', label: 'Wallet' },
  { value: 'all', label: 'Everything' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'income', label: 'Income' },
  { value: 'moves', label: 'Deposits & transfers' },
];

export function MoneyPage() {
  const balance = useWalletBalance();
  const transactions = useTransactions();
  const accounts = useAccounts();
  const wallet = accounts.data?.find((a) => a.kind === 'wallet');
  const [filter, setFilter] = useState<Filter>('wallet');
  const [drawer, setDrawer] = useState<{ mode: EntryMode; row?: TransactionRow } | null>(null);

  const rows = useMemo(() => {
    const all = transactions.data ?? [];
    switch (filter) {
      case 'wallet':
        return all.filter((t) => t.from_account_id === wallet?.id || t.to_account_id === wallet?.id);
      case 'expenses':
        return all.filter((t) => t.kind === 'expense');
      case 'income':
        return all.filter((t) => t.kind === 'income');
      case 'moves':
        return all.filter((t) => t.kind === 'deposit' || t.kind === 'withdrawal' || t.kind === 'transfer');
      default:
        return all;
    }
  }, [transactions.data, filter, wallet?.id]);

  const actions: { mode: EntryMode; label: string; icon: typeof Receipt }[] = [
    { mode: 'expense', label: 'Expense', icon: Receipt },
    { mode: 'deposit', label: 'Put in', icon: ArrowDownToLine },
    { mode: 'withdrawal', label: 'Take out', icon: ArrowUpFromLine },
    { mode: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
    { mode: 'income', label: 'Income', icon: Banknote },
  ];

  return (
    <>
      <PageHeader
        title="Money"
        back="/more"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/partners">
              <Users /> Partners
            </Link>
          </Button>
        }
      />
      <PageBody>
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Workshop wallet</p>
            {balance === null ? (
              <Skeleton className="mt-1 h-9 w-40" />
            ) : (
              <p className={cn('text-3xl font-semibold tabular-nums', balance < 0 && 'text-destructive')}>{formatMoney(balance)}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">Always calculated from the entries below.</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-5 gap-1.5">
          {actions.map(({ mode, label, icon: Icon }) => (
            <Button key={mode} variant="outline" className="h-16 flex-col gap-1 px-1 text-xs" onClick={() => setDrawer({ mode })}>
              <Icon className="size-5 text-primary" />
              {label}
            </Button>
          ))}
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {FILTERS.map((f) => (
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

        {transactions.isPending ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <TransactionList
            rows={rows}
            perspective={filter === 'wallet' ? wallet?.id : undefined}
            onEdit={(row) => {
              const mode = modeOf(row);
              if (mode) setDrawer({ mode, row });
            }}
          />
        )}
        <p className="text-xs text-muted-foreground">
          Car money is edited on the car, stock purchases on the item. Tap those to open them.
        </p>
      </PageBody>

      <MoneyEntryDrawer mode={drawer?.mode ?? null} row={drawer?.row} onClose={() => setDrawer(null)} />
    </>
  );
}
