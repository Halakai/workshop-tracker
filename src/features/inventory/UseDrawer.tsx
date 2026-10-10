import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Car, Loader2, Wrench } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { SuffixInput } from '@/components/SuffixInput';
import { DateField } from '@/components/DateField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { formatMoney } from '@/domain/money';
import { MILLI_PER_UNIT, formatQuantity, milliToInput, parseQuantity } from '@/domain/quantity';
import { buildOverheadUse, buildUseOnCar, issueDelta } from '@/domain/stock';
import { sharesAreComplete } from '@/domain/shares';
import { todayIso } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { useDefaultShares } from '@/features/money/accounts';
import { useActiveCars } from '@/features/cars/api';
import { carTitle } from '@/domain/cars';
import { cn } from '@/lib/utils';
import { stockOf, unitOf, usePostMovement, type Item } from './api';

export function UseDrawer({ item, open, onOpenChange }: { item: Item; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={`Use ${item.name}`}>
      {open && <UseForm item={item} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function UseForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const unit = unitOf(item);
  const stock = stockOf(item);
  const shares = useDefaultShares();
  const post = usePostMovement();
  const cars = useActiveCars();
  /** 'workshop' or a car id */
  const [target, setTarget] = useState<string>('workshop');
  const targetCar = cars.find((c) => c.id === target);

  const schema = useMemo(
    () =>
      z.object({
        qty: z
          .string()
          .refine((v) => parseQuantity(v, { wholeOnly: unit.wholeOnly }) !== null, unit.wholeOnly ? 'Whole numbers, more than 0' : 'Enter how much')
          .refine((v) => (parseQuantity(v, { wholeOnly: unit.wholeOnly }) ?? 0) <= stock.qty, `Only ${formatQuantity(stock.qty, unit.name)} in stock`),
        date: z.string(),
        note: z.string().max(500),
      }),
    [unit.wholeOnly, unit.name, stock.qty],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { qty: unit.wholeOnly && stock.qty >= MILLI_PER_UNIT ? '1' : '', date: todayIso(), note: '' },
  });

  const qty = parseQuantity(form.watch('qty'), { wholeOnly: unit.wholeOnly });
  const cost = qty !== null && qty <= stock.qty ? -issueDelta(stock, qty).value : null;

  const onSubmit = form.handleSubmit(async (v) => {
    const qtyMilli = parseQuantity(v.qty, { wholeOnly: unit.wholeOnly })!;
    if (targetCar) {
      try {
        await post.mutateAsync({
          itemId: item.id,
          build: (fresh) => buildUseOnCar({ stock: stockOf(fresh), qty: qtyMilli, carId: targetCar.id, occurredOn: v.date, note: v.note }),
        });
        toast.success(`${formatQuantity(qtyMilli, unit.name)} ${item.name} used on ${targetCar.ref}`);
        onDone();
      } catch (e) {
        toast.error(syncErrorMessage(e));
      }
      return;
    }
    if (!sharesAreComplete(shares)) {
      toast.error('Default profit shares don’t add up to 100 %. An admin can fix this under More → Users & partners.');
      return;
    }
    try {
      await post.mutateAsync({
        itemId: item.id,
        build: (fresh) => buildOverheadUse({ stock: stockOf(fresh), qty: qtyMilli, shares, occurredOn: v.date, note: v.note }),
      });
      toast.success(`Used ${formatQuantity(qtyMilli, unit.name)} ${item.name}`);
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  if (stock.qty === 0) {
    return <p className="pb-4 text-muted-foreground">Nothing in stock. Record a purchase or adjust the stock first.</p>;
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.qty}>
          <FieldLabel htmlFor="use-qty">How much?</FieldLabel>
          <SuffixInput id="use-qty" suffix={unit.name} autoFocus {...form.register('qty')} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => form.setValue('qty', milliToInput(stock.qty), { shouldValidate: true })}>
              All ({formatQuantity(stock.qty, unit.name)})
            </Button>
          </div>
          <FieldError errors={[form.formState.errors.qty]} />
          {cost !== null && <FieldDescription>Cost: {formatMoney(cost)} at the average price</FieldDescription>}
        </Field>
        <Field>
          <FieldLabel>Used for</FieldLabel>
          <div className="flex flex-col gap-2">
            <TargetButton active={target === 'workshop'} onClick={() => setTarget('workshop')}>
              <Wrench className="size-5" /> Workshop (general use)
            </TargetButton>
            {cars.map((c) => (
              <TargetButton key={c.id} active={target === c.id} onClick={() => setTarget(c.id)}>
                <Car className="size-5" />
                <span className="min-w-0 flex-1 truncate text-left">{carTitle(c)}</span>
                <span className="font-mono text-xs opacity-70">{c.plate ?? c.ref}</span>
              </TargetButton>
            ))}
          </div>
          <FieldDescription>
            {targetCar
              ? `The cost is added to ${targetCar.ref}.`
              : 'Overhead: the cost is shared between partners by their profit shares.'}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="use-date">Date</FieldLabel>
          <Controller
            control={form.control}
            name="date"
            render={({ field }) => <DateField id="use-date" value={field.value} onChange={field.onChange} />}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="use-note">Note</FieldLabel>
          <Input id="use-note" {...form.register('note')} />
        </Field>
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Take from stock
        </Button>
      </FieldGroup>
    </form>
  );
}

function TargetButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-12 items-center gap-2 rounded-lg border px-3 text-left',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background active:bg-muted',
      )}
    >
      {children}
    </button>
  );
}
