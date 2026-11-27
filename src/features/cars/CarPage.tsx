import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Banknote,
  BookOpen,
  Car as CarIcon,
  ChevronRight,
  Disc3,
  ExternalLink,
  Eye,
  Handshake,
  Lock,
  Package,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Undo2,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmButton } from '@/components/ConfirmButton';
import { FormDrawer } from '@/components/FormDrawer';
import { syncErrorMessage } from '@/lib/errors';
import { useProfiles } from '@/features/auth/profiles';
import { useSettlement, useShares, useUndoSettlement } from '@/features/settlement/api';
import { SharesDrawer } from '@/features/settlement/SharesDrawer';
import { AttachmentStrip } from '@/features/files/AttachmentStrip';
import { PhotoGallery, PhotoSection } from '@/features/files/Photos';
import { WebsiteCard } from '@/features/website/WebsiteCard';
import { KeysCard } from '@/features/keys/CustomerAccessCard';
import { ManualRow } from '@/features/manuals/ManualCard';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { AddedBy } from '@/components/AddedBy';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { carTitle, hasWorkshopMoney, isClosed, type CarStatus } from '@/domain/cars';
import { latestMileage, newestFirst } from '@/domain/carServices';
import { formatMoney } from '@/domain/money';
import { formatPercentBp, formatShare } from '@/domain/shares';
import { formatInteger, formatQuantity, toMilli } from '@/domain/quantity';
import { formatDate } from '@/domain/dates';
import { cn } from '@/lib/utils';
import { usePayerOptions } from '@/features/money/accounts';
import { useRememberVisit } from '@/features/home/recent';
import { CarLogo } from '@/components/CarLogo';
import { jobDate, useJobsByCar } from '@/features/jobs/api';
import { useCar, useCarMoney, useCarStock, type Car, type CarMoneyRow, type CarStockRow } from './api';
import { CarStatusBadge } from './CarCard';
import { CarMoneyDrawer, type CarMoneyKind } from './CarMoneyDrawer';
import { SaleDrawer } from './SaleDrawer';
import { StatusDrawer } from './StatusDrawer';
import { PickReturnDrawer, ReturnToStockDrawer, UseOnCarDrawer } from './CarStockDrawers';
import { CarHistory, CarParts } from './CarHistory';
import { ServiceDrawer } from './ServiceDrawer';
import { serviceTitle, useCarServices, type CarService } from './services';
import { OwnerBadge, useOwnerPeople } from './owners';

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

type Tab = 'history' | 'money' | 'parts' | 'info';

/**
 * A car, kept calm: photos, who and what it is, two or three figures, one Add button, and the rest in tabs —
 * History (services and jobs), Money (the workshop's cars) or Parts (our own cars), and Info.
 */
