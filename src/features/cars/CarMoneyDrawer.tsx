import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { SuffixInput } from '@/components/SuffixInput';
import { SuggestionInput } from '@/components/SuggestionInput';
import { PayerPicker } from '@/components/PayerPicker';
import { DateField } from '@/components/DateField';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { centsToInput, parseMoney } from '@/domain/money';
import { todayIso } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { getLastPayer, setLastPayer, useAccounts, usePayerOptions } from '@/features/money/accounts';
import { useExpenseCategories } from '@/features/catalog/api';
import { useSuppliers } from '@/features/inventory/api';
import { useDeleteCarTransaction, useSaveCarTransaction, type Car, type CarMoneyRow } from './api';

export type CarMoneyKind = 'purchase' | 'part' | 'cost';

const TITLES: Record<CarMoneyKind, { add: string; edit: string }> = {
  purchase: { add: 'Purchase price', edit: 'Edit purchase price' },
  part: { add: 'Part bought for this car', edit: 'Edit part' },
  cost: { add: 'Other cost', edit: 'Edit cost' },
};

const CATEGORY: Record<CarMoneyKind, 'car_purchase' | 'car_part' | 'car_cost'> = {
  purchase: 'car_purchase',
  part: 'car_part',
  cost: 'car_cost',
};

export function CarMoneyDrawer({
  car,
  kind,
  row,
  onClose,
}: {
  car: Car;
  kind: CarMoneyKind | null;
  row?: CarMoneyRow;
  onClose: () => void;
}) {
  return (
    <FormDrawer open={kind !== null} onOpenChange={(o) => !o && onClose()} title={kind ? TITLES[kind][row ? 'edit' : 'add'] : ''}>
      {kind && <CarMoneyForm key={row?.id ?? kind} car={car} kind={kind} row={row} onDone={onClose} />}
    </FormDrawer>
  );
}

function CarMoneyForm({ car, kind, row, onDone }: { car: Car; kind: CarMoneyKind; row?: CarMoneyRow; onDone: () => void }) {
  const payers = usePayerOptions();
  const accounts = useAccounts();
  const categories = useExpenseCategories();
  const suppliers = useSuppliers();
  const save = useSaveCarTransaction();
  const remove = useDeleteCarTransaction();
  const lastPayer = getLastPayer();

  const schema = useMemo(
    () =>
      z
        .object({
          amount: z.string().refine((v) => (parseMoney(v) ?? 0) > 0, 'Enter the amount'),
          paidBy: z.string().nullable(),
          date: z.string(),
          description: z.string().trim().max(200),
          counterparty: z.string().trim().max(80),
          categoryId: z.string(),
        })
        .refine((v) => Boolean(v.paidBy), { path: ['paidBy'], message: 'Who paid?' })
        .refine((v) => kind !== 'part' || v.description.length > 0, { path: ['description'], message: 'What part?' })
        .refine((v) => kind !== 'cost' || v.categoryId.length > 0, { path: ['categoryId'], message: 'Pick what kind of cost' }),
    [kind],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: row ? centsToInput(row.amount_cents) : '',
      paidBy: row?.from_account_id ?? (payers.some((p) => p.accountId === lastPayer) ? lastPayer : null),
      date: row?.occurred_on ?? todayIso(),
      description: row?.description ?? '',
      counterparty: row?.counterparty ?? (kind === 'purchase' ? (car.seller?.name ?? '') : ''),
      categoryId: row?.expense_category_id ?? '',
    },
  });
  useEffect(() => {
    if (!form.getValues('paidBy') && lastPayer && payers.some((p) => p.accountId === lastPayer)) form.setValue('paidBy', lastPayer);
  }, [payers, lastPayer, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    const external = accounts.data?.find((a) => a.kind === 'external');
    if (!external) return;
    try {
      await save.mutateAsync({
        id: row?.id,
        values: {
          car_id: car.id,
          category: CATEGORY[kind],
          kind: 'expense',
          amount_cents: parseMoney(v.amount)!,
          from_account_id: v.paidBy!,
          to_account_id: external.id,
          occurred_on: v.date,
          description: kind === 'purchase' ? 'Purchase' : v.description || null,
          counterparty: v.counterparty || null,
          expense_category_id: kind === 'cost' ? v.categoryId : null,
        },
      });
      setLastPayer(v.paidBy!);
      toast.success('Saved');
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  const err = form.formState.errors;
  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        {kind === 'cost' && (
          <Field data-invalid={!!err.categoryId}>
            <FieldLabel>Kind of cost</FieldLabel>
            <Controller
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <ToggleGroup type="single" variant="outline" className="flex flex-wrap" value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                  {(categories.data ?? []).map((c) => (
                    <ToggleGroupItem key={c.id} value={c.id} className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                      {c.name}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
            <FieldError errors={[err.categoryId]} />
          </Field>
        )}
        {kind !== 'purchase' && (
          <Field data-invalid={!!err.description}>
            <FieldLabel htmlFor="money-desc">{kind === 'part' ? 'Part' : 'What for (optional)'}</FieldLabel>
            <Input id="money-desc" autoFocus={kind === 'part' && !row} placeholder={kind === 'part' ? 'e.g. Front brake pads' : ''} {...form.register('description')} />
            <FieldError errors={[err.description]} />
          </Field>
        )}
        <Field data-invalid={!!err.amount}>
          <FieldLabel htmlFor="money-amount">{kind === 'purchase' ? 'Price paid' : 'Amount'}</FieldLabel>
          <SuffixInput id="money-amount" suffix="€" autoFocus={kind !== 'part' && !row} {...form.register('amount')} />
          <FieldError errors={[err.amount]} />
        </Field>
        <Field data-invalid={!!err.paidBy}>
          <FieldLabel>Who paid?</FieldLabel>
          <Controller
            control={form.control}
            name="paidBy"
            render={({ field }) => <PayerPicker options={payers} value={field.value} onChange={field.onChange} />}
          />
          <FieldError errors={[err.paidBy]} />
        </Field>
        {kind === 'part' && (
          <Field>
            <FieldLabel htmlFor="money-supplier">Supplier</FieldLabel>
            <Controller
              control={form.control}
              name="counterparty"
              render={({ field }) => (
                <SuggestionInput id="money-supplier" value={field.value} onChange={field.onChange} options={suppliers.data ?? []} />
              )}
            />
          </Field>
        )}
        {kind === 'cost' && (
          <Field>
            <FieldLabel htmlFor="money-paidto">Paid to (optional)</FieldLabel>
            <Input id="money-paidto" placeholder="e.g. STP Zagreb, towing service" {...form.register('counterparty')} />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="money-date">Date</FieldLabel>
          <Controller
            control={form.control}
            name="date"
            render={({ field }) => <DateField id="money-date" value={field.value} onChange={field.onChange} />}
          />
        </Field>
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Save
        </Button>
        {row && (
          <ConfirmButton
            variant="ghost"
            className="text-destructive"
            title="Delete this entry?"
            description="It is removed from the car’s costs and from the money ledger."
            confirmLabel="Delete"
            onConfirm={async () => {
              try {
                await remove.mutateAsync(row);
                toast.success('Deleted');
                onDone();
              } catch (e) {
                toast.error(syncErrorMessage(e));
              }
            }}
          >
            <Trash2 /> Delete
          </ConfirmButton>
        )}
      </FieldGroup>
    </form>
  );
}
