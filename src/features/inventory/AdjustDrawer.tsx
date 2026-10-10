import { useMemo, useState } from 'react';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { formatMoney, parseMoney } from '@/domain/money';
import { formatQuantity, milliToInput, parseQuantity } from '@/domain/quantity';
import { adjustmentDelta, buildAdjustment, StockError, type AdjustMode, type StockDelta } from '@/domain/stock';
import { sharesAreComplete } from '@/domain/shares';
import { todayIso } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { useDefaultShares } from '@/features/money/accounts';
import { stockOf, unitOf, usePostMovement, type Item } from './api';

const MODES: { value: AdjustMode; label: string; field: string; hint: string }[] = [
  { value: 'count', label: 'Count', field: 'On the shelf', hint: 'Enter what is really there; the difference is booked.' },
  { value: 'damaged', label: 'Damaged', field: 'How much is damaged?', hint: 'Taken out of stock.' },
  { value: 'lost', label: 'Lost', field: 'How much is missing?', hint: 'Taken out of stock.' },
  { value: 'found', label: 'Found', field: 'How much turned up?', hint: 'Added to stock.' },
];

export function AdjustDrawer({ item, open, onOpenChange }: { item: Item; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={`Adjust ${item.name}`}>
      {open && <AdjustForm item={item} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function AdjustForm({ item, onDone }: { item: Item; onDone: () => void }) {
  const unit = unitOf(item);
  const stock = stockOf(item);
  const shares = useDefaultShares();
  const post = usePostMovement();
  const emptyNow = stock.qty === 0;
  const [mode, setMode] = useState<AdjustMode>('count');
  const modeInfo = MODES.find((m) => m.value === mode)!;
  const needsUnitCost = emptyNow && (mode === 'count' || mode === 'found');

  const schema = useMemo(
    () =>
      z
        .object({
          amount: z
            .string()
            .refine(
              (v) => parseQuantity(v, { wholeOnly: unit.wholeOnly, allowZero: mode === 'count' }) !== null,
              unit.wholeOnly ? 'Whole numbers only' : 'Enter a quantity',
            ),
          unitCost: z.string(),
          date: z.string(),
          note: z.string().max(500),
        })
        .refine((v) => mode !== 'count' || parseQuantity(v.amount, { allowZero: true }) !== stock.qty, {
          path: ['amount'],
          message: 'That’s what the app already has',
        })
        .refine((v) => (mode !== 'damaged' && mode !== 'lost') || (parseQuantity(v.amount) ?? 0) <= stock.qty, {
          path: ['amount'],
          message: `Only ${formatQuantity(stock.qty, unit.name)} in stock`,
        })
        .refine((v) => !needsUnitCost || parseMoney(v.unitCost) !== null, {
          path: ['unitCost'],
          message: 'What is one unit worth? (0 if nothing)',
        }),
    [mode, unit.wholeOnly, unit.name, stock.qty, needsUnitCost],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { amount: milliToInput(stock.qty), unitCost: '', date: todayIso(), note: '' },
  });

  const switchMode = (next: AdjustMode) => {
    setMode(next);
    form.clearErrors();
    form.setValue('amount', next === 'count' ? milliToInput(stock.qty) : '');
  };

  const amount = parseQuantity(form.watch('amount'), { wholeOnly: unit.wholeOnly, allowZero: mode === 'count' });
  const unitCost = parseMoney(form.watch('unitCost')) ?? undefined;
  let preview: StockDelta | null = null;
  try {
    if (amount !== null) preview = adjustmentDelta(stock, mode, amount, unitCost);
  } catch (e) {
    if (!(e instanceof StockError)) throw e;
  }

  const onSubmit = form.handleSubmit(async (v) => {
    if (!sharesAreComplete(shares)) {
      toast.error('Default profit shares don’t add up to 100 %. An admin can fix this under More → Users & partners.');
      return;
    }
    const amountMilli = parseQuantity(v.amount, { wholeOnly: unit.wholeOnly, allowZero: mode === 'count' })!;
    try {
      await post.mutateAsync({
        itemId: item.id,
        build: (fresh) =>
          buildAdjustment({
            stock: stockOf(fresh),
            mode,
            amount: amountMilli,
            unitCostIfEmpty: parseMoney(v.unitCost) ?? undefined,
            shares,
            occurredOn: v.date,
            note: v.note,
          }),
      });
      toast.success(`${item.name}: ${modeInfo.label.toLowerCase()} saved`);
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <ToggleGroup
          type="single"
          variant="outline"
          className="grid w-full grid-cols-4"
          value={mode}
          onValueChange={(v) => v && switchMode(v as AdjustMode)}
        >
          {MODES.map((m) => (
            <ToggleGroupItem
              key={m.value}
              value={m.value}
              disabled={emptyNow && (m.value === 'damaged' || m.value === 'lost')}
              className="px-1 text-sm data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <Field data-invalid={!!form.formState.errors.amount}>
          <FieldLabel htmlFor="adjust-amount">{modeInfo.field}</FieldLabel>
          <SuffixInput id="adjust-amount" suffix={unit.name} autoFocus {...form.register('amount')} />
          <FieldDescription>
            {modeInfo.hint} The app has {formatQuantity(stock.qty, unit.name)}.
          </FieldDescription>
          <FieldError errors={[form.formState.errors.amount]} />
        </Field>

        {needsUnitCost && (
          <Field data-invalid={!!form.formState.errors.unitCost}>
            <FieldLabel htmlFor="adjust-cost">Value of one {unit.name}</FieldLabel>
            <SuffixInput id="adjust-cost" suffix="€" {...form.register('unitCost')} />
            <FieldDescription>What you paid for it (roughly). Used as the average cost from now on.</FieldDescription>
            <FieldError errors={[form.formState.errors.unitCost]} />
          </Field>
        )}

        {preview && (
          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
            {preview.qty > 0 ? '+' : ''}
            {formatQuantity(preview.qty, unit.name)} · {formatMoney(preview.value, { sign: true })} stock value, shared
            between partners by profit shares
          </p>
        )}

        <Field>
          <FieldLabel htmlFor="adjust-date">Date</FieldLabel>
          <Controller
            control={form.control}
            name="date"
            render={({ field }) => <DateField id="adjust-date" value={field.value} onChange={field.onChange} />}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="adjust-note">Note</FieldLabel>
          <Input id="adjust-note" placeholder={mode === 'damaged' ? 'e.g. dropped, cracked' : undefined} {...form.register('note')} />
        </Field>
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </FieldGroup>
    </form>
  );
}
