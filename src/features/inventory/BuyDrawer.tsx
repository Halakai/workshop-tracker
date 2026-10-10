import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { SuffixInput } from '@/components/SuffixInput';
import { PayerPicker } from '@/components/PayerPicker';
import { DateField } from '@/components/DateField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SuggestionInput } from '@/components/SuggestionInput';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { formatMoney, mulDivRound, parseMoney } from '@/domain/money';
import { MILLI_PER_UNIT, formatQuantity, parseQuantity } from '@/domain/quantity';
import { applyDelta, averageUnitCost, buildPurchase } from '@/domain/stock';
import { todayIso } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { getLastPayer, setLastPayer, usePayerOptions } from '@/features/money/accounts';
import { stockOf, unitOf, useLastPurchases, usePostMovement, useSuppliers, type Item } from './api';

export function BuyDrawer({ item, open, onOpenChange }: { item: Item; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={`Buy ${item.name}`}>
      {open && <BuyForm item={item} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function BuyForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const unit = unitOf(item);
  const payers = usePayerOptions();
  const suppliers = useSuppliers();
  const lastPurchase = useLastPurchases().data?.get(item.id);
  const post = usePostMovement();

  const schema = useMemo(
    () =>
      z
        .object({
          qty: z.string().refine((v) => parseQuantity(v, { wholeOnly: unit.wholeOnly }) !== null, unit.wholeOnly ? 'Whole numbers, more than 0' : 'Enter how much'),
          total: z.string().refine((v) => parseMoney(v) !== null, 'Enter the total price (0 if it was free)'),
          paidBy: z.string().nullable(),
          supplier: z.string().max(120),
          date: z.string(),
          note: z.string().max(500),
        })
        .refine((v) => parseMoney(v.total) === 0 || Boolean(v.paidBy), { path: ['paidBy'], message: 'Who paid?' }),
    [unit.wholeOnly],
  );
  type Values = z.infer<typeof schema>;

  const lastPayer = getLastPayer();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      qty: '',
      total: '',
      paidBy: payers.some((p) => p.accountId === lastPayer) ? lastPayer : null,
      supplier: lastPurchase?.supplier ?? '',
      date: todayIso(),
      note: '',
    },
  });

  // the partner list may load after the drawer opened: preselect whoever paid last time
  useEffect(() => {
    if (!form.getValues('paidBy') && lastPayer && payers.some((p) => p.accountId === lastPayer)) {
      form.setValue('paidBy', lastPayer);
    }
  }, [payers, lastPayer, form]);

  const qty = parseQuantity(form.watch('qty'), { wholeOnly: unit.wholeOnly });
  const total = parseMoney(form.watch('total'));
  const preview =
    qty !== null && total !== null
      ? {
          unitPrice: mulDivRound(total, MILLI_PER_UNIT, qty),
          newAverage: averageUnitCost(applyDelta(stockOf(item), { qty, value: total })),
        }
      : null;

  const onSubmit = form.handleSubmit(async (v) => {
    const qtyMilli = parseQuantity(v.qty, { wholeOnly: unit.wholeOnly })!;
    const totalCents = parseMoney(v.total)!;
    try {
      await post.mutateAsync({
        itemId: item.id,
        build: () =>
          buildPurchase({
            qty: qtyMilli,
            totalCost: totalCents,
            paidBy: v.paidBy,
            occurredOn: v.date,
            supplier: v.supplier,
            note: v.note,
          }),
      });
      if (v.paidBy) setLastPayer(v.paidBy);
      toast.success(`Added ${formatQuantity(qtyMilli, unit.name)} ${item.name}`);
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={!!form.formState.errors.qty}>
            <FieldLabel htmlFor="buy-qty">Quantity</FieldLabel>
            <SuffixInput id="buy-qty" suffix={unit.name} autoFocus {...form.register('qty')} />
            <FieldError errors={[form.formState.errors.qty]} />
          </Field>
          <Field data-invalid={!!form.formState.errors.total}>
            <FieldLabel htmlFor="buy-total">Total paid</FieldLabel>
            <SuffixInput id="buy-total" suffix="€" {...form.register('total')} />
            <FieldError errors={[form.formState.errors.total]} />
          </Field>
        </div>
        {preview && (
          <p className="-mt-3 text-sm text-muted-foreground">
            {formatMoney(preview.unitPrice)} per {unit.name}
            {preview.newAverage !== null && <> · new average {formatMoney(preview.newAverage)}</>}
          </p>
        )}
        <Field data-invalid={!!form.formState.errors.paidBy}>
          <FieldLabel>Who paid?</FieldLabel>
          <Controller
            control={form.control}
            name="paidBy"
            render={({ field }) => <PayerPicker options={payers} value={field.value} onChange={field.onChange} />}
          />
          <FieldError errors={[form.formState.errors.paidBy]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="buy-supplier">Supplier</FieldLabel>
          <Controller
            control={form.control}
            name="supplier"
            render={({ field }) => (
              <SuggestionInput id="buy-supplier" value={field.value} onChange={field.onChange} options={suppliers.data ?? []} />
            )}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="buy-date">Date</FieldLabel>
          <Controller
            control={form.control}
            name="date"
            render={({ field }) => <DateField id="buy-date" value={field.value} onChange={field.onChange} />}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="buy-note">Note</FieldLabel>
          <Input id="buy-note" {...form.register('note')} />
        </Field>
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Add to stock
        </Button>
      </FieldGroup>
    </form>
  );
}
