import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { SuffixInput } from '@/components/SuffixInput';
import { SuggestionInput } from '@/components/SuggestionInput';
import { PayerPicker } from '@/components/PayerPicker';
import { DateField } from '@/components/DateField';
import { Button } from '@/components/ui/button';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field';
import { nextCarRef } from '@/domain/cars';
import { parseMoney } from '@/domain/money';
import { partNumberTaken } from '@/domain/codes';
import { todayIso } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { getLastPayer, setLastPayer, useAccounts, usePayerOptions } from '@/features/money/accounts';
import { ensureContact, useContacts } from '@/features/contacts/api';
import { useCar, useCarSuggestions, useCreateCar, useDeleteCar, useUpdateCar, type Car } from './api';

const thisYear = new Date().getFullYear();

const schema = z.object({
  ref: z.string().trim().min(1, 'Car ID is required').max(20),
  make: z.string().trim().min(1, 'Make is required').max(40),
  model: z.string().trim().min(1, 'Model is required').max(60),
  year: z.string().refine((v) => !v.trim() || (/^\d{4}$/.test(v.trim()) && +v >= 1900 && +v <= thisYear + 1), 'Enter a year like 2012'),
  plate: z.string().trim().max(15),
  vin: z.string().trim().max(20),
  engine: z.string().trim().max(60),
  fuel: z.string().trim().max(30),
  mileage: z.string().refine((v) => !v.trim() || /^\d{1,7}$/.test(v.replace(/\s/g, '')), 'Whole kilometres'),
  colour: z.string().trim().max(30),
  notes: z.string().max(2000),
  seller: z.string().trim().max(80),
  sellerPhone: z.string().trim().max(40),
  // purchase (new cars only)
  price: z.string(),
  paidBy: z.string().nullable(),
  purchaseDate: z.string(),
});
type Values = z.infer<typeof schema>;

export function CarFormPage() {
  const { id } = useParams();
  const existing = useCar(id);
  if (id && existing.isPending) {
    return (
      <>
        <PageHeader title="Edit car" back />
        <PageBody>
          <Skeleton className="h-96 rounded-xl" />
        </PageBody>
      </>
    );
  }
  return <CarForm car={id ? existing.data : undefined} />;
}

