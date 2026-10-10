import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { SuffixInput } from '@/components/SuffixInput';
import { PayerPicker } from '@/components/PayerPicker';
import { DateField } from '@/components/DateField';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { centsToInput, parseMoney } from '@/domain/money';
import { sharesAreComplete } from '@/domain/shares';
import { todayIso } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { useExpenseCategories } from '@/features/catalog/api';
import { getLastPayer, setLastPayer, useAccounts, useDefaultShares, usePayerOptions } from './accounts';
import { useDeleteTransaction, useSaveDirectEntry, useSaveWorkshopMoney, type TransactionRow } from './api';
import { AttachmentStrip } from '@/features/files/AttachmentStrip';

export type EntryMode = 'deposit' | 'withdrawal' | 'transfer' | 'expense' | 'income';

export interface EntryPrefill {
  from?: string;
  to?: string;
  amount?: number;
  description?: string;
}

const TITLES: Record<EntryMode, string> = {
  deposit: 'Put money into the wallet',
  withdrawal: 'Take money out of the wallet',
  transfer: 'Transfer',
  expense: 'Workshop expense',
  income: 'Other income',
};

export function modeOf(row: TransactionRow): EntryMode | null {
  switch (row.category) {
    case 'deposit':
      return 'deposit';
    case 'withdrawal':
      return 'withdrawal';
    case 'transfer':
      return 'transfer';
    case 'workshop_expense':
      return 'expense';
    case 'other_income':
      return 'income';
    default:
      return null;
  }
}

export function MoneyEntryDrawer({
  mode,
  row,
  prefill,
  onClose,
}: {
  mode: EntryMode | null;
  row?: TransactionRow;
  prefill?: EntryPrefill;
  onClose: () => void;
}) {
  return (
    <FormDrawer open={mode !== null} onOpenChange={(o) => !o && onClose()} title={mode ? (row ? `Edit: ${TITLES[mode].toLowerCase()}` : TITLES[mode]) : ''}>
      {mode && <EntryForm key={row?.id ?? mode} mode={mode} row={row} prefill={prefill} onDone={onClose} />}
    </FormDrawer>
  );
}

