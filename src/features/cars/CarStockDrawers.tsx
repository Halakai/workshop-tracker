import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChevronLeft, Loader2, Search } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { SuffixInput } from '@/components/SuffixInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { formatMoney } from '@/domain/money';
import { formatQuantity, milliToInput, parseQuantity, toMilli } from '@/domain/quantity';
import { buildReturnFromCar, buildUseOnCar, issueDelta, onCar, returnDelta, type StockLevel } from '@/domain/stock';
import { todayIso } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { stockOf, unitOf, useItems, usePostMovement, type Item } from '@/features/inventory/api';
import type { Car, CarStockRow } from './api';

/** "Use from stock" on the car page: pick an item, enter how much. */
export function UseOnCarDrawer({ car, open, onOpenChange }: { car: Car; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [item, setItem] = useState<Item | null>(null);
  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setItem(null);
  };
  return (
    <FormDrawer open={open} onOpenChange={close} title={item ? `${item.name} → ${car.ref}` : `Parts from stock → ${car.ref}`}>
      {open && (item ? <UseOnCarForm car={car} item={item} onBack={() => setItem(null)} onDone={() => close(false)} /> : <ItemPicker onPick={setItem} />)}
    </FormDrawer>
  );
}

export function ItemPicker({ onPick }: { onPick: (item: Item) => void }) {
  const items = useItems();
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (items.data ?? [])
      .filter((i) => !i.archived_at && toMilli(i.qty_on_hand) > 0)
      .filter((i) => {
        const hay = [i.name, i.part_number, i.brand?.name, i.manufacturer_ref].filter(Boolean).join(' ').toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 30);
  }, [items.data, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" autoFocus placeholder="Search stock" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
      </div>
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
        {matches.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => onPick(i)} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{i.name}</span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {i.part_number}
                  {i.brand && ` · ${i.brand.name}`}
                </span>
              </span>
              <span className="text-sm font-semibold tabular-nums">{formatQuantity(toMilli(i.qty_on_hand), unitOf(i).name)}</span>
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Nothing in stock matches.</li>}
      </ul>
    </div>
  );
}

function UseOnCarForm({ car, item, onBack, onDone }: { car: Car; item: Item; onBack: () => void; onDone: () => void }) {
  const unit = unitOf(item);
  const stock = stockOf(item);
  const post = usePostMovement();
  const [qtyText, setQtyText] = useState(unit.wholeOnly ? '1' : '');
  const [error, setError] = useState<string | null>(null);
  const qty = parseQuantity(qtyText, { wholeOnly: unit.wholeOnly });
  const cost = qty !== null && qty <= stock.qty ? -issueDelta(stock, qty).value : null;

  const submit = async () => {
    if (qty === null) return setError(unit.wholeOnly ? 'Whole numbers, more than 0' : 'Enter how much');
    if (qty > stock.qty) return setError(`Only ${formatQuantity(stock.qty, unit.name)} in stock`);
    try {
      await post.mutateAsync({
        itemId: item.id,
        build: (fresh) => buildUseOnCar({ stock: stockOf(fresh), qty, carId: car.id, occurredOn: todayIso() }),
      });
      toast.success(`${formatQuantity(qty, unit.name)} ${item.name} used on ${car.ref}`);
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  return (
    <FieldGroup>
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="car-use-qty">How much?</FieldLabel>
        <SuffixInput
          id="car-use-qty"
          suffix={unit.name}
          autoFocus
          value={qtyText}
          onChange={(e) => {
            setQtyText(e.target.value);
            setError(null);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setQtyText(milliToInput(stock.qty))}>
            All ({formatQuantity(stock.qty, unit.name)})
          </Button>
        </div>
        <FieldError>{error}</FieldError>
        {cost !== null && <FieldDescription>Adds {formatMoney(cost)} to the car (average price).</FieldDescription>}
      </Field>
      <Button size="lg" disabled={post.isPending} onClick={submit}>
        {post.isPending && <Loader2 className="animate-spin" />}
        Use on {car.ref}
      </Button>
      <Button variant="ghost" onClick={onBack}>
        <ChevronLeft /> Other item
      </Button>
    </FieldGroup>
  );
}

/** "Return to stock": parts taken off the car unused go back at what the car was charged. */
export function ReturnToStockDrawer({
  car,
  itemId,
  rows,
  onClose,
}: {
  car: Car;
  itemId: string | null;
  rows: CarStockRow[];
  onClose: () => void;
}) {
  const itemRows = rows.filter((r) => r.item_id === itemId);
  const first = itemRows[0];
  return (
    <FormDrawer open={itemId !== null} onOpenChange={(o) => !o && onClose()} title={first?.item ? `Return ${first.item.name}` : 'Return to stock'}>
      {itemId && first?.item && (
        <ReturnForm
          car={car}
          itemId={itemId}
          itemName={first.item.name}
          unitName={first.item.unit?.name ?? ''}
          wholeOnly={first.item.unit?.whole_only ?? false}
          fromCar={onCar(itemRows.map((r) => ({ qty: toMilli(r.qty_delta), value: r.value_delta_cents })))}
          onDone={onClose}
        />
      )}
    </FormDrawer>
  );
}

function ReturnForm({
  car,
  itemId,
  itemName,
  unitName,
  wholeOnly,
  fromCar,
  onDone,
}: {
  car: Car;
  itemId: string;
  itemName: string;
  unitName: string;
  wholeOnly: boolean;
  fromCar: StockLevel;
  onDone: () => void;
}) {
  const post = usePostMovement();
  const [qtyText, setQtyText] = useState(milliToInput(fromCar.qty));
  const [error, setError] = useState<string | null>(null);
  const qty = parseQuantity(qtyText, { wholeOnly });
  const credit = qty !== null && qty <= fromCar.qty ? returnDelta(fromCar, qty).value : null;

  if (fromCar.qty <= 0) {
    return <p className="pb-4 text-muted-foreground">Everything of this item has already gone back to stock.</p>;
  }

  const submit = async () => {
    if (qty === null) return setError(wholeOnly ? 'Whole numbers, more than 0' : 'Enter how much');
    if (qty > fromCar.qty) return setError(`Only ${formatQuantity(fromCar.qty, unitName)} is on this car`);
    try {
      await post.mutateAsync({
        itemId,
        build: () => buildReturnFromCar({ fromCar, qty, carId: car.id, occurredOn: todayIso() }),
      });
      toast.success(`${formatQuantity(qty, unitName)} ${itemName} back in stock`);
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  return (
    <FieldGroup>
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="return-qty">How much goes back?</FieldLabel>
        <SuffixInput
          id="return-qty"
          suffix={unitName}
          autoFocus
          value={qtyText}
          onChange={(e) => {
            setQtyText(e.target.value);
            setError(null);
          }}
        />
        <FieldDescription>
          {formatQuantity(fromCar.qty, unitName)} is on {car.ref}.
          {credit !== null && ` The car’s cost goes down by ${formatMoney(credit)}.`}
        </FieldDescription>
        <FieldError>{error}</FieldError>
      </Field>
      <Button size="lg" disabled={post.isPending} onClick={submit}>
        {post.isPending && <Loader2 className="animate-spin" />}
        Return to stock
      </Button>
    </FieldGroup>
  );
}
