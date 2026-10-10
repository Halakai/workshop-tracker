import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { SuffixInput } from '@/components/SuffixInput';
import { DateField } from '@/components/DateField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { formatMoney, parseMoney } from '@/domain/money';
import { formatQuantity, milliToInput, parseQuantity, type Unit } from '@/domain/quantity';
import { buildCount, countDelta, StockError, type StockDelta } from '@/domain/stock';
import { sharesAreComplete } from '@/domain/shares';
import { todayIso } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { useDefaultShares } from '@/features/money/accounts';
import { COUNT_REASONS } from './labels';
import { stockOf, usePostMovement, type Item } from './api';

export function CountDrawer({ item, open, onOpenChange }: { item: Item; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Count ${item.name}`}
      description="Enter what is really on the shelf. The difference is booked as a correction."
    >
      {open && <CountForm item={item} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function CountForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const unit = item.unit as Unit;
  const stock = stockOf(item);
  const shares = useDefaultShares();
  const post = usePostMovement();
  const emptyNow = stock.qty === 0;

  const schema = useMemo(
    () =>
      z
        .object({
          counted: z.string().refine((v) => parseQuantity(v, { unit, allowZero: true }) !== null, 'Enter the counted quantity'),
          unitCost: z.string(),
          reason: z.string().trim().min(1, 'Why does the count differ?').max(200),
          date: z.string(),
          note: z.string().max(500),
        })
        .refine((v) => parseQuantity(v.counted, { unit, allowZero: true }) !== stock.qty, {
          path: ['counted'],
          message: 'That’s what the app already has',
        })
        .refine((v) => !emptyNow || parseMoney(v.unitCost) !== null, {
          path: ['unitCost'],
          message: 'What is one unit worth? (0 if nothing)',
        }),
    [unit, stock.qty, emptyNow],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      counted: milliToInput(stock.qty),
      unitCost: '',
      reason: emptyNow ? 'Opening stock' : 'Stock count',
      date: todayIso(),
      note: '',
    },
  });

  const counted = parseQuantity(form.watch('counted'), { unit, allowZero: true });
  const unitCost = parseMoney(form.watch('unitCost')) ?? undefined;
  let preview: StockDelta | null = null;
  try {
    if (counted !== null && counted !== stock.qty) preview = countDelta(stock, counted, unitCost);
  } catch (e) {
    if (!(e instanceof StockError)) throw e;
  }

  const onSubmit = form.handleSubmit(async (v) => {
    if (!sharesAreComplete(shares)) {
      toast.error('Default profit shares don’t add up to 100 %. An admin can fix this under More → Users & partners.');
      return;
    }
    const countedMilli = parseQuantity(v.counted, { unit, allowZero: true })!;
    try {
      await post.mutateAsync({
        itemId: item.id,
        build: (fresh) =>
          buildCount({
            stock: stockOf(fresh),
            counted: countedMilli,
            unitCostIfEmpty: parseMoney(v.unitCost) ?? undefined,
            reason: v.reason,
            shares,
            occurredOn: v.date,
            note: v.note,
          }),
      });
      toast.success(`${item.name}: stock set to ${formatQuantity(countedMilli, unit)}`);
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.counted}>
          <FieldLabel htmlFor="count-qty">Counted</FieldLabel>
          <SuffixInput id="count-qty" suffix={unit} autoFocus {...form.register('counted')} />
          <FieldDescription>The app has {formatQuantity(stock.qty, unit)}.</FieldDescription>
          <FieldError errors={[form.formState.errors.counted]} />
        </Field>
        {emptyNow && (
          <Field data-invalid={!!form.formState.errors.unitCost}>
            <FieldLabel htmlFor="count-cost">Value of one {unit}</FieldLabel>
            <SuffixInput id="count-cost" suffix="€" {...form.register('unitCost')} />
            <FieldDescription>What you paid for it (roughly). Used as the average cost from now on.</FieldDescription>
            <FieldError errors={[form.formState.errors.unitCost]} />
          </Field>
        )}
        {preview && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            {preview.qty > 0 ? '+' : ''}
            {formatQuantity(preview.qty, unit)} · {formatMoney(preview.value, { sign: true })} stock value, shared between
            partners by profit shares
          </p>
        )}
        <Field data-invalid={!!form.formState.errors.reason}>
          <FieldLabel htmlFor="count-reason">Reason</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {COUNT_REASONS.map((r) => (
              <Button key={r} type="button" variant={form.watch('reason') === r ? 'default' : 'outline'} size="sm" onClick={() => form.setValue('reason', r, { shouldValidate: true })}>
                {r}
              </Button>
            ))}
          </div>
          <Input id="count-reason" {...form.register('reason')} />
          <FieldError errors={[form.formState.errors.reason]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="count-date">Date</FieldLabel>
          <Controller
            control={form.control}
            name="date"
            render={({ field }) => <DateField id="count-date" value={field.value} onChange={field.onChange} />}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="count-note">Note</FieldLabel>
          <Input id="count-note" {...form.register('note')} />
        </Field>
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Save count
        </Button>
      </FieldGroup>
    </form>
  );
}
