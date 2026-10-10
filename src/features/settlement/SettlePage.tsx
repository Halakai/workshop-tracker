import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { ArrowRight, Loader2, Pencil } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { DateField } from '@/components/DateField';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/Checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { carTitle, isClosed, type CarStatus } from '@/domain/cars';
import { formatMoney } from '@/domain/money';
import { FULL_SHARE_BP, formatShare } from '@/domain/shares';
import { carFunding, settle, type PayoutMode, type SettlementInput } from '@/domain/settlement';
import { todayIso } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { useAccounts } from '@/features/money/accounts';
import { useAccountLabels } from '@/features/money/api';
import { useCar, useCarMoney } from '@/features/cars/api';
import { useProfiles } from '@/features/auth/profiles';
import { useRecordSettlement, useShares, type Target } from './api';
import { toRecordSettlementArgs } from './rpc';
import { SharesDrawer } from './SharesDrawer';


/** Settle up a sold or scrapped car. */
export function SettlePage() {
  const { id } = useParams();
  const car = useCar(id);
  const money = useCarMoney(id);
  if (car.isPending) {
    return (
      <>
        <PageHeader title="Settle up" back />
        <PageBody>
          <Skeleton className="h-64 rounded-xl" />
        </PageBody>
      </>
    );
  }
  if (!car.data) return null;
  const c = car.data;
  return (
    <SettleView
      target={{ kind: 'car', id: c.id }}
      title={`Settle up ${c.ref}`}
      subtitle={carTitle(c)}
      backTo={`/cars/${c.id}`}
      settled={Boolean(c.settled_at)}
      ready={isClosed(c.status as CarStatus)}
      notReady="Sell (or scrap) the car first; then settle up."
      rows={money.data}
      stockCents={c.money.stock}
      defaultDate={c.sale_date ?? todayIso()}
      costWord="car"
    />
  );
}

export interface SettleViewProps {
  target: Target;
  title: string;
  subtitle: string;
  backTo: string;
  settled: boolean;
  ready: boolean;
  notReady: string;
  rows: { category: string; from_account_id: string; to_account_id: string; amount_cents: number }[] | undefined;
  stockCents: number;
  defaultDate: string;
  costWord: 'car' | 'job';
}

