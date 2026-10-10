import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ChevronLeft, Loader2, Trash2, Undo2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { SuffixInput } from '@/components/SuffixInput';
import { SuggestionInput } from '@/components/SuggestionInput';
import { PayerPicker } from '@/components/PayerPicker';
import { DateField } from '@/components/DateField';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { centsToInput, formatMoney, parseMoney, type Cents } from '@/domain/money';
import { formatQuantity, milliToInput, parseQuantity, toMilli } from '@/domain/quantity';
import { issueDelta } from '@/domain/stock';
import { withMarkup } from '@/domain/jobs';
import { todayIso } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { getLastPayer, setLastPayer, useAccounts, usePayerOptions } from '@/features/money/accounts';
import { stockOf, unitOf, useSuppliers, type Item } from '@/features/inventory/api';
import { ItemPicker } from '@/features/cars/CarStockDrawers';
import {
  useAddJobStockLine,
  useDeleteLine,
  useDeletePayment,
  useRemoveJobStockLine,
  useSaveBoughtLine,
  useSaveJob,
  useSaveOtherLine,
  useSavePayment,
  type Job,
  type JobLine,
} from './api';

const MARKUPS = [0, 10, 20, 30];

function MarkupChips({ cost, onPick }: { cost: Cents; onPick: (price: Cents) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {MARKUPS.map((m) => (
        <Button key={m} type="button" variant="outline" size="sm" onClick={() => onPick(withMarkup(cost, m))}>
          {m === 0 ? 'At cost' : `+${m} %`}
        </Button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// From stock
// ---------------------------------------------------------------------------

export function StockLineDrawer({ job, open, onOpenChange }: { job: Job; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [item, setItem] = useState<Item | null>(null);
  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setItem(null);
  };
  return (
    <FormDrawer open={open} onOpenChange={close} title={item ? item.name : `Parts from stock → ${job.ref}`}>
      {open && (item ? <StockLineForm job={job} item={item} onBack={() => setItem(null)} onDone={() => close(false)} /> : <ItemPicker onPick={setItem} />)}
    </FormDrawer>
  );
}

function StockLineForm({ job, item, onBack, onDone }: { job: Job; item: Item; onBack: () => void; onDone: () => void }) {
  const unit = unitOf(item);
  const stock = stockOf(item);
  const add = useAddJobStockLine();
  const [qtyText, setQtyText] = useState(unit.wholeOnly ? '1' : '');
  const [priceText, setPriceText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const qty = parseQuantity(qtyText, { wholeOnly: unit.wholeOnly });
  const cost = qty !== null && qty <= stock.qty ? -issueDelta(stock, qty).value : null;

  const submit = async () => {
    if (qty === null) return setError(unit.wholeOnly ? 'Whole numbers, more than 0' : 'Enter how much');
    if (qty > stock.qty) return setError(`Only ${formatQuantity(stock.qty, unit.name)} in stock`);
    const explicit = priceText.trim() ? parseMoney(priceText) : null;
    if (priceText.trim() && explicit === null) return setError('Enter a valid price');
    try {
      await add.mutateAsync({
        jobId: job.id,
        itemId: item.id,
        qty,
        salePrice: (actualCost) => explicit ?? actualCost,
        description: item.name,
        occurredOn: todayIso(),
      });
      toast.success(`${item.name} added to ${job.ref}`);
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  return (
    <FieldGroup>
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="jl-qty">How much?</FieldLabel>
        <SuffixInput id="jl-qty" suffix={unit.name} autoFocus value={qtyText} onChange={(e) => (setQtyText(e.target.value), setError(null))} />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setQtyText(milliToInput(stock.qty))}>
            All ({formatQuantity(stock.qty, unit.name)})
          </Button>
        </div>
        {cost !== null && <FieldDescription>Costs us {formatMoney(cost)} (average price).</FieldDescription>}
        <FieldError>{error}</FieldError>
      </Field>
      <Field>
        <FieldLabel htmlFor="jl-price">Price for the customer</FieldLabel>
        <SuffixInput id="jl-price" suffix="€" placeholder={cost !== null ? centsToInput(cost) : ''} value={priceText} onChange={(e) => setPriceText(e.target.value)} />
        {cost !== null && <MarkupChips cost={cost} onPick={(p) => setPriceText(centsToInput(p))} />}
        <FieldDescription>Empty = what it cost us.</FieldDescription>
      </Field>
      <Button size="lg" disabled={add.isPending} onClick={submit}>
        {add.isPending && <Loader2 className="animate-spin" />}
        Add to {job.ref}
      </Button>
      <Button variant="ghost" onClick={onBack}>
        <ChevronLeft /> Other item
      </Button>
    </FieldGroup>
  );
}

// ---------------------------------------------------------------------------
// Any line: edit / delete (stock lines: change the price or put the parts back)
// ---------------------------------------------------------------------------

const otherSchema = z.object({
  description: z.string().trim().min(1, 'Describe the line').max(200),
  qty: z.string().refine((v) => parseQuantity(v) !== null, 'Enter a quantity'),
  price: z.string().refine((v) => parseMoney(v) !== null, 'Enter the price'),
});

export function OtherLineDrawer({ job, line, open, onClose }: { job: Job; line?: JobLine; open: boolean; onClose: () => void }) {
  const title = line ? (line.kind === 'stock' ? 'Part from stock' : 'Edit line') : 'Other line';
  return (
    <FormDrawer open={open} onOpenChange={(o) => !o && onClose()} title={title}>
      {open && <OtherLineForm key={line?.id ?? 'new'} job={job} line={line} onDone={onClose} />}
    </FormDrawer>
  );
}

function OtherLineForm({ job, line, onDone }: { job: Job; line?: JobLine; onDone: () => void }) {
  const save = useSaveOtherLine();
  const remove = useDeleteLine();
  const removeStock = useRemoveJobStockLine();
  const isStock = line?.kind === 'stock';
  const form = useForm({
    resolver: zodResolver(otherSchema),
    defaultValues: {
      description: line?.description ?? '',
      qty: line ? milliToInput(toMilli(line.qty)) : '1',
      price: line ? centsToInput(line.sale_price_cents) : '',
    },
  });

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        lineId: line?.id,
        jobId: job.id,
        description: v.description,
        qty: isStock ? Number(line!.qty) : parseQuantity(v.qty)! / 1000,
        salePrice: parseMoney(v.price)!,
      });
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
        <Field data-invalid={!!err.description}>
          <FieldLabel htmlFor="ol-desc">Description</FieldLabel>
          <Input id="ol-desc" autoFocus={!line} placeholder="e.g. Diagnostics, disposal fee" {...form.register('description')} />
          <FieldError errors={[err.description]} />
        </Field>
        {!isStock && (
          <Field data-invalid={!!err.qty}>
            <FieldLabel htmlFor="ol-qty">Quantity</FieldLabel>
            <SuffixInput id="ol-qty" suffix="×" {...form.register('qty')} />
            <FieldError errors={[err.qty]} />
          </Field>
        )}
        <Field data-invalid={!!err.price}>
          <FieldLabel htmlFor="ol-price">Price for the customer (line total)</FieldLabel>
          <SuffixInput id="ol-price" suffix="€" {...form.register('price')} />
          {line && line.cost > 0 && (
            <>
              <FieldDescription>Costs us {formatMoney(line.cost)}.</FieldDescription>
              <MarkupChips cost={line.cost} onPick={(p) => form.setValue('price', centsToInput(p))} />
            </>
          )}
          <FieldError errors={[err.price]} />
        </Field>
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Save
        </Button>
        {line && isStock && (
          <ConfirmButton
            variant="ghost"
            title="Put the parts back in stock?"
            description="The line is removed from the job and the parts go back to stock at what the job was charged."
            confirmLabel="Return to stock"
            onConfirm={async () => {
              try {
                await removeStock.mutateAsync(line);
                toast.success('Back in stock');
                onDone();
              } catch (e) {
                toast.error(syncErrorMessage(e));
              }
            }}
          >
            <Undo2 /> Take off the job (return to stock)
          </ConfirmButton>
        )}
        {line && !isStock && (
          <ConfirmButton
            variant="ghost"
            className="text-destructive"
            title="Delete this line?"
            confirmLabel="Delete"
            onConfirm={async () => {
              try {
                await remove.mutateAsync(line);
                toast.success('Deleted');
                onDone();
              } catch (e) {
                toast.error(syncErrorMessage(e));
              }
            }}
          >
            <Trash2 /> Delete line
          </ConfirmButton>
        )}
      </FieldGroup>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Part bought for the job
// ---------------------------------------------------------------------------

const boughtSchema = z
  .object({
    description: z.string().trim().min(1, 'What part?').max(200),
    qty: z.string().refine((v) => parseQuantity(v) !== null, 'Enter a quantity'),
    cost: z.string().refine((v) => (parseMoney(v) ?? 0) > 0, 'What did it cost us?'),
    paidBy: z.string().nullable(),
    supplier: z.string().trim().max(80),
    price: z.string(),
    date: z.string(),
  })
  .refine((v) => Boolean(v.paidBy), { path: ['paidBy'], message: 'Who paid?' })
  .refine((v) => !v.price.trim() || parseMoney(v.price) !== null, { path: ['price'], message: 'Enter a valid price' });

export function BoughtLineDrawer({ job, line, open, onClose }: { job: Job; line?: JobLine; open: boolean; onClose: () => void }) {
  return (
    <FormDrawer open={open} onOpenChange={(o) => !o && onClose()} title={line ? 'Edit bought part' : 'Part bought for this job'}>
      {open && <BoughtLineForm key={line?.id ?? 'new'} job={job} line={line} onDone={onClose} />}
    </FormDrawer>
  );
}

function BoughtLineForm({ job, line, onDone }: { job: Job; line?: JobLine; onDone: () => void }) {
  const payers = usePayerOptions();
  const suppliers = useSuppliers();
  const save = useSaveBoughtLine();
  const remove = useDeleteLine();
  const lastPayer = getLastPayer();
  const form = useForm({
    resolver: zodResolver(boughtSchema),
    defaultValues: {
      description: line?.description ?? '',
      qty: line ? milliToInput(toMilli(line.qty)) : '1',
      cost: line?.purchase ? centsToInput(line.purchase.amount_cents) : '',
      paidBy: line?.purchase?.from_account_id ?? (payers.some((p) => p.accountId === lastPayer) ? lastPayer : null),
      supplier: line?.purchase?.counterparty ?? '',
      price: line ? centsToInput(line.sale_price_cents) : '',
      date: line?.purchase?.occurred_on ?? todayIso(),
    },
  });
  useEffect(() => {
    if (!form.getValues('paidBy') && lastPayer && payers.some((p) => p.accountId === lastPayer)) form.setValue('paidBy', lastPayer);
  }, [payers, lastPayer, form]);
  const cost = parseMoney(form.watch('cost'));

  const onSubmit = form.handleSubmit(async (v) => {
    const costCents = parseMoney(v.cost)!;
    try {
      await save.mutateAsync({
        lineId: line?.id,
        jobId: job.id,
        description: v.description,
        qty: parseQuantity(v.qty)! / 1000,
        cost: costCents,
        paidBy: v.paidBy!,
        supplier: v.supplier,
        salePrice: v.price.trim() ? parseMoney(v.price)! : costCents,
        occurredOn: v.date,
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
        <Field data-invalid={!!err.description}>
          <FieldLabel htmlFor="bl-desc">Part</FieldLabel>
          <Input id="bl-desc" autoFocus={!line} placeholder="e.g. Front brake pads" {...form.register('description')} />
          <FieldError errors={[err.description]} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field data-invalid={!!err.qty}>
            <FieldLabel htmlFor="bl-qty">Quantity</FieldLabel>
            <SuffixInput id="bl-qty" suffix="×" {...form.register('qty')} />
            <FieldError errors={[err.qty]} />
          </Field>
          <Field data-invalid={!!err.cost}>
            <FieldLabel htmlFor="bl-cost">We paid (total)</FieldLabel>
            <SuffixInput id="bl-cost" suffix="€" {...form.register('cost')} />
            <FieldError errors={[err.cost]} />
          </Field>
        </div>
        <Field data-invalid={!!err.paidBy}>
          <FieldLabel>Who paid?</FieldLabel>
          <Controller control={form.control} name="paidBy" render={({ field }) => <PayerPicker options={payers} value={field.value} onChange={field.onChange} />} />
          <FieldError errors={[err.paidBy]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="bl-supplier">Supplier</FieldLabel>
          <Controller
            control={form.control}
            name="supplier"
            render={({ field }) => <SuggestionInput id="bl-supplier" value={field.value} onChange={field.onChange} options={suppliers.data ?? []} />}
          />
        </Field>
        <Field data-invalid={!!err.price}>
          <FieldLabel htmlFor="bl-price">Price for the customer (line total)</FieldLabel>
          <SuffixInput id="bl-price" suffix="€" placeholder={cost ? centsToInput(cost) : ''} {...form.register('price')} />
          {cost !== null && cost > 0 && <MarkupChips cost={cost} onPick={(p) => form.setValue('price', centsToInput(p))} />}
          <FieldDescription>Empty = what we paid.</FieldDescription>
          <FieldError errors={[err.price]} />
        </Field>
        <Field>
          <FieldLabel>Date</FieldLabel>
          <Controller control={form.control} name="date" render={({ field }) => <DateField value={field.value} onChange={field.onChange} />} />
        </Field>
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Save
        </Button>
        {line && (
          <ConfirmButton
            variant="ghost"
            className="text-destructive"
            title="Delete this part?"
            description="The line and its purchase are removed."
            confirmLabel="Delete"
            onConfirm={async () => {
              try {
                await remove.mutateAsync(line);
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

// ---------------------------------------------------------------------------
// Labor and payments
// ---------------------------------------------------------------------------

export function LaborDrawer({ job, open, onOpenChange }: { job: Job; open: boolean; onOpenChange: (o: boolean) => void }) {
  const save = useSaveJob();
  const [text, setText] = useState(centsToInput(job.labor_price_cents));
  useEffect(() => {
    if (open) setText(centsToInput(job.labor_price_cents));
  }, [open, job.labor_price_cents]);
  const cents = parseMoney(text);
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Labor price">
      <FieldGroup>
        <Field data-invalid={cents === null}>
          <FieldLabel htmlFor="labor">Fixed price for the work</FieldLabel>
          <SuffixInput id="labor" suffix="€" autoFocus value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <Button
          size="lg"
          disabled={cents === null || save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync({
                id: job.id,
                values: { ref: job.ref, customer_id: job.customer_id, description: job.description, labor_price_cents: cents! },
              });
              toast.success('Saved');
              onOpenChange(false);
            } catch (e) {
              toast.error(syncErrorMessage(e));
            }
          }}
        >
          {save.isPending && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </FieldGroup>
    </FormDrawer>
  );
}

export interface PaymentRow {
  id: string;
  amount_cents: number;
  to_account_id: string;
  occurred_on: string;
}

const paymentSchema = z.object({
  amount: z.string().refine((v) => (parseMoney(v) ?? 0) > 0, 'Enter the amount'),
  receivedBy: z.string().nullable().refine((v) => Boolean(v), 'Who got the money?'),
  date: z.string(),
});

export function PaymentDrawer({ job, payment, open, onClose }: { job: Job; payment?: PaymentRow; open: boolean; onClose: () => void }) {
  return (
    <FormDrawer open={open} onOpenChange={(o) => !o && onClose()} title={payment ? 'Edit payment' : 'Customer paid'}>
      {open && <PaymentForm key={payment?.id ?? 'new'} job={job} payment={payment} onDone={onClose} />}
    </FormDrawer>
  );
}

function PaymentForm({ job, payment, onDone }: { job: Job; payment?: PaymentRow; onDone: () => void }) {
  const payers = usePayerOptions();
  const accounts = useAccounts();
  const save = useSavePayment();
  const remove = useDeletePayment();
  const saveJob = useSaveJob();
  const lastPayer = getLastPayer();
  const form = useForm({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: payment ? centsToInput(payment.amount_cents) : job.totals.outstanding > 0 ? centsToInput(job.totals.outstanding) : '',
      receivedBy: payment?.to_account_id ?? (payers.some((p) => p.accountId === lastPayer) ? lastPayer : null),
      date: payment?.occurred_on ?? todayIso(),
    },
  });
  const external = useMemo(() => accounts.data?.find((a) => a.kind === 'external'), [accounts.data]);

  const onSubmit = form.handleSubmit(async (v) => {
    if (!external) return;
    const amount = parseMoney(v.amount)!;
    try {
      await save.mutateAsync({
        id: payment?.id,
        values: {
          job_id: job.id,
          category: 'job_payment',
          kind: 'income',
          amount_cents: amount,
          from_account_id: external.id,
          to_account_id: v.receivedBy!,
          occurred_on: v.date,
          description: `Payment ${job.ref}`,
          counterparty: job.customer?.name ?? null,
        },
      });
      // fully paid → mark the job paid
      const paidNow = job.totals.paid - (payment?.amount_cents ?? 0) + amount;
      if (!payment && job.totals.due > 0 && paidNow >= job.totals.due && job.status !== 'paid') {
        await saveJob.mutateAsync({ id: job.id, values: { ref: job.ref, customer_id: job.customer_id, description: job.description, status: 'paid' } });
      }
      toast.success('Payment saved');
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  const err = form.formState.errors;
  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!err.amount}>
          <FieldLabel htmlFor="pay-amount">Amount</FieldLabel>
          <SuffixInput id="pay-amount" suffix="€" autoFocus {...form.register('amount')} />
          {job.totals.outstanding > 0 && <FieldDescription>Still to pay: {formatMoney(job.totals.outstanding)}</FieldDescription>}
          <FieldError errors={[err.amount]} />
        </Field>
        <Field data-invalid={!!err.receivedBy}>
          <FieldLabel>Who got the money?</FieldLabel>
          <Controller control={form.control} name="receivedBy" render={({ field }) => <PayerPicker options={payers} value={field.value} onChange={field.onChange} />} />
          <FieldError errors={[err.receivedBy]} />
        </Field>
        <Field>
          <FieldLabel>Date</FieldLabel>
          <Controller control={form.control} name="date" render={({ field }) => <DateField value={field.value} onChange={field.onChange} />} />
        </Field>
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Save payment
        </Button>
        {payment && (
          <ConfirmButton
            variant="ghost"
            className="text-destructive"
            title="Delete this payment?"
            confirmLabel="Delete"
            onConfirm={async () => {
              try {
                await remove.mutateAsync({ id: payment.id, jobId: job.id });
                toast.success('Deleted');
                onDone();
              } catch (e) {
                toast.error(syncErrorMessage(e));
              }
            }}
          >
            <Trash2 /> Delete payment
          </ConfirmButton>
        )}
      </FieldGroup>
    </form>
  );
}