function CarView({ car }: { car: Car }) {
  useRememberVisit('car', car.id);
  const navigate = useNavigate();
  const workshop = hasWorkshopMoney(car);
  const member = car.owner_kind === 'member';
  const customer = car.owner_kind === 'customer';
  const people = useOwnerPeople();
  const jobs = useJobsByCar().get(car.id) ?? [];
  const services = useCarServices(car.id);
  const money = useCarMoney(workshop ? car.id : undefined);
  const stock = useCarStock(customer ? undefined : car.id);

  // a flip is mostly about its money, so that tab comes first; other cars start with their history
  const flip = workshop && car.for_sale;
  const tabs: { value: Tab; label: string }[] = [
    ...(flip ? [{ value: 'money' as const, label: 'Money' }] : []),
    { value: 'history', label: 'History' },
    ...(workshop && !flip ? [{ value: 'money' as const, label: 'Money' }] : []),
    ...(member ? [{ value: 'parts' as const, label: 'Parts' }] : []),
    { value: 'info', label: 'Info' },
  ];
  const [params, setParams] = useSearchParams();
  const tab = tabs.find((t) => t.value === params.get('tab'))?.value ?? tabs[0].value;

  const [adding, setAdding] = useState(false);
  const [newService, setNewService] = useState(false);
  const [moneyDrawer, setMoneyDrawer] = useState<{ kind: CarMoneyKind; row?: CarMoneyRow } | null>(null);
  const [selling, setSelling] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [usingStock, setUsingStock] = useState(false);
  const [returning, setReturning] = useState<string | null>(null);
  const [editingShares, setEditingShares] = useState(false);

  const status = car.status as CarStatus;
  const settled = Boolean(car.settled_at);
  const readyToSettle = workshop && isClosed(status) && !settled;
  const hasPurchase = (money.data ?? []).some((r) => r.category === 'car_purchase');
  const saleRows = (money.data ?? []).filter((r) => r.category === 'car_sale');
  const onTheCar = (stock.data ?? []).some((r) => r.type !== 'return');

  const mileage = latestMileage([
    { km: car.mileage_km, date: null },
    ...jobs.map((j) => ({ km: j.mileage_km, date: jobDate(j) })),
    ...(services.data ?? []).map((s) => ({ km: s.mileage_km, date: s.performed_on })),
  ]);
  const lastWork = newestFirst([
    ...jobs.map((j) => ({ date: jobDate(j), created: j.created_at })),
    ...(services.data ?? []).map((s) => ({ date: s.performed_on, created: s.created_at })),
  ])[0];

  // everything that can be added to this car, in one list
  const actions: Action[] = [];
  if (customer) {
    actions.push({ icon: Wrench, label: 'Job', hint: 'Work we do on it, with parts and an invoice', run: () => navigate(`/jobs/new?car=${car.id}`) });
    actions.push({ icon: Wrench, label: 'Service done elsewhere', hint: 'What another garage did, and its price', run: () => setNewService(true) });
  } else {
    actions.push({
      icon: Wrench,
      label: 'Service',
      hint: workshop ? 'Work done on it; its costs go under it' : 'Work done on it: its parts and the work add up',
      run: () => setNewService(true),
    });
  }
  if (workshop && !settled) {
    actions.push({ icon: Wrench, label: 'Part bought', hint: 'Paid by the wallet or a partner', run: () => setMoneyDrawer({ kind: 'part' }) });
    actions.push({ icon: Receipt, label: 'Other cost', hint: 'Registration, inspection, transport…', run: () => setMoneyDrawer({ kind: 'cost' }) });
    actions.push({ icon: Package, label: 'From stock', hint: 'Parts and oil from our shelves', run: () => setUsingStock(true) });
    if (!hasPurchase && money.isSuccess) {
      actions.push({ icon: Banknote, label: 'Purchase price', hint: 'What we paid for it, and who paid', run: () => setMoneyDrawer({ kind: 'purchase' }) });
    }
    actions.push({
      icon: CarIcon,
      label: status === 'scrapped' ? 'Scrap money' : saleRows.length ? 'Sale' : 'Sell',
      hint: saleRows.length ? 'Change the sale' : 'Who bought it and for how much',
      run: () => setSelling(true),
    });
  }
  if (member) {
    actions.push({ icon: Disc3, label: 'Part bought', hint: 'Tyres, battery, wheels… with their details', run: () => navigate(`/cars/${car.id}/parts/new`) });
    actions.push({ icon: Package, label: 'From workshop stock', hint: 'Charged to the owner at cost', run: () => setUsingStock(true) });
    if (onTheCar) actions.push({ icon: Undo2, label: 'Back to stock', hint: 'Unused parts go back on the shelf', run: () => setReturning('pick') });
  }

  return (
    <>
      <PageHeader
        title={carTitle(car)}
        back="/cars"
        actions={
          <>
            <Button variant="ghost" size="icon" asChild aria-label="Repair manual">
              <Link to={`/cars/${car.id}/manual`}>
                <BookOpen className="size-5" />
              </Link>
            </Button>
            {!settled && (
              <Button variant="ghost" size="icon" asChild aria-label="Edit car">
                <Link to={`/cars/${car.id}/edit`}>
                  <Pencil className="size-5" />
                </Link>
              </Button>
            )}
          </>
        }
      />
      <PageBody>
        {/* photos first, like a marketplace ad */}
        <PhotoGallery
          entityType="car"
          entityId={car.id}
          albums
          className="-mx-4 -mt-4 sm:mx-0 sm:mt-0 sm:rounded-xl"
          empty={(upload, pending) => (
            <div className="-mx-4 -mt-4 flex flex-wrap items-center justify-between gap-2 bg-muted px-4 py-3 sm:mx-0 sm:mt-0 sm:rounded-xl">
              <span className="text-sm text-muted-foreground">{pending > 0 ? 'Uploading…' : 'No photos yet'}</span>
              {upload}
            </div>
          )}
        />

        <div className="flex items-center gap-2">
          <CarLogo make={car.make} className="size-10" />
          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-sm font-semibold">{car.ref}</span>
          {car.plate && <span className="rounded-md border px-2 py-0.5 font-mono text-sm">{car.plate}</span>}
          <span className="ml-auto">
            {workshop ? (
              <button type="button" disabled={settled} onClick={() => setStatusOpen(true)} aria-label="Change status">
                <CarStatusBadge status={status} forSale={car.for_sale} />
              </button>
            ) : (
              <OwnerBadge car={car} people={people} />
            )}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {workshop && <Fact label="Invested" value={formatMoney(car.totals.invested)} />}
          {workshop && car.totals.profit !== null && (
            <Fact
              label={car.totals.profit >= 0 ? 'Profit' : 'Loss'}
              value={formatMoney(car.totals.profit, { sign: true })}
              className={car.totals.profit >= 0 ? 'text-success' : 'text-destructive'}
            />
          )}
          {workshop && car.totals.profit === null && status === 'listed' && car.asking_price_cents != null && (
            <Fact label="Asking" value={formatMoney(car.asking_price_cents)} />
          )}
          {workshop && car.totals.profit === null && status !== 'listed' && <Fact label="Mileage" value={mileage ? `${formatInteger(mileage.km)} km` : '—'} />}
          {!workshop && <Fact label="Mileage" value={mileage ? `${formatInteger(mileage.km)} km` : '—'} />}
          {!workshop && <Fact label={customer ? 'Last time here' : 'Last service'} value={lastWork ? formatDate(lastWork.date) : '—'} />}
        </div>

        {customer && car.owner_contact && (
          <div className="flex items-center gap-3 rounded-xl border px-4 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-muted-foreground">Owner</span>
              <span className="block truncate font-medium">{car.owner_contact.name}</span>
            </span>
            {car.owner_contact.phone && (
              <Button variant="outline" size="sm" asChild>
                <a href={`tel:${car.owner_contact.phone.replace(/\s/g, '')}`}>
                  <Phone /> Call
                </a>
              </Button>
            )}
          </div>
        )}

        {settled && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Settled on {formatDate(car.settled_at)}. The car’s money can’t be changed anymore.
          </p>
        )}
        {readyToSettle && (
          <Button size="lg" asChild>
            <Link to={`/cars/${car.id}/settle`}>
              <Handshake /> Settle up
            </Link>
          </Button>
        )}

        <Button size="lg" variant={readyToSettle ? 'outline' : 'default'} onClick={() => setAdding(true)}>
          <Plus /> Add
        </Button>

        <div className="grid gap-1 rounded-xl bg-muted p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} role="tablist">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setParams({ tab: t.value }, { replace: true })}
              className={cn(
                'flex h-10 items-center justify-center rounded-lg text-sm font-medium text-muted-foreground transition-colors',
                tab === t.value && 'bg-background text-foreground shadow-sm',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'history' && <CarHistory car={car} jobs={jobs} showAdd={false} />}
        {tab === 'money' && (
          <MoneyTab
            car={car}
            money={money.data}
            stock={stock.data}
            loading={money.isPending || stock.isPending}
            services={services.data ?? []}
            onEditMoney={(row) => setMoneyDrawer({ kind: moneyKind(row), row })}
            onReturn={setReturning}
            onSale={() => setSelling(true)}
            onShares={() => setEditingShares(true)}
          />
        )}
        {tab === 'parts' && <CarParts car={car} showAdd={false} />}
        {tab === 'info' && <InfoTab car={car} />}
      </PageBody>

      <FormDrawer open={adding} onOpenChange={setAdding} title={`Add to ${car.ref}`}>
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
          {actions.map((a) => (
            <li key={a.label}>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  a.run();
                }}
                className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left active:bg-muted"
              >
                <a.icon className="size-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{a.label}</span>
                  <span className="block truncate text-sm text-muted-foreground">{a.hint}</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      </FormDrawer>

      <ServiceDrawer car={car} open={newService} onOpenChange={setNewService} onSaved={(id) => navigate(`/cars/${car.id}/services/${id}`)} />
      {workshop && (
        <>
          <CarMoneyDrawer car={car} kind={moneyDrawer?.kind ?? null} row={moneyDrawer?.row} onClose={() => setMoneyDrawer(null)} />
          <SaleDrawer car={car} open={selling} onOpenChange={setSelling} />
          <StatusDrawer car={car} open={statusOpen} onOpenChange={setStatusOpen} onSell={() => setSelling(true)} />
          <SharesDrawer target={{ kind: 'car', id: car.id }} open={editingShares} onOpenChange={setEditingShares} />
        </>
      )}
      {!customer && (
        <>
          <UseOnCarDrawer car={car} open={usingStock} onOpenChange={setUsingStock} />
          <PickReturnDrawer open={returning === 'pick'} rows={stock.data ?? []} onPick={setReturning} onClose={() => setReturning(null)} />
          <ReturnToStockDrawer car={car} itemId={returning === 'pick' ? null : returning} rows={stock.data ?? []} onClose={() => setReturning(null)} />
        </>
      )}
    </>
  );
}

interface Action {
  icon: LucideIcon;
  label: string;
  hint: string;
  run: () => void;
}

function Fact({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-xl border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('truncate font-semibold tabular-nums', className)}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Money (the workshop's cars): what it cost, every cost, the sale, profit shares and the settlement
// ---------------------------------------------------------------------------
type Entry = { kind: 'money'; row: CarMoneyRow; date: string; created: string } | { kind: 'stock'; row: CarStockRow; date: string; created: string };

function MoneyTab({
  car,
  money,
  stock,
  loading,
  services,
  onEditMoney,
  onReturn,
  onSale,
  onShares,
}: {
  car: Car;
  money: CarMoneyRow[] | undefined;
  stock: CarStockRow[] | undefined;
  loading: boolean;
  services: CarService[];
  onEditMoney: (row: CarMoneyRow) => void;
  onReturn: (itemId: string) => void;
  onSale: () => void;
  onShares: () => void;
}) {
  const payers = usePayerOptions();
  const profiles = useProfiles();
  const target = { kind: 'car' as const, id: car.id };
  const shares = useShares(target);
  const settlement = useSettlement(target);
  const undoSettlement = useUndoSettlement();
  const partnerName = (id: string) => profiles.data?.find((p) => p.id === id)?.display_name ?? 'partner';
  const payerLabel = (accountId: string) => payers.find((p) => p.accountId === accountId)?.label ?? '—';
  const serviceOf = (id: string | null) => (id ? services.find((s) => s.id === id) : undefined);
  const status = car.status as CarStatus;
  const settled = Boolean(car.settled_at);
  const { totals } = car;
  const hasPurchase = (money ?? []).some((r) => r.category === 'car_purchase');
  const saleRows = (money ?? []).filter((r) => r.category === 'car_sale');

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [
      ...(money ?? [])
        .filter((r) => ['car_purchase', 'car_part', 'car_cost'].includes(r.category))
        .map((row) => ({ kind: 'money' as const, row, date: row.occurred_on, created: row.created_at })),
      ...(stock ?? []).map((row) => ({ kind: 'stock' as const, row, date: row.occurred_on, created: row.created_at })),
    ];
    return newestFirst(list);
  }, [money, stock]);

  return (
    <>
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

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Costs</h2>
        {loading && <Skeleton className="h-16 rounded-xl" />}
        {!loading && entries.length === 0 && <p className="text-sm text-muted-foreground">No costs yet. Add them with the Add button.</p>}
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border empty:hidden">
          {entries.map((e) =>
            e.kind === 'money' ? (
              <MoneyRow
                key={e.row.id}
                row={e.row}
                payer={payerLabel(e.row.from_account_id)}
                service={serviceOf(e.row.service_id)}
                onOpen={settled ? undefined : () => onEditMoney(e.row)}
              />
            ) : (
              <StockRow key={e.row.id} row={e.row} service={serviceOf(e.row.service_id)} onReturn={settled ? undefined : () => onReturn(e.row.item_id)} />
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
                <button type="button" disabled={settled} onClick={onSale} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted">
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

      {!settled && (
        <button type="button" onClick={onShares} className="flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 text-left active:bg-muted">
          <Handshake className="size-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Profit shares</span>
            <span className="block truncate text-sm text-muted-foreground">
              {(shares.data ?? []).length === 0
                ? 'Not set'
                : (shares.data ?? []).map((s) => `${partnerName(s.partner_id)} ${formatShare(s.share_bp)}`).join(' · ')}
            </span>
          </span>
          <Pencil className="size-4 shrink-0 text-muted-foreground" />
        </button>
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
                <span className={cn('font-medium tabular-nums', a.amount_cents < 0 && 'text-destructive')}>{formatMoney(a.amount_cents, { sign: true })}</span>
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Info: owner, details, manual, photos, papers, keys and the website
// ---------------------------------------------------------------------------
function InfoTab({ car }: { car: Car }) {
  const people = useOwnerPeople();
  const workshop = hasWorkshopMoney(car);
  const status = car.status as CarStatus;
  const ownerName = car.owner_kind === 'member' ? people.members.find((m) => m.id === car.owner_member_id)?.display_name : car.owner_contact?.name;
  const mine = car.owner_kind === 'member' && car.owner_member_id === people.meId;

  return (
    <>
      <Card>
        <CardContent className="flex flex-col gap-3 text-sm">
          {!workshop && (
            <>
              {/* a customer is shown at the top of the page, with a call button */}
              {car.owner_kind === 'member' && (
                <div>
                  <p className="text-muted-foreground">Owner</p>
                  <p className="font-medium">
                    {ownerName ?? 'A partner'}
                    {mine && ' (you)'}
                  </p>
                </div>
              )}
              <p className="flex items-center gap-2 text-muted-foreground">
                {car.is_private ? <Lock className="size-4 shrink-0" /> : <Eye className="size-4 shrink-0" />}
                {car.is_private
                  ? 'Only you can see this car.'
                  : car.owner_kind === 'member'
                    ? 'Everyone in the workshop sees it. What is spent on it is the owner’s, not the workshop’s.'
                    : 'Everyone in the workshop sees it. Work on it goes through jobs.'}
              </p>
              <div className="border-t" />
            </>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
            {car.vin && <Detail label="VIN" value={car.vin} mono />}
            {car.engine && <Detail label="Engine" value={car.engine} />}
            {car.fuel && <Detail label="Fuel" value={car.fuel} />}
            {car.colour && <Detail label="Colour" value={car.colour} />}
            {car.mileage_km != null && <Detail label={workshop ? 'Mileage bought' : 'Mileage (entered)'} value={`${formatInteger(car.mileage_km)} km`} />}
            {car.sale_mileage_km != null && <Detail label="Mileage sold" value={`${formatInteger(car.sale_mileage_km)} km`} />}
            {workshop && <Detail label="Bought on" value={formatDate(car.purchase_date)} />}
            {car.sale_date && <Detail label={status === 'scrapped' ? 'Scrapped on' : 'Sold on'} value={formatDate(car.sale_date)} />}
          </dl>
          {car.seller && <ContactLine label="Bought from" name={car.seller.name} phone={car.seller.phone} />}
          {car.buyer && <ContactLine label={status === 'scrapped' ? 'Scrapyard' : 'Sold to'} name={car.buyer.name} phone={car.buyer.phone} />}
          {car.notes && <p className="whitespace-pre-wrap">{car.notes}</p>}
          <AddedBy by={car.created_by} at={car.created_at} />
        </CardContent>
      </Card>

      <ManualRow car={car} to={`/cars/${car.id}/manual`} />
      <PhotoSection entityType="car" entityId={car.id} albums />
      <AttachmentStrip entityType="car" entityId={car.id} kind="receipt" title="Papers & receipts" allowPdf />
      {car.owner_kind !== 'member' && <KeysCard target={{ carId: car.id }} subject={car.ref} />}
      {workshop && <WebsiteCard target={{ carId: car.id }} forSale={status === 'listed' ? car.asking_price_cents : undefined} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Rows and small pieces
// ---------------------------------------------------------------------------
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

function MoneyRow({ row, payer, service, onOpen }: { row: CarMoneyRow; payer: string; service?: CarService; onOpen?: () => void }) {
  const title =
    row.category === 'car_purchase'
      ? 'Purchase'
      : row.category === 'car_part'
        ? (row.description ?? 'Part')
        : [row.expense_category?.name, row.description].filter(Boolean).join(': ');
  const Icon = row.category === 'car_purchase' ? Banknote : row.category === 'car_part' ? Wrench : Receipt;
  const meta = [formatDate(row.occurred_on), `paid by ${payer}`, row.category !== 'car_purchase' && row.counterparty, service && `in ${serviceTitle(service)}`]
    .filter(Boolean)
    .join(' · ');
  const content: ReactNode = (
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

function StockRow({ row, service, onReturn }: { row: CarStockRow; service?: CarService; onReturn?: () => void }) {
  const qty = toMilli(row.qty_delta);
  const isReturn = row.type === 'return';
  const unitName = row.item?.unit?.name ?? '';
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {isReturn ? <Undo2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" /> : <Package className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <Link to={`/inventory/${row.item_id}`} className="truncate font-medium underline-offset-2 hover:underline">
            {row.item?.name ?? 'Item'}
          </Link>
          <span className={cn('font-semibold tabular-nums', isReturn && 'text-success')}>{formatMoney(-row.value_delta_cents, { sign: isReturn })}</span>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {formatDate(row.occurred_on)} · {isReturn ? 'returned' : 'from stock'} {formatQuantity(Math.abs(qty), unitName)}
          {row.item?.part_number && ` · ${row.item.part_number}`}
          {service && ` · in ${serviceTitle(service)}`}
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
