import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field';
import { canBePrivate, hasWorkshopMoney, nextCarRef, ownerOptions, ownerText, resolveOwner, WORKSHOP_OWNER, type CarTab, type OwnerChoice } from '@/domain/cars';
import { parseMoney } from '@/domain/money';
import { partNumberTaken } from '@/domain/codes';
import { todayIso } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { getLastPayer, setLastPayer, useAccounts, usePayerOptions } from '@/features/money/accounts';
import { ensureContact, useContacts } from '@/features/contacts/api';
import { rememberCar, useCarFieldOptions } from '@/features/catalog/carCatalog';
import { EngineOption, GenerationOption, MakeOption } from '@/features/catalog/CarOptions';
import { useCar, useCarSuggestions, useCreateCar, useDeleteCar, useUpdateCar, type Car } from './api';
import { OwnerOption, useOwnerPeople } from './owners';

const thisYear = new Date().getFullYear();

const schema = z.object({
  owner: z.string().trim().min(1, 'Who owns it? Pick Workshop, a member, or type a name.').max(80),
  ownerPhone: z.string().trim().max(40),
  forSale: z.boolean(),
  private: z.boolean(),
  ref: z.string().trim().min(1, 'Car ID is required').max(20),
  make: z.string().trim().min(1, 'Make is required').max(40),
  model: z.string().trim().min(1, 'Model is required').max(60),
  generation: z.string().trim().max(40),
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
  // purchase (new workshop cars only)
  price: z.string(),
  paidBy: z.string().nullable(),
  purchaseDate: z.string(),
});
type Values = z.infer<typeof schema>;

