import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Undo2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { SuffixInput } from '@/components/SuffixInput';
import { SuggestionInput } from '@/components/SuggestionInput';
import { PayerPicker } from '@/components/PayerPicker';
import { DateField } from '@/components/DateField';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { centsToInput, parseMoney } from '@/domain/money';
import { todayIso } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { getLastPayer, useAccounts, usePayerOptions } from '@/features/money/accounts';
import { ensureContact, useContacts } from '@/features/contacts/api';
import { useCarMoney, useDeleteCarTransaction, useSaveCarTransaction, useUpdateCar, type Car } from './api';

const schema = z.object({
  price: z.string().refine((v) => (parseMoney(v) ?? 0) > 0, 'Enter the sale price'),
  receivedBy: z.string().nullable().refine((v) => Boolean(v), 'Who got the money?'),
  date: z.string(),
  buyer: z.string().trim().max(80),
  buyerPhone: z.string().trim().max(40),
  mileage: z.string().refine((v) => !v.trim() || /^\d{1,7}$/.test(v.replace(/\s/g, '')), 'Whole kilometres'),
});
type Values = z.infer<typeof schema>;

/** Records (or edits) the sale: the money goes to the wallet or a partner, the car becomes Sold. */
export function SaleDrawer({ car, open, onOpenChange }: { car: Car; open: boolean; onOpenChange: (o: boolean) => void }) {
  const scrapped = car.status === 'scrapped';
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={scrapped ? 'Scrap money' : car.saleCount ? 'Edit sale' : 'Sell the car'}>
      {open && <SaleForm car={car} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function SaleForm({ car, onDone }: { car: Car; onDone: () => void }) {
  const payers = usePayerOptions();
  const accounts = useAccounts();
  const contacts = useContacts();
  const money = useCarMoney(car.id);
  const saveTxn = useSaveCarTransaction();
  const deleteTxn = useDeleteCarTransaction();
  const updateCar = useUpdateCar();
  const sales = (money.data ?? []).filter((r) => r.category === 'car_sale');
  const sale = sales[0];
  const scrapped = car.status === 'scrapped';
  const lastPayer = getLastPayer();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      price: sale ? centsToInput(sale.amount_cents) : car.asking_price_cents ? centsToInput(car.asking_price_cents) : '',
      receivedBy: sale?.to_account_id ?? null,
      date: car.sale_date ?? sale?.occurred_on ?? todayIso(),
      buyer: car.buyer?.name ?? '',
      buyerPhone: car.buyer?.phone ?? '',
      mileage: car.sale_mileage_km != null ? String(car.sale_mileage_km) : '',
    },
  });
  useEffect(() => {
    if (sale && !form.getValues('receivedBy')) form.setValue('receivedBy', sale.to_account_id);
  }, [sale, form]);
  useEffect(() => {
    if (!sale && !form.getValues('receivedBy') && lastPayer && payers.some((p) => p.accountId === lastPayer)) {
      form.setValue('receivedBy', lastPayer);
    }
  }, [sale, payers, lastPayer, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    const external = accounts.data?.find((a) => a.kind === 'external');
    if (!external) return;
    try {
      const buyer = await ensureContact(v.buyer, v.buyerPhone);
      await saveTxn.mutateAsync({
        id: sale?.id,
        values: {
          car_id: car.id,
          category: 'car_sale',
          kind: 'income',
          amount_cents: parseMoney(v.price)!,
          from_account_id: external.id,
          to_account_id: v.receivedBy!,
          occurred_on: v.date,
          description: scrapped ? 'Scrap' : 'Sale',
          counterparty: buyer?.name ?? null,
        },
      });
      await updateCar.mutateAsync({
        id: car.id,
        values: {
          status: scrapped ? 'scrapped' : 'sold',
          sale_date: v.date,
          buyer_id: buyer?.id ?? null,
          sale_mileage_km: v.mileage.trim() ? Number(v.mileage.replace(/\s/g, '')) : null,
        },
      });
      toast.success(scrapped ? 'Scrap money saved' : `${car.ref} sold`);
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  const undoSale = async () => {
    try {
      for (const s of sales) await deleteTxn.mutateAsync(s);
      await updateCar.mutateAsync({
        id: car.id,
        values: { status: scrapped ? 'scrapped' : 'listed', sale_date: null, buyer_id: null, sale_mileage_km: null },
      });
      toast.success('Sale removed');
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  const err = form.formState.errors;
  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!err.price}>
          <FieldLabel htmlFor="sale-price">{scrapped ? 'Money received' : 'Sale price'}</FieldLabel>
          <SuffixInput id="sale-price" suffix="€" autoFocus {...form.register('price')} />
          <FieldError errors={[err.price]} />
        </Field>
        <Field data-invalid={!!err.receivedBy}>
          <FieldLabel>Who got the money?</FieldLabel>
          <Controller
            control={form.control}
            name="receivedBy"
            render={({ field }) => <PayerPicker options={payers} value={field.value} onChange={field.onChange} />}
          />
          <FieldError errors={[err.receivedBy]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="sale-date">Date</FieldLabel>
          <Controller
            control={form.control}
            name="date"
            render={({ field }) => <DateField id="sale-date" value={field.value} onChange={field.onChange} />}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="sale-buyer">{scrapped ? 'Scrapyard' : 'Buyer'}</FieldLabel>
          <Controller
            control={form.control}
            name="buyer"
            render={({ field }) => (
              <SuggestionInput
                id="sale-buyer"
                value={field.value}
                onChange={field.onChange}
                options={(contacts.data ?? []).map((c) => c.name)}
                newHint={(n) => `“${n}” will be added to contacts.`}
                limit={5}
              />
            )}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="sale-phone">Buyer’s phone</FieldLabel>
          <Input id="sale-phone" type="tel" inputMode="tel" {...form.register('buyerPhone')} />
        </Field>
        {!scrapped && (
          <Field data-invalid={!!err.mileage}>
            <FieldLabel htmlFor="sale-km">Mileage at sale</FieldLabel>
            <SuffixInput id="sale-km" suffix="km" inputMode="numeric" {...form.register('mileage')} />
            <FieldError errors={[err.mileage]} />
          </Field>
        )}
        {sales.length > 1 && (
          <FieldDescription>This car has {sales.length} sale payments; this form edits the first one.</FieldDescription>
        )}
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          {scrapped ? 'Save' : sale ? 'Save sale' : 'Mark as sold'}
        </Button>
        {sale && (
          <ConfirmButton
            variant="ghost"
            title="Remove the sale?"
            description="For a sale that fell through: the payment is deleted and the car goes back to Listed."
            confirmLabel="Remove sale"
            onConfirm={undoSale}
          >
            <Undo2 /> Sale fell through
          </ConfirmButton>
        )}
      </FieldGroup>
    </form>
  );
}
