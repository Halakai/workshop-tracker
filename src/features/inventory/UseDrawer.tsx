import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Wrench } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { SuffixInput } from '@/components/SuffixInput';
import { DateField } from '@/components/DateField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { formatMoney } from '@/domain/money';
import { MILLI_PER_UNIT, formatQuantity, milliToInput, parseQuantity, type Unit } from '@/domain/quantity';
import { buildOverheadUse, issueDelta } from '@/domain/stock';
import { sharesAreComplete } from '@/domain/shares';
import { todayIso } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { useDefaultShares } from '@/features/money/accounts';
import { stockOf, usePostMovement, type Item } from './api';

export function UseDrawer({ item, open, onOpenChange }: { item: Item; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={`Use ${item.name}`}>
      {open && <UseForm item={item} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function UseForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const unit = item.unit as Unit;
  const stock = stockOf(item);
  const shares = useDefaultShares();
  const post = usePostMovement();

  const schema = useMemo(
    () =>
      z.object({
        qty: z
          .string()
          .refine((v) => parseQuantity(v, { unit }) !== null, unit === 'pcs' ? 'Whole pieces, more than 0' : 'Enter how much')
          .refine((v) => (parseQuantity(v, { unit }) ?? 0) <= stock.qty, `Only ${formatQuantity(stock.qty, unit)} in stock`),
        date: z.string(),
        note: z.string().max(500),
      }),
    [unit, stock.qty],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { qty: unit === 'pcs' && stock.qty >= MILLI_PER_UNIT ? '1' : '', date: todayIso(), note: '' },
  });

  const qty = parseQuantity(form.watch('qty'), { unit });
  const cost = qty !== null && qty <= stock.qty ? -issueDelta(stock, qty).value : null;

  const onSubmit = form.handleSubmit(async (v) => {
    const qtyMilli = parseQuantity(v.qty, { unit })!;
    if (!sharesAreComplete(shares)) {
      toast.error('Default profit shares don’t add up to 100 %. An admin can fix this under More → Users & partners.');
      return;
    }
    try {
      await post.mutateAsync({
        itemId: item.id,
        build: (fresh) => buildOverheadUse({ stock: stockOf(fresh), qty: qtyMilli, shares, occurredOn: v.date, note: v.note }),
      });
      toast.success(`Used ${formatQuantity(qtyMilli, unit)} ${item.name}`);
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  if (stock.qty === 0) {
    return <p className="pb-4 text-muted-foreground">Nothing in stock. Record a purchase or a stock count first.</p>;
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.qty}>
          <FieldLabel htmlFor="use-qty">How much?</FieldLabel>
          <SuffixInput id="use-qty" suffix={unit} autoFocus {...form.register('qty')} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => form.setValue('qty', milliToInput(stock.qty), { shouldValidate: true })}>
              All ({formatQuantity(stock.qty, unit)})
            </Button>
          </div>
          <FieldError errors={[form.formState.errors.qty]} />
          {cost !== null && <FieldDescription>Cost: {formatMoney(cost)} at the average price</FieldDescription>}
        </Field>
        <Field>
          <FieldLabel>Used for</FieldLabel>
          <div className="flex h-11 items-center gap-2 rounded-lg border bg-muted/50 px-3">
            <Wrench className="size-5 text-muted-foreground" />
            Workshop (general use)
          </div>
          <FieldDescription>
            Overhead: the cost is shared between partners by their profit shares. Using parts on a car or job arrives
            with cars (M3) and jobs (M5).
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
