import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Banknote, Car as CarIcon, ChevronRight, ExternalLink, Handshake, Package, Pencil, Phone, Receipt, Undo2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmButton } from '@/components/ConfirmButton';
import { syncErrorMessage } from '@/lib/errors';
import { useProfiles } from '@/features/auth/profiles';
import { useSettlement, useShares, useUndoSettlement } from '@/features/settlement/api';
import { SharesDrawer } from '@/features/settlement/SharesDrawer';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { AddedBy } from '@/components/AddedBy';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { carTitle, isClosed, type CarStatus } from '@/domain/cars';
import { formatMoney } from '@/domain/money';
import { formatPercentBp, formatShare } from '@/domain/shares';
import { formatInteger, formatQuantity, toMilli } from '@/domain/quantity';
import { formatDate } from '@/domain/dates';
import { cn } from '@/lib/utils';
import { usePayerOptions } from '@/features/money/accounts';
import { useCar, useCarMoney, useCarStock, type Car, type CarMoneyRow, type CarStockRow } from './api';
import { CarStatusBadge } from './CarCard';
import { CarMoneyDrawer, type CarMoneyKind } from './CarMoneyDrawer';
import { SaleDrawer } from './SaleDrawer';
import { StatusDrawer } from './StatusDrawer';
import { ReturnToStockDrawer, UseOnCarDrawer } from './CarStockDrawers';

export function CarPage() {
  const { id } = useParams();
  const car = useCar(id);
  if (car.isPending) {
    return (
      <>
        <PageHeader title="Car" back="/cars" />
        <PageBody>
          <Skeleton className="h-48 rounded-xl" />
        </PageBody>
      </>
    );
  }
  if (!car.data) {
    return (
      <>
        <PageHeader title="Car" back="/cars" />
        <PageBody>
          <p className="text-muted-foreground">This car doesn’t exist (anymore).</p>
        </PageBody>
      </>
    );
  }
  return <CarView car={car.data} />;
}

type Entry =
  | { kind: 'money'; row: CarMoneyRow; date: string; created: string }
  | { kind: 'stock'; row: CarStockRow; date: string; created: string };

