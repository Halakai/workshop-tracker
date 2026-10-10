import { useMemo, useState } from 'react';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatMoney } from '@/domain/money';
import { groupTotals, lastMonths, monthLabel, monthlyTotals, type MoneyRow } from '@/domain/dashboard';
import { cn } from '@/lib/utils';

type Period = 'month' | 'year' | '12m';

/** Money out of and into the workshop per month, and what it went on. */
export function MoneyChart({ rows, today }: { rows: MoneyRow[] | undefined; today: string }) {
  const [range, setRange] = useState<'6' | '12'>('6');
  const months = useMemo(() => lastMonths(Number(range), today), [range, today]);
  const [selected, setSelected] = useState(months[months.length - 1]);
  const [period, setPeriod] = useState<Period>('month');

  const totals = useMemo(() => (rows ? monthlyTotals(rows, months) : []), [rows, months]);
  const max = Math.max(1, ...totals.flatMap((t) => [t.out, t.in]));

  const [from, to, periodLabel] = useMemo((): [string, string, string] => {
    if (period === 'year') return [`${today.slice(0, 4)}-01-01`, today, today.slice(0, 4)];
    if (period === '12m') return [`${lastMonths(12, today)[0]}-01`, today, 'last 12 months'];
    return [`${selected}-01`, `${selected}-31`, `${monthLabel(selected)} ${selected.slice(0, 4)}`];
  }, [period, selected, today]);
  const spent = useMemo(() => (rows ? groupTotals(rows, 'out', from, to) : []), [rows, from, to]);
  const earned = useMemo(() => (rows ? groupTotals(rows, 'in', from, to) : []), [rows, from, to]);
  const spentTotal = spent.reduce((s, g) => s + g.amount, 0);
  const earnedTotal = earned.reduce((s, g) => s + g.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Money in & out</CardTitle>
        <CardAction>
          <ToggleGroup type="single" variant="outline" size="sm" value={range} onValueChange={(v) => v && setRange(v as '6' | '12')}>
            <ToggleGroupItem value="6">6 mo</ToggleGroupItem>
            <ToggleGroupItem value="12">12 mo</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!rows ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="flex h-40 items-end gap-1" role="list" aria-label="Money per month">
            {totals.map((t) => (
              <button
                key={t.month}
                type="button"
                role="listitem"
                aria-label={`${monthLabel(t.month)}: out ${formatMoney(t.out)}, in ${formatMoney(t.in)}`}
                onClick={() => {
                  setSelected(t.month);
                  setPeriod('month');
                }}
                className={cn(
                  'flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-md pt-1 transition-colors',
                  period === 'month' && selected === t.month ? 'bg-muted' : 'active:bg-muted',
                )}
              >
                <span className="flex w-full flex-1 items-end justify-center gap-0.5 px-0.5">
                  <span className="w-1/2 max-w-4 rounded-t-sm bg-primary" style={{ height: `${(t.out / max) * 100}%` }} />
                  <span className="w-1/2 max-w-4 rounded-t-sm bg-success" style={{ height: `${(t.in / max) * 100}%` }} />
                </span>
                <span className="text-[11px] text-muted-foreground">{monthLabel(t.month)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-primary" /> Out (expenses)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-success" /> In (sales, payments)
          </span>
        </div>

        <div className="flex flex-col gap-3 border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{periodLabel}</p>
            <ToggleGroup type="single" variant="outline" size="sm" value={period} onValueChange={(v) => v && setPeriod(v as Period)}>
              <ToggleGroupItem value="month">Month</ToggleGroupItem>
              <ToggleGroupItem value="year">Year</ToggleGroupItem>
              <ToggleGroupItem value="12m">12 mo</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Figure label="Out" value={formatMoney(spentTotal)} />
            <Figure label="In" value={formatMoney(earnedTotal)} />
            <Figure
              label="Difference"
              value={formatMoney(earnedTotal - spentTotal)}
              className={earnedTotal - spentTotal < 0 ? 'text-destructive' : 'text-success'}
            />
          </div>
          <Breakdown title="Spent on" groups={spent} barClass="bg-primary" />
          <Breakdown title="Came from" groups={earned} barClass="bg-success" />
          {rows && spent.length === 0 && earned.length === 0 && (
            <p className="text-sm text-muted-foreground">No expenses or income in this period.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-1 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-semibold tabular-nums', className)}>{value}</p>
    </div>
  );
}

function Breakdown({ title, groups, barClass }: { title: string; groups: { label: string; amount: number }[]; barClass: string }) {
  if (groups.length === 0) return null;
  const top = groups[0].amount || 1;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-1">
          <div className="flex justify-between gap-2 text-sm">
            <span className="truncate">{g.label}</span>
            <span className="font-medium tabular-nums">{formatMoney(g.amount)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn('h-full rounded-full', barClass)} style={{ width: `${Math.max(2, (g.amount / top) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