function CarForm({ car }: { car?: Car }) {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const create = useCreateCar();
  const update = useUpdateCar();
  const remove = useDeleteCar();
  const payers = usePayerOptions();
  const accounts = useAccounts();
  const contacts = useContacts();
  const [refEdited, setRefEdited] = useState(Boolean(car));
  const lastPayer = getLastPayer();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      ref: car?.ref ?? '',
      make: car?.make ?? '',
      model: car?.model ?? '',
      year: car?.year ? String(car.year) : '',
      plate: car?.plate ?? '',
      vin: car?.vin ?? '',
      engine: car?.engine ?? '',
      fuel: car?.fuel ?? '',
      mileage: car?.mileage_km != null ? String(car.mileage_km) : '',
      colour: car?.colour ?? '',
      notes: car?.notes ?? '',
      seller: car?.seller?.name ?? '',
      sellerPhone: car?.seller?.phone ?? '',
      price: '',
      paidBy: payers.some((p) => p.accountId === lastPayer) ? lastPayer : null,
      purchaseDate: car?.purchase_date ?? todayIso(),
    },
  });

  const make = form.watch('make');
  const suggestions = useCarSuggestions(make);
  const otherRefs = useMemo(() => suggestions.refs.filter((r) => r !== car?.ref), [suggestions.refs, car?.ref]);
  const suggestedRef = nextCarRef(otherRefs);

  useEffect(() => {
    if (!refEdited) form.setValue('ref', suggestedRef);
  }, [refEdited, suggestedRef, form]);
  useEffect(() => {
    if (!form.getValues('paidBy') && lastPayer && payers.some((p) => p.accountId === lastPayer)) form.setValue('paidBy', lastPayer);
  }, [payers, lastPayer, form]);

  // fill in the phone of a known seller
  const seller = form.watch('seller');
  useEffect(() => {
    const known = contacts.data?.find((c) => c.name.toLowerCase() === seller.trim().toLowerCase());
    if (known?.phone && !form.getValues('sellerPhone')) form.setValue('sellerPhone', known.phone);
  }, [seller, contacts.data, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    if (partNumberTaken(v.ref, otherRefs)) {
      form.setError('ref', { message: 'Already used by another car' });
      return;
    }
    const price = car ? 0 : parseMoney(v.price);
    if (!car && price === null) {
      form.setError('price', { message: 'Enter what you paid (0 if it was free)' });
      return;
    }
    if (!car && price! > 0 && !v.paidBy) {
      form.setError('paidBy', { message: 'Who paid?' });
      return;
    }
    try {
      const sellerContact = await ensureContact(v.seller, v.sellerPhone);
      const values = {
        ref: v.ref.toUpperCase(),
        make: v.make,
        model: v.model,
        year: v.year.trim() ? Number(v.year) : null,
        plate: v.plate.toUpperCase() || null,
        vin: v.vin.toUpperCase() || null,
        engine: v.engine || null,
        fuel: v.fuel || null,
        mileage_km: v.mileage.trim() ? Number(v.mileage.replace(/\s/g, '')) : null,
        colour: v.colour || null,
        notes: v.notes.trim() || null,
        seller_id: sellerContact?.id ?? null,
        purchase_date: v.purchaseDate,
      };
      if (car) {
        await update.mutateAsync({ id: car.id, values });
        toast.success('Saved');
        goBack(`/cars/${car.id}`);
        return;
      }
      const external = accounts.data?.find((a) => a.kind === 'external');
      const saved = await create.mutateAsync({
        car: values,
        purchase:
          price! > 0 && external
            ? {
                category: 'car_purchase',
                kind: 'expense',
                amount_cents: price!,
                from_account_id: v.paidBy!,
                to_account_id: external.id,
                occurred_on: v.purchaseDate,
                counterparty: sellerContact?.name ?? null,
                description: 'Purchase',
              }
            : null,
      });
      if (v.paidBy) setLastPayer(v.paidBy);
      toast.success(`${saved.ref} added`);
      navigate(`/cars/${saved.id}`, { replace: true });
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  const deleteCar = async () => {
    if (!car) return;
    try {
      await remove.mutateAsync(car.id);
      toast.success(`${car.ref} deleted`);
      goBack('/cars', 2);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  const err = form.formState.errors;
  const text = (name: keyof Values, label: string, props: Record<string, unknown> = {}) => (
    <Field data-invalid={!!err[name]}>
      <FieldLabel htmlFor={`car-${name}`}>{label}</FieldLabel>
      <Input id={`car-${name}`} {...props} {...form.register(name)} />
      <FieldError errors={[err[name]]} />
    </Field>
  );
  const suggest = (name: 'make' | 'model' | 'colour' | 'fuel', label: string, options: string[], placeholder?: string) => (
    <Field data-invalid={!!err[name]}>
      <FieldLabel htmlFor={`car-${name}`}>{label}</FieldLabel>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <SuggestionInput id={`car-${name}`} value={field.value} onChange={field.onChange} options={options} placeholder={placeholder} limit={5} />
        )}
      />
      <FieldError errors={[err[name]]} />
    </Field>
  );

  return (
    <>
      <PageHeader title={car ? `Edit ${car.ref}` : 'New car'} back />
      <PageBody>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Car</FieldLegend>
              <FieldGroup>
                {suggest('make', 'Make', suggestions.makes, 'e.g. Škoda')}
                {suggest('model', 'Model', suggestions.models, 'e.g. Octavia')}
                <div className="grid grid-cols-2 gap-3">
                  {text('year', 'Year', { inputMode: 'numeric', placeholder: '2012' })}
                  {text('plate', 'Plate', { autoCapitalize: 'characters', className: 'uppercase' })}
                </div>
                {text('vin', 'VIN', { autoCapitalize: 'characters', className: 'font-mono uppercase' })}
                <div className="grid grid-cols-2 gap-3">
                  {text('engine', 'Engine', { placeholder: '1.9 TDI 77 kW' })}
                  {suggest('fuel', 'Fuel', suggestions.fuels)}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field data-invalid={!!err.mileage}>
                    <FieldLabel htmlFor="car-mileage">Mileage at purchase</FieldLabel>
                    <SuffixInput id="car-mileage" suffix="km" inputMode="numeric" {...form.register('mileage')} />
                    <FieldError errors={[err.mileage]} />
                  </Field>
                  {suggest('colour', 'Colour', suggestions.colours)}
                </div>
                <Field data-invalid={!!err.ref}>
                  <FieldLabel htmlFor="car-ref">Car ID</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="car-ref"
                      className="font-mono uppercase"
                      autoCapitalize="characters"
                      {...form.register('ref', { onChange: () => setRefEdited(true) })}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Generate car ID"
                      onClick={() => {
                        setRefEdited(false);
                        form.setValue('ref', suggestedRef, { shouldValidate: true });
                      }}
                    >
                      <RefreshCw />
                    </Button>
                  </div>
                  <FieldDescription>Our own short ID for the car. Filled in automatically; you can change it.</FieldDescription>
                  <FieldError errors={[err.ref]} />
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Purchase</FieldLegend>
              <FieldGroup>
                {!car && (
                  <>
                    <Field data-invalid={!!err.price}>
                      <FieldLabel htmlFor="car-price">Price paid</FieldLabel>
                      <SuffixInput id="car-price" suffix="€" {...form.register('price')} />
                      <FieldError errors={[err.price]} />
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
                  </>
                )}
                <Field>
                  <FieldLabel htmlFor="car-date">Bought on</FieldLabel>
                  <Controller
                    control={form.control}
                    name="purchaseDate"
                    render={({ field }) => <DateField id="car-date" value={field.value} onChange={field.onChange} />}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="car-seller">Bought from</FieldLabel>
                  <Controller
                    control={form.control}
                    name="seller"
                    render={({ field }) => (
                      <SuggestionInput
                        id="car-seller"
                        value={field.value}
                        onChange={field.onChange}
                        options={(contacts.data ?? []).map((c) => c.name)}
                        placeholder="Name of the seller or dealer"
                        newHint={(n) => `“${n}” will be added to contacts.`}
                        limit={5}
                      />
                    )}
                  />
                </Field>
                {text('sellerPhone', 'Seller’s phone', { type: 'tel', inputMode: 'tel' })}
                {car && <FieldDescription>Edit the purchase price in the car’s cost list.</FieldDescription>}
              </FieldGroup>
            </FieldSet>

            <Field>
              <FieldLabel htmlFor="car-notes">Notes</FieldLabel>
              <Textarea id="car-notes" {...form.register('notes')} />
            </Field>

            <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              {car ? 'Save' : 'Add car'}
            </Button>
          </FieldGroup>
        </form>

        {car && (
          <div className="mt-4 border-t pt-4">
            <ConfirmButton
              variant="destructive"
              className="w-full"
              title={`Delete ${car.ref}?`}
              description="The car and all its money entries (purchase, parts, costs, sale) are deleted. This can’t be undone."
              confirmLabel="Delete"
              onConfirm={deleteCar}
            >
              <Trash2 /> Delete car and its costs
            </ConfirmButton>
            <p className="mt-2 text-xs text-muted-foreground">
              Only for mistakes. Parts used from stock must be returned first.
            </p>
          </div>
        )}
      </PageBody>
    </>
  );
}