function EntryForm({ mode, row, prefill, onDone }: { mode: EntryMode; row?: TransactionRow; prefill?: EntryPrefill; onDone: () => void }) {
  const payers = usePayerOptions();
  const partners = payers.filter((p) => p.partnerId);
  const accounts = useAccounts();
  const categories = useExpenseCategories();
  const shares = useDefaultShares();
  const saveDirect = useSaveDirectEntry();
  const saveWorkshop = useSaveWorkshopMoney();
  const remove = useDeleteTransaction();
  const wallet = accounts.data?.find((a) => a.kind === 'wallet');
  const external = accounts.data?.find((a) => a.kind === 'external');
  const lastPayer = getLastPayer();

  const schema = useMemo(
    () =>
      z
        .object({
          amount: z.string().refine((v) => (parseMoney(v) ?? 0) > 0, 'Enter the amount'),
          from: z.string().nullable(),
          to: z.string().nullable(),
          date: z.string(),
          description: z.string().trim().max(200),
          counterparty: z.string().trim().max(80),
          categoryId: z.string(),
        })
        .refine((v) => mode === 'income' || Boolean(v.from), { path: ['from'], message: 'Choose who' })
        .refine((v) => mode === 'expense' || Boolean(v.to), { path: ['to'], message: 'Choose who' })
        .refine((v) => mode !== 'transfer' || v.from !== v.to, { path: ['to'], message: 'From and to must differ' })
        .refine((v) => mode !== 'expense' || v.categoryId.length > 0, { path: ['categoryId'], message: 'Pick what kind of cost' }),
    [mode],
  );
  type Values = z.infer<typeof schema>;

  // who is "from" and "to" for each mode (the wallet side is fixed where it must be)
  const defaults = (): Values => {
    const lastIsPartner = partners.some((p) => p.accountId === lastPayer) ? lastPayer : null;
    const lastAny = payers.some((p) => p.accountId === lastPayer) ? lastPayer : null;
    const base = {
      amount: row ? centsToInput(row.amount_cents) : prefill?.amount ? centsToInput(prefill.amount) : '',
      date: row?.occurred_on ?? todayIso(),
      description: row?.description ?? prefill?.description ?? '',
      counterparty: row?.counterparty ?? '',
      categoryId: row?.expense_category_id ?? '',
    };
    if (row) return { ...base, from: row.from_account_id, to: row.to_account_id };
    switch (mode) {
      case 'deposit':
        return { ...base, from: prefill?.from ?? lastIsPartner, to: wallet?.id ?? null };
      case 'withdrawal':
        return { ...base, from: wallet?.id ?? null, to: prefill?.to ?? lastIsPartner };
      case 'transfer':
        return { ...base, from: prefill?.from ?? null, to: prefill?.to ?? null };
      case 'expense':
        return { ...base, from: lastAny ?? wallet?.id ?? null, to: external?.id ?? null };
      case 'income':
        return { ...base, from: external?.id ?? null, to: wallet?.id ?? null };
    }
  };
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults() });
  // accounts may load after the drawer opened
  useEffect(() => {
    if (!accounts.data) return;
    const d = defaults();
    if (!form.getValues('from') && d.from) form.setValue('from', d.from);
    if (!form.getValues('to') && d.to) form.setValue('to', d.to);
  }, [accounts.data, payers.length]);

  const onSubmit = form.handleSubmit(async (v) => {
    const amount = parseMoney(v.amount)!;
    try {
      if (mode === 'expense' || mode === 'income') {
        if (!sharesAreComplete(shares)) {
          toast.error('Default profit shares don’t add up to 100 %. An admin can fix this under More → Users & partners.');
          return;
        }
        await saveWorkshop.mutateAsync({
          id: row?.id,
          kind: mode,
          amount,
          accountId: mode === 'expense' ? v.from! : v.to!,
          occurredOn: v.date,
          expenseCategoryId: mode === 'expense' ? v.categoryId : undefined,
          description: v.description,
          counterparty: v.counterparty,
          shares,
        });
        if (mode === 'expense') setLastPayer(v.from!);
      } else {
        await saveDirect.mutateAsync({
          id: row?.id,
          values: {
            kind: mode,
            category: mode,
            amount_cents: amount,
            from_account_id: v.from!,
            to_account_id: v.to!,
            occurred_on: v.date,
            description: v.description || null,
          },
        });
      }
      toast.success('Saved');
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  const err = form.formState.errors;
  const picker = (name: 'from' | 'to', label: string, options = payers) => (
    <Field data-invalid={!!err[name]}>
      <FieldLabel>{label}</FieldLabel>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => <PayerPicker options={options} value={field.value} onChange={field.onChange} />}
      />
      <FieldError errors={[err[name]]} />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        {mode === 'expense' && (
          <Field data-invalid={!!err.categoryId}>
            <FieldLabel>Kind of cost</FieldLabel>
            <Controller
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <ToggleGroup type="single" variant="outline" className="flex flex-wrap" value={field.value} onValueChange={(val) => val && field.onChange(val)}>
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
        <Field data-invalid={!!err.amount}>
          <FieldLabel htmlFor="entry-amount">Amount</FieldLabel>
          <SuffixInput id="entry-amount" suffix="€" autoFocus={!row} {...form.register('amount')} />
          <FieldError errors={[err.amount]} />
        </Field>
        {mode === 'deposit' && picker('from', 'Who put it in?', partners)}
        {mode === 'withdrawal' && picker('to', 'Who took it?', partners)}
        {mode === 'transfer' && (
          <>
            {picker('from', 'From')}
            {picker('to', 'To')}
          </>
        )}
        {mode === 'expense' && picker('from', 'Who paid?')}
        {mode === 'income' && picker('to', 'Who got the money?')}
        <Field>
          <FieldLabel htmlFor="entry-desc">{mode === 'expense' || mode === 'income' ? 'What for' : 'Note'}</FieldLabel>
          <Input
            id="entry-desc"
            placeholder={mode === 'expense' ? 'e.g. Gloves, brake cleaner, electricity' : mode === 'income' ? 'e.g. Sold scrap metal' : ''}
            {...form.register('description')}
          />
        </Field>
        {(mode === 'expense' || mode === 'income') && (
          <Field>
            <FieldLabel htmlFor="entry-cp">{mode === 'expense' ? 'Paid to (optional)' : 'From whom (optional)'}</FieldLabel>
            <Input id="entry-cp" {...form.register('counterparty')} />
            <FieldDescription>Split between partners by their default profit shares.</FieldDescription>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="entry-date">Date</FieldLabel>
          <Controller
            control={form.control}
            name="date"
            render={({ field }) => <DateField id="entry-date" value={field.value} onChange={field.onChange} />}
          />
        </Field>
        {row && (mode === 'expense' || mode === 'income') && (
          <AttachmentStrip entityType="transaction" entityId={row.id} kind="receipt" title="Receipt" allowPdf label={row.description ?? undefined} />
        )}
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Save
        </Button>
        {row && (
          <ConfirmButton
            variant="ghost"
            className="text-destructive"
            title="Delete this entry?"
            description="It is removed from the ledger and all balances."
            confirmLabel="Delete"
            onConfirm={async () => {
              try {
                await remove.mutateAsync(row.id);
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