/** Shared settle-up screen for cars and jobs. */
export function SettleView({ target, title, subtitle, backTo, settled, ready, notReady, rows, stockCents, defaultDate, costWord }: SettleViewProps) {
  const goBack = useGoBack();
  const sharesQuery = useShares(target);
  const accounts = useAccounts();
  const profiles = useProfiles();
  const label = useAccountLabels();
  const record = useRecordSettlement();
  const [mode, setMode] = useState<PayoutMode>('retain');
  const [reimburse, setReimburse] = useState(true);
  const [date, setDate] = useState(defaultDate);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [editingShares, setEditingShares] = useState(false);

  const wallet = accounts.data?.find((a) => a.kind === 'wallet');
  const shares = useMemo(
    () =>
      (sharesQuery.data ?? []).map((s) => ({
        partnerId: s.partner_id,
        accountId: accounts.data?.find((a) => a.partner_id === s.partner_id)?.id ?? '',
        bp: s.share_bp,
        name: profiles.data?.find((p) => p.id === s.partner_id)?.display_name ?? 'partner',
      })),
    [sharesQuery.data, accounts.data, profiles.data],
  );
  const sharesTotal = shares.reduce((s, x) => s + x.bp, 0);

  const computed = useMemo(() => {
    if (!wallet || !rows || sharesTotal !== FULL_SHARE_BP) return null;
    const funding = carFunding(
      rows.map((r) => ({ category: r.category, from: r.from_account_id, to: r.to_account_id, amount: r.amount_cents })),
      stockCents,
      wallet.id,
    );
    const input: SettlementInput = { walletAccountId: wallet.id, shares, ...funding, mode, reimburse };
    return { input, result: settle(input) };
  }, [wallet, rows, shares, sharesTotal, stockCents, mode, reimburse]);

  if (settled || !ready) {
    return (
      <>
        <PageHeader title="Settle up" back={backTo} />
        <PageBody>
          <p className="text-muted-foreground">{settled ? 'This is already settled.' : notReady}</p>
        </PageBody>
      </>
    );
  }

  const submit = async () => {
    if (!computed) return;
    try {
      await record.mutateAsync(
        toRecordSettlementArgs(
          target.kind === 'car' ? { carId: target.id } : { jobId: target.id },
          computed.input,
          computed.result,
          date,
          computed.result.transfers.map((_, i) => !skipped.has(i)),
        ),
      );
      toast.success('Settled');
      goBack(backTo);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  const r = computed?.result;
  return (
    <>
      <PageHeader title={title} back={backTo} />
      <PageBody>
        <p className="text-sm text-muted-foreground">{subtitle}</p>

        <Card>
          <CardHeader>
            <CardTitle>Profit shares</CardTitle>
            <CardAction>
              <Button variant="outline" size="sm" onClick={() => setEditingShares(true)}>
                <Pencil /> Change
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {shares.map((s) => (
              <div key={s.partnerId} className="flex justify-between">
                <span>{s.name}</span>
                <span className="font-medium">{formatShare(s.bp)}</span>
              </div>
            ))}
            {sharesTotal !== FULL_SHARE_BP && (
              <p className="text-destructive">Shares add up to {formatShare(sharesTotal)}. Change them to 100 % first.</p>
            )}
          </CardContent>
        </Card>

        {r && computed && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>The numbers</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <Block title={`Who paid for the ${costWord}`}>
                  {[...computed.input.costs].map(([acc, amount]) => (
                    <Row key={acc} label={acc === wallet?.id ? 'Wallet (incl. parts from stock)' : label(acc)} value={formatMoney(amount)} />
                  ))}
                  <Row label="Total invested" value={formatMoney(r.invested)} strong />
                </Block>
                <Block title={costWord === 'car' ? 'Who holds the sale money' : 'Who got the customer’s money'}>
                  {[...computed.input.receipts].map(([acc, amount]) => (
                    <Row key={acc} label={label(acc)} value={formatMoney(amount)} />
                  ))}
                  {computed.input.receipts.size === 0 && <Row label="Nobody (no money received)" value={formatMoney(0)} />}
                </Block>
                <Block title={r.profit >= 0 ? 'Profit, split by shares' : 'Loss, split by shares'}>
                  <Row label="Total" value={formatMoney(r.profit, { sign: true })} strong className={r.profit >= 0 ? 'text-success' : 'text-destructive'} />
                  {shares.map((s) => (
                    <Row
                      key={s.partnerId}
                      label={s.name}
                      value={formatMoney(r.allocations.find((a) => a.partnerId === s.partnerId)?.amount ?? 0, { sign: true })}
                    />
                  ))}
                  <p className="text-xs text-muted-foreground">Added to each partner’s balance.</p>
                </Block>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Where the money goes</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ToggleGroup type="single" variant="outline" className="grid w-full grid-cols-2" value={mode} onValueChange={(v) => v && setMode(v as PayoutMode)}>
                  <ToggleGroupItem value="retain" className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                    Keep profit in wallet
                  </ToggleGroupItem>
                  <ToggleGroupItem value="payout" className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                    Pay out profit
                  </ToggleGroupItem>
                </ToggleGroup>
                <label className="flex items-center gap-3 text-sm">
                  <Switch checked={reimburse} onCheckedChange={setReimburse} />
                  Pay back what partners paid out of their own pocket
                </label>
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Who gives whom</p>
                  {r.transfers.length === 0 && <p className="text-sm text-muted-foreground">Nothing to move: the money is already where it belongs.</p>}
                  {r.transfers.map((t, i) => (
                    <label key={`${t.from}-${t.to}`} className={cn('flex items-center gap-3 rounded-lg border p-3', skipped.has(i) && 'opacity-50')}>
                      <Checkbox
                        checked={!skipped.has(i)}
                        onChange={(checked) =>
                          setSkipped((s) => {
                            const next = new Set(s);
                            if (checked) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                      />
                      <span className="flex flex-1 items-center gap-2 font-medium">
                        {label(t.from)} <ArrowRight className="size-4" /> {label(t.to)}
                      </span>
                      <span className="font-semibold tabular-nums">{formatMoney(t.amount)}</span>
                    </label>
                  ))}
                  {r.transfers.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Untick a transfer if you’ll do it differently. Balances stay correct either way; it only changes where
                      the cash is.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Date</p>
                  <DateField value={date} onChange={setDate} />
                </div>
              </CardContent>
            </Card>

            <Button size="lg" disabled={record.isPending} onClick={submit}>
              {record.isPending && <Loader2 className="animate-spin" />}
              Record settlement
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Afterwards the {costWord}’s money is locked. You can undo the settlement on the {costWord} page.
            </p>
          </>
        )}
      </PageBody>
      <SharesDrawer target={target} open={editingShares} onOpenChange={setEditingShares} />
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn('flex justify-between gap-2', strong && 'font-semibold', className)}>
      <span className={strong ? undefined : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
