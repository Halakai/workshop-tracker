import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Disc3, FolderInput, Hammer, Package, Pencil, Plus, Receipt, Trash2, Wrench, X } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { ConfirmButton } from '@/components/ConfirmButton';
import { FormDrawer } from '@/components/FormDrawer';
import { AddedBy } from '@/components/AddedBy';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { carTitle, hasWorkshopMoney } from '@/domain/cars';
import { partSummary } from '@/domain/carParts';
import { formatMoney } from '@/domain/money';
import { formatDate } from '@/domain/dates';
import { formatInteger, formatQuantity, toMilli } from '@/domain/quantity';
import { syncErrorMessage } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { AttachmentStrip } from '@/features/files/AttachmentStrip';
import { useCar, type Car, type CarMoneyRow, type CarStockRow } from './api';
import { CarMoneyDrawer, type CarMoneyKind } from './CarMoneyDrawer';
import { UseOnCarDrawer } from './CarStockDrawers';
import { ServiceDrawer } from './ServiceDrawer';
import { serviceTitle, useCarServices, useDeleteService, useFileCost, useServiceMoney, type CarService } from './services';
import { useOwnerPeople } from './owners';

/** One service: what was done, everything filed under it and what it all cost. */
export function ServicePage() {
  const { id, serviceId } = useParams();
  const car = useCar(id);
  const services = useCarServices(id);
  const service = services.data?.find((s) => s.id === serviceId);
  if (car.isPending || services.isPending) {
    return (
      <>
        <PageHeader title="Service" back={`/cars/${id}`} />
        <PageBody>
          <Skeleton className="h-48 rounded-xl" />
        </PageBody>
      </>
    );
  }
  if (!car.data || !service) {
    return (
      <>
        <PageHeader title="Service" back={`/cars/${id}`} />
        <PageBody>
          <p className="text-muted-foreground">This service doesn’t exist (anymore).</p>
        </PageBody>
      </>
    );
  }
  return <ServiceView car={car.data} service={service} />;
}