export function CarFormPage() {
  const { id } = useParams();
  const existing = useCar(id);
  const people = useOwnerPeople();
  if ((id && existing.isPending) || !people.ready) {
    return (
      <>
        <PageHeader title={id ? 'Edit car' : 'New car'} back />
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
  const [params] = useSearchParams();
  const create = useCreateCar();
  const update = useUpdateCar();
  const remove = useDeleteCar();
  const payers = usePayerOptions();
  const accounts = useAccounts();
  const contacts = useContacts();
  const people = useOwnerPeople();
  const [refEdited, setRefEdited] = useState(Boolean(car));
  const lastPayer = getLastPayer();

  // a new car starts with the owner that fits the tab it was added from
  const fromTab = params.get('tab') as CarTab | null;
  const me = people.members.find((m) => m.id === people.meId);
  const startOwner = car ? ownerText(car, people) : fromTab === 'customers' ? '' : fromTab === 'ours' ? (me?.display_name ?? '') : WORKSHOP_OWNER;
  // money entries tie a workshop car to the workshop
  const ownerLocked = Boolean(car && hasWorkshopMoney(car) && (car.totals.invested > 0 || car.saleCount > 0));

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      owner: startOwner,
      ownerPhone: car?.owner_contact?.phone ?? '',
      forSale: car ? car.for_sale : fromTab !== 'ours',
      private: car ? car.is_private : true,
      ref: car?.ref ?? '',
      make: car?.make ?? '',
      model: car?.model ?? '',
      generation: car?.generation ?? '',
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

  const [make, model, generation, year, ownerTyped] = form.watch(['make', 'model', 'generation', 'year', 'owner']);
  const owner = resolveOwner(ownerTyped, people);
  const workshop = owner?.kind === 'workshop';
  const privacyOffered = canBePrivate(owner, car?.created_by, people.meId);
  const suggestions = useCarSuggestions(make);
  const catalog = useCarFieldOptions({ make, model, generation, year }, { makes: suggestions.makes, models: suggestions.models });
  const otherRefs = useMemo(() => suggestions.refs.filter((r) => r !== car?.ref), [suggestions.refs, car?.ref]);
  const suggestedRef = nextCarRef(otherRefs);
  const options = useMemo(() => ownerOptions(people), [people]);

  useEffect(() => {
    if (!refEdited) form.setValue('ref', suggestedRef);
  }, [refEdited, suggestedRef, form]);
  useEffect(() => {
    if (!form.getValues('paidBy') && lastPayer && payers.some((p) => p.accountId === lastPayer)) form.setValue('paidBy', lastPayer);
  }, [payers, lastPayer, form]);

  // fill in the phone of a known seller or owner
  const seller = form.watch('seller');
  useEffect(() => {
    const known = contacts.data?.find((c) => c.name.toLowerCase() === seller.trim().toLowerCase());
    if (known?.phone && !form.getValues('sellerPhone')) form.setValue('sellerPhone', known.phone);
  }, [seller, contacts.data, form]);
  const ownerContactId = owner?.kind === 'customer' ? owner.contactId : null;
  useEffect(() => {
    const phone = contacts.data?.find((c) => c.id === ownerContactId)?.phone;
    if (phone && !form.getValues('ownerPhone')) form.setValue('ownerPhone', phone);
  }, [ownerContactId, contacts.data, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    const chosen = resolveOwner(v.owner, people);
    if (!chosen) {
      form.setError('owner', { message: 'Who owns it?' });
      return;
    }
    const isWorkshop = chosen.kind === 'workshop';
    if (partNumberTaken(v.ref, otherRefs)) {
      form.setError('ref', { message: 'Already used by another car' });
      return;
    }
    const price = car || !isWorkshop ? 0 : parseMoney(v.price);
    if (price === null) {
      form.setError('price', { message: 'Enter what you paid (0 if it was free)' });
      return;
    }
    if (price > 0 && !v.paidBy) {
      form.setError('paidBy', { message: 'Who paid?' });
      return;
    }
    try {
      const sellerContact = isWorkshop ? await ensureContact(v.seller, v.sellerPhone) : null;
      const ownerContact = chosen.kind === 'customer' ? await ensureContact(chosen.name, v.ownerPhone) : null;
      const names = catalog.canonical(v);
      const values = {
        ...ownerValues(chosen, ownerContact?.id ?? null, v, canBePrivate(chosen, car?.created_by, people.meId)),
        ref: v.ref.toUpperCase(),
        make: names.make,
        model: names.model,
        generation: names.generation || null,
        year: v.year.trim() ? Number(v.year) : null,
        plate: v.plate.toUpperCase() || null,
        vin: v.vin.toUpperCase() || null,
        engine: names.engine || null,
        fuel: v.fuel || null,
        mileage_km: v.mileage.trim() ? Number(v.mileage.replace(/\s/g, '')) : null,
        colour: v.colour || null,
        notes: v.notes.trim() || null,
        ...(isWorkshop ? { seller_id: sellerContact?.id ?? null, purchase_date: v.purchaseDate } : {}),
      };
      void rememberCar({ ...names, year: values.year, fuel: v.fuel });
      if (car) {
        await update.mutateAsync({ id: car.id, values });
        toast.success('Saved');
        goBack(`/cars/${car.id}`);
        return;
      }
      const external = accounts.data?.find((a) => a.kind === 'external');
      const saved = await create.mutateAsync({
        car: values,
        autoRef: !refEdited,
        purchase:
          price > 0 && external
            ? {
                category: 'car_purchase',
                kind: 'expense',
                amount_cents: price,
                from_account_id: v.paidBy!,
                to_account_id: external.id,
                occurred_on: v.purchaseDate,
                counterparty: sellerContact?.name ?? null,
                description: 'Purchase',
              }
            : null,
      });
      if (v.paidBy && price > 0) setLastPayer(v.paidBy);
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
  const suggest = (
    name: 'make' | 'model' | 'generation' | 'engine' | 'colour' | 'fuel',
    label: string,
    options: string[],
    extra: Partial<ComponentProps<typeof SuggestionInput>> = {},
  ) => (
    <Field data-invalid={!!err[name]}>
      <FieldLabel htmlFor={`car-${name}`}>{label}</FieldLabel>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <SuggestionInput id={`car-${name}`} value={field.value} onChange={field.onChange} options={options} limit={5} {...extra} />
        )}
      />
      <FieldError errors={[err[name]]} />
    </Field>
  );
  const chipClass = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';

  return (
    <>
      <PageHeader title={car ? `Edit ${car.ref}` : 'New car'} back />
      <PageBody>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Owner</FieldLegend>
              <FieldGroup>
                <Field data-invalid={!!err.owner}>
                  <FieldLabel htmlFor="car-owner">Whose car is it?</FieldLabel>
                  {ownerLocked ? (
                    <>
                      <Input id="car-owner" value={WORKSHOP_OWNER} readOnly disabled />
                      <FieldDescription>It has money entries, so it stays the workshop’s.</FieldDescription>
                    </>
                  ) : (
                    <Controller
                      control={form.control}
                      name="owner"
                      render={({ field }) => (
                        <SuggestionInput
                          id="car-owner"
                          value={field.value}
                          onChange={field.onChange}
                          options={options}
                          limit={8}
                          placeholder="Workshop, a member, or a name"
                          renderOption={(o) => <OwnerOption name={o} people={people} />}
                        />
                      )}
                    />
                  )}
                  {!ownerLocked && <FieldDescription>{ownerHint(owner)}</FieldDescription>}
                  <FieldError errors={[err.owner]} />
                </Field>

                {workshop && (
                  <Controller
                    control={form.control}
                    name="forSale"
                    render={({ field }) => (
                      <Field>
                        <ToggleGroup
                          type="single"
                          variant="outline"
                          spacing={2}
                          className="flex flex-wrap"
                          value={field.value ? 'sale' : 'ours'}
                          onValueChange={(v) => v && field.onChange(v === 'sale')}
                        >
                          <ToggleGroupItem value="sale" className={chipClass}>
                            For sale
                          </ToggleGroupItem>
                          <ToggleGroupItem value="ours" className={chipClass}>
                            Our vehicle
                          </ToggleGroupItem>
                        </ToggleGroup>
                        <FieldDescription>
                          {field.value
                            ? 'Bought to fix and sell: purchase, costs, sale and the profit split.'
                            : 'A vehicle the workshop keeps and uses (van, tow truck…). Its costs add up like a flip’s.'}
                        </FieldDescription>
                      </Field>
                    )}
                  />
                )}

                {privacyOffered && (
                  <Controller
                    control={form.control}
                    name="private"
                    render={({ field }) => (
                      <Field orientation="horizontal">
                        <Switch id="car-private" checked={field.value} onCheckedChange={field.onChange} />
                        <FieldLabel htmlFor="car-private" className="flex flex-col items-start gap-0.5">
                          <span>Only I can see it</span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {field.value ? 'The others don’t see this car or anything on it.' : 'Everyone in the workshop sees it.'}
                          </span>
                        </FieldLabel>
                      </Field>
                    )}
                  />
                )}

                {owner?.kind === 'customer' && text('ownerPhone', 'Owner’s phone', { type: 'tel', inputMode: 'tel' })}
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Car</FieldLegend>
              <FieldGroup>
                {suggest('make', 'Make', catalog.makes, { placeholder: 'e.g. Škoda', limit: 8, renderOption: (o) => <MakeOption name={o} /> })}
                {suggest('model', 'Model', catalog.models, { placeholder: 'e.g. Octavia', limit: 8 })}
                <div className="grid grid-cols-2 gap-3">
                  {suggest('generation', 'Generation', catalog.generationNames, {
                    placeholder: 'e.g. II (1Z)',
                    limit: 8,
                    renderOption: (o) => <GenerationOption name={o} info={catalog.generationInfo(o)} />,
                  })}
                  {text('year', 'Year', { inputMode: 'numeric', placeholder: '2012' })}
                </div>
                {suggest('engine', 'Engine', catalog.engineNames, {
                  placeholder: '1.9 TDI 77 kW (105 HP)',
                  limit: 12,
                  renderOption: (o) => <EngineOption name={o} fuel={catalog.engineFuel(o)} />,
                  onPick: (o) => {
                    const fuel = catalog.engineFuel(o);
                    if (fuel && !form.getValues('fuel')) form.setValue('fuel', fuel);
                  },
                })}
                <div className="grid grid-cols-2 gap-3">
                  {suggest('fuel', 'Fuel', suggestions.fuels)}
                  {text('plate', 'Plate', { autoCapitalize: 'characters', className: 'uppercase' })}
                </div>
                {text('vin', 'VIN', { autoCapitalize: 'characters', className: 'font-mono uppercase' })}
                <div className="grid grid-cols-2 gap-3">
                  <Field data-invalid={!!err.mileage}>
                    <FieldLabel htmlFor="car-mileage">{workshop ? 'Mileage at purchase' : 'Mileage'}</FieldLabel>
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

            {workshop && (
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
            )}

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
              description={
                hasWorkshopMoney(car)
                  ? 'The car and all its money entries (purchase, parts, costs, sale) are deleted. This can’t be undone.'
                  : 'The car and its details are deleted. This can’t be undone.'
              }
              confirmLabel="Delete"
              onConfirm={deleteCar}
            >
              <Trash2 /> {hasWorkshopMoney(car) ? 'Delete car and its costs' : 'Delete car'}
            </ConfirmButton>
            <p className="mt-2 text-xs text-muted-foreground">
              Only for mistakes. {hasWorkshopMoney(car) ? 'Parts used from stock must be returned first.' : 'A car with jobs stays in their history.'}
            </p>
          </div>
        )}
      </PageBody>
    </>
  );
}

function ownerHint(owner: OwnerChoice | null): string {
  if (!owner) return 'Pick Workshop or a member, or type the name of someone else.';
  switch (owner.kind) {
    case 'workshop':
      return 'The workshop’s car: everyone sees it.';
    case 'member':
      return owner.me ? 'Your own car. What you spend on it is yours, not the workshop’s.' : `${owner.name}’s own car. Everyone sees it.`;
    case 'customer':
      return owner.contactId
        ? 'A customer’s car (from contacts). Everyone sees it; work on it goes through jobs.'
        : `“${owner.name}” will be added to contacts as the owner. Everyone sees it.`;
  }
}

function ownerValues(owner: OwnerChoice, contactId: string | null, v: Values, privacyOffered: boolean) {
  return {
    owner_kind: owner.kind,
    owner_member_id: owner.kind === 'member' ? owner.memberId : null,
    owner_contact_id: owner.kind === 'customer' ? contactId : null,
    for_sale: owner.kind === 'workshop' && v.forSale,
    is_private: privacyOffered && v.private,
  };
}