function CarView({ car }: { car: Car }) {
  const money = useCarMoney(car.id);
  const stock = useCarStock(car.id);
  const payers = usePayerOptions();
  const [moneyDrawer, setMoneyDrawer] = useState<{ kind: CarMoneyKind; row?: CarMoneyRow } | null>(null);
  const [selling, setSelling] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [usingStock, setUsingStock] = useState(false);
  const [returning, setReturning] = useState<string | null>(null);
  const [editingShares, setEditingShares] = useState(false);
  const target = { kind: 'car' as const, id: car.id };
  const shares = useShares(target);
  const settlement = useSettlement(target);
  const undoSettlement = useUndoSettlement();
  const profiles = useProfiles();
  const partnerName = (id: string) => profiles.data?.find((p) => p.id === id)?.display_name ?? 'partner';

  const status = car.status as CarStatus;
  const settled = Boolean(car.settled_at);
  const locked = settled;
  const { totals } = car;
  const hasPurchase = (money.data ?? []).some((r) => r.category === 'car_purchase');

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [
      ...(money.data ?? []).filter((r) => ['car_purchase', 'car_part', 'car_cost'].includes(r.category)).map((row) => ({ kind: 'money' as const, row, date: row.occurred_on, created: row.created_at })),
      ...(stock.data ?? []).map((row) => ({ kind: 'stock' as const, row, date: row.occurred_on, created: row.created_at })),
    ];
    return list.sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  }, [money.data, stock.data]);

  const payerLabel = (accountId: string) => payers.find((p) => p.accountId === accountId)?.label ?? '—';
  const saleRows = (money.data ?? []).filter((r) => r.category === 'car_sale');

  return (
    <>
      <PageHeader
        title={carTitle(car)}
        back="/cars"
        actions={
          !locked && (
            <Button variant="ghost" size="icon" asChild aria-label="Edit car">
              <Link to={`/cars/${car.id}/edit`}>
                <Pencil className="size-5" />
              </Link>
            </Button>
          )
        }
      />
      <PageBody>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-sm font-semibold">{car.ref}</span>
          {car.plate && <span className="rounded-md border px-2 py-0.5 font-mono text-sm">{car.plate}</span>}
          <button type="button" disabled={locked} onClick={() => setStatusOpen(true)} className="ml-auto">
            <CarStatusBadge status={status} />
          </button>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            <Line label="Purchase" value={hasPurchase ? formatMoney(car.money.purchase) : '—'} />
            <Line label="Parts from stock" value={formatMoney(car.money.stock)} />
            <Line label="Parts bought" value={formatMoney(car.money.parts)} />
            <Line label="Other costs" value={formatMoney(car.money.otherCosts)} />
            <div className="my-1 border-t" />
            <Line label="Total invested" value={formatMoney(totals.invested)} strong />
            {totals.profit !== null && (
              <>
                <Line label={status === 'scrapped' ? 'Scrap money' : 'Sale'} value={formatMoney(totals.sale)} />
                <div className="my-1 border-t" />
                <Line
                  label={totals.profit >= 0 ? 'Profit' : 'Loss'}
                  value={formatMoney(totals.profit, { sign: true })}
                  strong
                  className={totals.profit >= 0 ? 'text-success' : 'text-destructive'}
                />
                <div className="flex justify-end gap-3 text-xs text-muted-foreground">
                  {totals.marginBp !== null && <span>Margin {formatPercentBp(totals.marginBp)}</span>}
                  {totals.roiBp !== null && <span>ROI {formatPercentBp(totals.roiBp)}</span>}
                </div>
              </>
            )}
            {status === 'listed' && car.asking_price_cents != null && (
              <p className="mt-1 text-muted-foreground">
                Asking {formatMoney(car.asking_price_cents)}
                {car.listing_url && (
                  <a href={car.listing_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-primary">
                    ad <ExternalLink className="size-3" />
                  </a>
                )}
              </p>
            )}
          </CardContent>
        </Card>

        {!locked && (
          <div className="grid grid-cols-2 gap-2">
            {!hasPurchase && money.isSuccess && (
              <QuickAction icon={Banknote} label="Purchase price" onClick={() => setMoneyDrawer({ kind: 'purchase' })} />
            )}
            <QuickAction icon={Package} label="From stock" onClick={() => setUsingStock(true)} />
            <QuickAction icon={Wrench} label="Part bought" onClick={() => setMoneyDrawer({ kind: 'part' })} />
            <QuickAction icon={Receipt} label="Other cost" onClick={() => setMoneyDrawer({ kind: 'cost' })} />
            <QuickAction
              icon={CarIcon}
              label={status === 'scrapped' ? 'Scrap money' : saleRows.length ? 'Sale' : 'Sell'}
              onClick={() => setSelling(true)}
            />
          </div>
        )}
        {settled && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Settled on {formatDate(car.settled_at)}. The car’s money can’t be changed anymore.
          </p>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Costs</h2>
          {(money.isPending || stock.isPending) && <Skeleton className="h-16 rounded-xl" />}
          {money.isSuccess && stock.isSuccess && entries.length === 0 && (
            <p className="text-sm text-muted-foreground">No costs yet.</p>
          )}
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
            {entries.map((e) =>
              e.kind === 'money' ? (
                <MoneyRow
                  key={e.row.id}
                  row={e.row}
                  payer={payerLabel(e.row.from_account_id)}
                  onOpen={locked ? undefined : () => setMoneyDrawer({ kind: moneyKind(e.row), row: e.row })}
                />
              ) : (
                <StockRow key={e.row.id} row={e.row} onReturn={locked ? undefined : () => setReturning(e.row.item_id)} />
              ),
            )}
          </ul>
        </section>

        {saleRows.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">{status === 'scrapped' ? 'Scrap money' : 'Sale'}</h2>
            <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
              {saleRows.map((r) => (
                <li key={r.id}>
                  <button type="button" disabled={locked} onClick={() => setSelling(true)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted">
                    <Banknote className="size-5 text-success" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{r.counterparty ? `Sold to ${r.counterparty}` : 'Sold'}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(r.occurred_on)} · received by {payerLabel(r.to_account_id)}
                      </p>
                    </div>
                    <span className="font-semibold text-success tabular-nums">{formatMoney(r.amount_cents)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              {car.vin && <Detail label="VIN" value={car.vin} mono />}
              {car.engine && <Detail label="Engine" value={car.engine} />}
              {car.fuel && <Detail label="Fuel" value={car.fuel} />}
              {car.colour && <Detail label="Colour" value={car.colour} />}
              {car.mileage_km != null && <Detail label="Mileage bought" value={`${formatInteger(car.mileage_km)} km`} />}
              {car.sale_mileage_km != null && <Detail label="Mileage sold" value={`${formatInteger(car.sale_mileage_km)} km`} />}
              <Detail label="Bought on" value={formatDate(car.purchase_date)} />
              {car.sale_date && <Detail label={status === 'scrapped' ? 'Scrapped on' : 'Sold on'} value={formatDate(car.sale_date)} />}
            </dl>
            {car.seller && <ContactLine label="Bought from" name={car.seller.name} phone={car.seller.phone} />}
            {car.buyer && <ContactLine label={status === 'scrapped' ? 'Scrapyard' : 'Sold to'} name={car.buyer.name} phone={car.buyer.phone} />}
            {car.notes && <p className="whitespace-pre-wrap">{car.notes}</p>}
            <AddedBy by={car.created_by} at={car.created_at} />
          </CardContent>
        </Card>

        {!settled && (
          <Card>
            <CardHeader>
              <CardTitle>Profit shares</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p>
                {(shares.data ?? []).length === 0
                  ? 'Not set'
                  : (shares.data ?? []).map((s) => `${partnerName(s.partner_id)} ${formatShare(s.share_bp)}`).join(' · ')}
              </p>
              <Button variant="outline" size="sm" className="self-start" onClick={() => setEditingShares(true)}>
                <Pencil /> Change for this car
              </Button>
            </CardContent>
          </Card>
        )}

        {isClosed(status) && !settled && (
          <Button size="lg" asChild>
            <Link to={`/cars/${car.id}/settle`}>
              <Handshake /> Settle up
            </Link>
          </Button>
        )}

        {settled && settlement.data && (
          <Card>
            <CardHeader>
              <CardTitle>Settled {formatDate(settlement.data.settled_on)}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground">
                {settlement.data.payout_mode === 'retain' ? 'Profit kept in the wallet' : 'Profit paid out'}
                {settlement.data.reimburse ? ', out-of-pocket costs paid back' : ''}.
              </p>
              {settlement.data.allocations.map((a) => (
                <div key={a.partner_id} className="flex justify-between">
                  <span>{partnerName(a.partner_id)}</span>
                  <span className={cn('font-medium tabular-nums', a.amount_cents < 0 && 'text-destructive')}>
                    {formatMoney(a.amount_cents, { sign: true })}
                  </span>
                </div>
              ))}
              {settlement.data.transactions.map((t) => (
                <p key={t.id} className="text-muted-foreground">
                  {payerLabel(t.from_account_id)} → {payerLabel(t.to_account_id)}: {formatMoney(t.amount_cents)}
                </p>
              ))}
              <ConfirmButton
                variant="ghost"
                className="self-start"
                title="Undo the settlement?"
                description="Its profit split and transfers are removed and the car can be changed again."
                confirmLabel="Undo settlement"
                onConfirm={async () => {
                  try {
                    await undoSettlement.mutateAsync(target);
                    toast.success('Settlement undone');
                  } catch (e) {
                    toast.error(syncErrorMessage(e));
                  }
                }}
              >
                <Undo2 /> Undo settlement
              </ConfirmButton>
            </CardContent>
          </Card>
        )}
      </PageBody>

      <CarMoneyDrawer car={car} kind={moneyDrawer?.kind ?? null} row={moneyDrawer?.row} onClose={() => setMoneyDrawer(null)} />
      <SaleDrawer car={car} open={selling} onOpenChange={setSelling} />
      <StatusDrawer car={car} open={statusOpen} onOpenChange={setStatusOpen} onSell={() => setSelling(true)} />
      <UseOnCarDrawer car={car} open={usingStock} onOpenChange={setUsingStock} />
      <ReturnToStockDrawer car={car} itemId={returning} rows={stock.data ?? []} onClose={() => setReturning(null)} />
      <SharesDrawer target={target} open={editingShares} onOpenChange={setEditingShares} />
    </>
  );
}

function moneyKind(row: CarMoneyRow): CarMoneyKind {
  return row.category === 'car_purchase' ? 'purchase' : row.category === 'car_part' ? 'part' : 'cost';
}

function Line({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn('flex justify-between gap-2', strong && 'text-base font-semibold', className)}>
      <span className={strong ? undefined : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick }: { icon: typeof Package; label: string; onClick: () => void }) {
  return (
    <Button variant="outline" className="h-16 flex-col gap-1" onClick={onClick}>
      <Icon className="size-5 text-primary" />
      {label}
    </Button>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-medium break-all', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}

function ContactLine({ label, name, phone }: { label: string; name: string; phone: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <p className="text-muted-foreground">{label}</p>
        <p className="font-medium">{name}</p>
      </div>
      {phone && (
        <Button variant="outline" size="sm" asChild>
          <a href={`tel:${phone.replace(/\s/g, '')}`}>
            <Phone /> {phone}
          </a>
        </Button>
      )}
    </div>
  );
}

function MoneyRow({ row, payer, onOpen }: { row: CarMoneyRow; payer: string; onOpen?: () => void }) {
  const title =
    row.category === 'car_purchase'
      ? 'Purchase'
      : row.category === 'car_part'
        ? (row.description ?? 'Part')
        : [row.expense_category?.name, row.description].filter(Boolean).join(': ');
  const Icon = row.category === 'car_purchase' ? Banknote : row.category === 'car_part' ? Wrench : Receipt;
  const meta = [formatDate(row.occurred_on), `paid by ${payer}`, row.category !== 'car_purchase' && row.counterparty].filter(Boolean).join(' · ');
  const content = (
    <>
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{title}</span>
          <span className="font-semibold tabular-nums">{formatMoney(row.amount_cents)}</span>
        </div>
        <p className="truncate text-sm text-muted-foreground">{meta}</p>
        <AddedBy by={row.created_by} at={row.created_at} />
      </div>
      {onOpen && <ChevronRight className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
    </>
  );
  return (
    <li>
      {onOpen ? (
        <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-muted">
          {content}
        </button>
      ) : (
        <div className="flex items-start gap-3 px-4 py-3">{content}</div>
      )}
    </li>
  );
}

function StockRow({ row, onReturn }: { row: CarStockRow; onReturn?: () => void }) {
  const qty = toMilli(row.qty_delta);
  const isReturn = row.type === 'return';
  const unitName = row.item?.unit?.name ?? '';
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {isReturn ? <Undo2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" /> : <Package className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <Link to={`/stock/${row.item_id}`} className="truncate font-medium underline-offset-2 hover:underline">
            {row.item?.name ?? 'Item'}
          </Link>
          <span className={cn('font-semibold tabular-nums', isReturn && 'text-success')}>
            {formatMoney(-row.value_delta_cents, { sign: isReturn })}
          </span>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {formatDate(row.occurred_on)} · {isReturn ? 'returned' : 'from stock'} {formatQuantity(Math.abs(qty), unitName)}
          {row.item?.part_number && ` · ${row.item.part_number}`}
        </p>
        <div className="flex items-center justify-between">
          <AddedBy by={row.created_by} at={row.created_at} />
          {onReturn && !isReturn && (
            <Button variant="ghost" size="sm" onClick={onReturn}>
              <Undo2 /> Return
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