function ServiceView({ car, service }: { car: Car; service: CarService }) {
  const goBack = useGoBack();
  const money = useServiceMoney(car);
  const people = useOwnerPeople();
  const remove = useDeleteService();
  const file = useFileCost();
  const [editing, setEditing] = useState(false);
  const [moneyDrawer, setMoneyDrawer] = useState<{ kind: CarMoneyKind; row?: CarMoneyRow } | null>(null);
  const [usingStock, setUsingStock] = useState(false);
  const [filing, setFiling] = useState(false);
  const workshop = hasWorkshopMoney(car);
  const member = car.owner_kind === 'member';
  const filed = money.of(service.id);
  const total = money.total(service);
  const locked = Boolean(car.settled_at);
  const ownerName = people.members.find((m) => m.id === car.owner_member_id)?.display_name;

  const unfiledCosts = money.money.filter((r) => !r.service_id && (r.category === 'car_part' || r.category === 'car_cost'));
  const unfiledStock = money.stock.filter((r) => !r.service_id);

  const takeOut = async (arg: { transactionId: string } | { movementId: string }) => {
    try {
      await file.mutateAsync({ carId: car.id, serviceId: null, ...arg });
      toast.success('Taken out of the service');
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title={serviceTitle(service)}
        back={`/cars/${car.id}`}
        actions={
          <Button variant="ghost" size="icon" aria-label="Edit service" onClick={() => setEditing(true)}>
            <Pencil className="size-5" />
          </Button>
        }
      />
      <PageBody>
        <Card>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Link to={`/cars/${car.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
              {carTitle(car)} · {car.ref}
            </Link>
            <p className="text-muted-foreground">
              {[formatDate(service.performed_on), service.mileage_km != null && `${formatInteger(service.mileage_km)} km`, service.garage ?? 'done by us'].filter(Boolean).join(' · ')}
            </p>
            {service.description && <p className="whitespace-pre-wrap">{service.description}</p>}
            {service.notes && <p className="whitespace-pre-wrap text-muted-foreground">{service.notes}</p>}
            <div className="mt-1 flex items-baseline justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{money.ready ? formatMoney(total) : '…'}</span>
            </div>
            {member && <p className="text-xs text-muted-foreground">Paid by {ownerName ?? 'the owner'}, not the workshop.</p>}
            <AddedBy by={service.created_by} at={service.created_at} />
          </CardContent>
        </Card>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">{workshop ? 'Costs in this service' : 'What it cost'}</h2>
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border empty:hidden">
            {filed.parts.map((p) => (
              <li key={p.id}>
                <Link to={`/cars/${car.id}/parts/${p.id}`} className="flex items-start gap-3 px-4 py-3 active:bg-muted">
                  <Disc3 className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <Item title={p.name} meta={[partSummary(p.kind, p.details), p.brand?.name].filter((x) => x && x !== p.name).join(' · ')} amount={p.price_cents} />
                </Link>
              </li>
            ))}
            {filed.costs.map((r) => (
              <li key={r.id} className="flex items-start">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => setMoneyDrawer({ kind: r.category === 'car_part' ? 'part' : 'cost', row: r })}
                  className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left active:bg-muted"
                >
                  {r.category === 'car_part' ? <Wrench className="mt-0.5 size-5 shrink-0 text-muted-foreground" /> : <Receipt className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
                  <Item
                    title={r.category === 'car_part' ? (r.description ?? 'Part') : [r.expense_category?.name, r.description].filter(Boolean).join(': ')}
                    meta={[formatDate(r.occurred_on), r.counterparty].filter(Boolean).join(' · ')}
                    amount={r.amount_cents}
                  />
                </button>
                {!locked && <TakeOut onClick={() => takeOut({ transactionId: r.id })} />}
              </li>
            ))}
            {filed.stock.map((m) => (
              <li key={m.id} className="flex items-start">
                <div className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3">
                  <Package className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <StockItem row={m} />
                </div>
                {!locked && <TakeOut onClick={() => takeOut({ movementId: m.id })} />}
              </li>
            ))}
            {service.labor_cents != null && (
              <li>
                <button type="button" onClick={() => setEditing(true)} className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-muted">
                  <Hammer className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  <Item title={car.owner_kind === 'customer' ? 'Price' : 'Work'} meta={service.garage ?? ''} amount={service.labor_cents} />
                </button>
              </li>
            )}
          </ul>
          {filed.parts.length + filed.costs.length + filed.stock.length === 0 && service.labor_cents == null && (
            <p className="text-sm text-muted-foreground">
              {workshop ? 'Nothing filed here yet: add what this service cost.' : member ? 'Add the parts bought for it and the work.' : 'Add its price if you know it.'}
            </p>
          )}
        </section>

        {!locked && (
          <div className="grid grid-cols-2 gap-2">
            {workshop && (
              <>
                <Quick icon={Wrench} label="Part bought" onClick={() => setMoneyDrawer({ kind: 'part' })} />
                <Quick icon={Receipt} label="Other cost" onClick={() => setMoneyDrawer({ kind: 'cost' })} />
              </>
            )}
            {member && (
              <Button variant="outline" className="h-16 flex-col gap-1" asChild>
                <Link to={`/cars/${car.id}/parts/new?service=${service.id}`}>
                  <Disc3 className="size-5 text-primary" />
                  Part bought
                </Link>
              </Button>
            )}
            {car.owner_kind !== 'customer' && <Quick icon={Package} label="From stock" onClick={() => setUsingStock(true)} />}
            {!workshop && <Quick icon={Hammer} label={service.labor_cents != null ? 'Change price' : car.owner_kind === 'customer' ? 'Price' : 'Work price'} onClick={() => setEditing(true)} />}
            {car.owner_kind !== 'customer' && unfiledCosts.length + unfiledStock.length > 0 && (
              <Quick icon={FolderInput} label="An earlier cost" onClick={() => setFiling(true)} />
            )}
          </div>
        )}

        <AttachmentStrip entityType="car_service" entityId={service.id} kind="receipt" title="Receipts & papers" allowPdf label={serviceTitle(service)} />
        <AttachmentStrip entityType="car_service" entityId={service.id} kind="photo" title="Photos" label={serviceTitle(service)} />

        <ConfirmButton
          variant="ghost"
          className="self-start text-destructive"
          title="Delete this service?"
          description={
            workshop
              ? 'Its costs stay on the car, outside a service.'
              : member
                ? 'Its parts stay on the car, outside a service.'
                : 'It is removed from the car’s history.'
          }
          confirmLabel="Delete"
          onConfirm={async () => {
            try {
              await remove.mutateAsync(service);
              toast.success('Service deleted');
              goBack(`/cars/${car.id}`);
            } catch (e) {
              toast.error(syncErrorMessage(e));
            }
          }}
        >
          <Trash2 /> Delete service
        </ConfirmButton>
      </PageBody>

      <ServiceDrawer car={car} service={service} open={editing} onOpenChange={setEditing} />
      <CarMoneyDrawer car={car} kind={moneyDrawer?.kind ?? null} row={moneyDrawer?.row} serviceId={service.id} onClose={() => setMoneyDrawer(null)} />
      <UseOnCarDrawer car={car} serviceId={service.id} open={usingStock} onOpenChange={setUsingStock} />
      <FileEarlierDrawer
        open={filing}
        onOpenChange={setFiling}
        costs={unfiledCosts}
        stock={unfiledStock}
        onPick={async (arg) => {
          try {
            await file.mutateAsync({ carId: car.id, serviceId: service.id, ...arg });
            toast.success('Added to the service');
          } catch (e) {
            toast.error(syncErrorMessage(e));
          }
        }}
      />
    </>
  );
}

function Item({ title, meta, amount }: { title: string; meta: string; amount: number | null }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium">{title}</span>
        <span className="font-semibold tabular-nums">{amount != null ? formatMoney(amount) : '—'}</span>
      </div>
      {meta && <p className="truncate text-sm text-muted-foreground">{meta}</p>}
    </div>
  );
}

function StockItem({ row }: { row: CarStockRow }) {
  const qty = Math.abs(toMilli(row.qty_delta));
  return (
    <Item
      title={`${row.type === 'return' ? 'Back to stock' : 'From stock'}: ${row.item?.name ?? 'part'}`}
      meta={[formatDate(row.occurred_on), formatQuantity(qty, row.item?.unit?.name ?? '')].join(' · ')}
      amount={-row.value_delta_cents}
    />
  );
}

function TakeOut({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" className="m-1 shrink-0" aria-label="Take out of the service" onClick={onClick}>
      <X />
    </Button>
  );
}

function Quick({ icon: Icon, label, onClick }: { icon: typeof Plus; label: string; onClick: () => void }) {
  return (
    <Button variant="outline" className="h-16 flex-col gap-1" onClick={onClick}>
      <Icon className="size-5 text-primary" />
      {label}
    </Button>
  );
}

/** Costs entered before the service was: tap one to file it here. */
function FileEarlierDrawer({
  open,
  onOpenChange,
  costs,
  stock,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  costs: CarMoneyRow[];
  stock: CarStockRow[];
  onPick: (arg: { transactionId: string } | { movementId: string }) => Promise<void>;
}) {
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Add an earlier cost">
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
        {costs.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => void onPick({ transactionId: r.id })} className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-muted">
              <Receipt className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <Item
                title={r.category === 'car_part' ? (r.description ?? 'Part') : [r.expense_category?.name, r.description].filter(Boolean).join(': ')}
                meta={formatDate(r.occurred_on)}
                amount={r.amount_cents}
              />
            </button>
          </li>
        ))}
        {stock.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => void onPick({ movementId: m.id })} className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-muted">
              <Package className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <StockItem row={m} />
            </button>
          </li>
        ))}
        {costs.length + stock.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Every cost of this car is in a service.</li>}
      </ul>
    </FormDrawer>
  );
}
