import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import { Car, Loader2, Lock, RefreshCw, Trash2 } from 'lucide-react';
import { CarLogo } from '@/components/CarLogo';
import { carTitle, nextCarRef, ownerLabel, type OwnerPeople } from '@/domain/cars';
import { compact, fold } from '@/domain/search';
import { carKeys, insertCar, useCars, type Car as CarRecord } from '@/features/cars/api';
import { useOwnerPeople } from '@/features/cars/owners';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { SuffixInput } from '@/components/SuffixInput';
import { SuggestionInput } from '@/components/SuggestionInput';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { nextJobRef } from '@/domain/jobs';
import { centsToInput, parseMoney } from '@/domain/money';
import { partNumberTaken } from '@/domain/codes';
import { syncErrorMessage } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { ensureContact, useContacts } from '@/features/contacts/api';
import { rememberCar, useCarFieldOptions } from '@/features/catalog/carCatalog';
import { EngineOption, GenerationOption, MakeOption } from '@/features/catalog/CarOptions';
import { useDeleteJob, useJob, useJobSuggestions, useSaveJob, type Job } from './api';

const schema = z.object({
  ref: z.string().trim().min(1, 'Job ID is required').max(20),
  customer: z.string().trim().min(1, 'Who is the customer?').max(80),
  phone: z.string().trim().max(40),
  make: z.string().trim().max(40),
  model: z.string().trim().max(60),
  generation: z.string().trim().max(40),
  year: z.string().refine((v) => !v.trim() || (/^\d{4}$/.test(v.trim()) && +v >= 1900 && +v <= new Date().getFullYear() + 1), 'Enter a year like 2012'),
  engine: z.string().trim().max(60),
  plate: z.string().trim().max(15),
  vin: z.string().trim().max(20),
  carId: z.string().nullable(),
  mileage: z.string().refine((v) => !v.trim() || /^\d{1,7}$/.test(v.replace(/\s/g, '')), 'Whole kilometres'),
  description: z.string().trim().min(1, 'What needs doing?').max(2000),
  labor: z.string().refine((v) => !v.trim() || parseMoney(v) !== null, 'Enter a price (or leave empty)'),
  notes: z.string().max(2000),
});
type Values = z.infer<typeof schema>;

export function JobFormPage() {
  const { id } = useParams();
  const existing = useJob(id);
  const cars = useCars();
  if ((id && existing.isPending) || cars.isPending) {
    return (
      <>
        <PageHeader title="Edit job" back />
        <PageBody>
          <Skeleton className="h-96 rounded-xl" />
        </PageBody>
      </>
    );
  }
  return <JobForm job={id ? existing.data : undefined} />;
}

function JobForm({ job }: { job?: Job }) {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const save = useSaveJob();
  const remove = useDeleteJob();
  const contacts = useContacts();
  const cars = useCars();
  const people = useOwnerPeople();
  const [params] = useSearchParams();
  const [refEdited, setRefEdited] = useState(Boolean(job));
  const [carQuery, setCarQuery] = useState('');
  const queryClient = useQueryClient();

  // a new job from a car's page starts on that car, with its owner as the customer
  const startCar = job ? null : (cars.data?.find((c) => c.id === params.get('car')) ?? null);
  const startCustomer = startCar ? carCustomer(startCar, people) : null;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      ref: job?.ref ?? '',
      customer: job?.customer?.name ?? startCustomer?.name ?? '',
      phone: job?.customer?.phone ?? startCustomer?.phone ?? '',
      ...(startCar
        ? carFields(startCar)
        : {
            make: job?.car_make ?? '',
            model: job?.car_model ?? '',
            generation: job?.car_generation ?? '',
            year: job?.car_year ? String(job.car_year) : '',
            engine: job?.car_engine ?? '',
            plate: job?.car_plate ?? '',
            vin: job?.car_vin ?? '',
          }),
      carId: job?.car_id ?? startCar?.id ?? null,
      mileage: job?.mileage_km != null ? String(job.mileage_km) : '',
      description: job?.description ?? '',
      labor: job ? centsToInput(job.labor_price_cents) : '',
      notes: job?.notes ?? '',
    },
  });

  const [customer, make, model, generation, year, carId, plate] = form.watch(['customer', 'make', 'model', 'generation', 'year', 'carId', 'plate']);
  const pickedCar = cars.data?.find((c) => c.id === carId) ?? null;
  // the job's car can be someone's private car that the others don't see
  const hiddenCar = Boolean(carId && !pickedCar);
  const customerContact = contacts.data?.find((c) => c.name.toLowerCase() === customer.trim().toLowerCase());
  const theirCars = (cars.data ?? []).filter((c) => customerContact && c.owner_contact_id === customerContact.id);
  const foundCars = useMemo(() => findCars(carQuery, cars.data ?? []), [carQuery, cars.data]);

  const pickCar = (car: CarRecord) => {
    form.setValue('carId', car.id);
    for (const [name, value] of Object.entries(carFields(car))) form.setValue(name as keyof CarFields, value);
    const owner = carCustomer(car, people);
    if (owner && !form.getValues('customer').trim()) {
      form.setValue('customer', owner.name);
      if (owner.phone && !form.getValues('phone')) form.setValue('phone', owner.phone);
    }
    setCarQuery('');
  };
  const suggestions = useJobSuggestions(customer);
  const catalog = useCarFieldOptions({ make, model, generation, year }, { makes: suggestions.makes, models: suggestions.models });
  const otherRefs = useMemo(() => suggestions.refs.filter((r) => r !== job?.ref), [suggestions.refs, job?.ref]);
  const suggestedRef = nextJobRef(otherRefs);
  useEffect(() => {
    if (!refEdited) form.setValue('ref', suggestedRef);
  }, [refEdited, suggestedRef, form]);
  useEffect(() => {
    const known = contacts.data?.find((c) => c.name.toLowerCase() === customer.trim().toLowerCase());
    if (known?.phone && !form.getValues('phone')) form.setValue('phone', known.phone);
  }, [customer, contacts.data, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    if (partNumberTaken(v.ref, otherRefs)) {
      form.setError('ref', { message: 'Already used by another job' });
      return;
    }
    try {
      const contact = await ensureContact(v.customer, v.phone);
      // a picked car's details are copied onto the job (invoices and keys read them from there)
      if (v.carId && pickedCar) v = { ...v, ...carFields(pickedCar) };
      const names = catalog.canonical(v);
      const carYear = v.year.trim() ? Number(v.year) : null;
      void rememberCar({ ...names, year: carYear });
      // a car typed in by hand becomes one of the customer's cars
      let jobCarId = v.carId;
      if (!jobCarId && ((names.make && names.model) || v.plate.trim())) {
        const added = await insertCar(
          {
            ref: nextCarRef((cars.data ?? []).map((c) => c.ref)),
            owner_kind: 'customer',
            owner_contact_id: contact!.id,
            for_sale: false,
            make: names.make || 'Unknown',
            model: names.model || 'Unknown',
            generation: names.generation || null,
            year: carYear,
            engine: names.engine || null,
            plate: v.plate.toUpperCase() || null,
            vin: v.vin.toUpperCase() || null,
          },
          true,
        );
        jobCarId = added.id;
        void queryClient.invalidateQueries({ queryKey: carKeys.all });
      }
      const saved = await save.mutateAsync({
        id: job?.id,
        values: {
          ref: v.ref.toUpperCase(),
          customer_id: contact!.id,
          car_id: jobCarId,
          mileage_km: v.mileage.trim() ? Number(v.mileage.replace(/\s/g, '')) : null,
          car_make: names.make || null,
          car_model: names.model || null,
          car_generation: names.generation || null,
          car_year: carYear,
          car_engine: names.engine || null,
          car_plate: v.plate.toUpperCase() || null,
          car_vin: v.vin.toUpperCase() || null,
          description: v.description,
          labor_price_cents: v.labor.trim() ? parseMoney(v.labor)! : 0,
          notes: v.notes.trim() || null,
        },
      });
      toast.success(job ? 'Saved' : `${saved.ref} added`);
      if (job) goBack(`/jobs/${job.id}`);
      else navigate(`/jobs/${saved.id}`, { replace: true });
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  const err = form.formState.errors;
  const suggest = (
    name: 'make' | 'model' | 'generation' | 'engine',
    label: string,
    options: string[],
    extra: Partial<ComponentProps<typeof SuggestionInput>> = {},
  ) => (
    <Field>
      <FieldLabel htmlFor={`job-${name}`}>{label}</FieldLabel>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <SuggestionInput id={`job-${name}`} value={field.value} onChange={field.onChange} options={options} limit={8} {...extra} />
        )}
      />
    </Field>
  );

  return (
    <>
      <PageHeader title={job ? `Edit ${job.ref}` : 'New job'} back />
      <PageBody>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Customer</FieldLegend>
              <FieldGroup>
                <Field data-invalid={!!err.customer}>
                  <FieldLabel htmlFor="job-customer">Name</FieldLabel>
                  <Controller
                    control={form.control}
                    name="customer"
                    render={({ field }) => (
                      <SuggestionInput
                        id="job-customer"
                        value={field.value}
                        onChange={field.onChange}
                        options={(contacts.data ?? []).map((c) => c.name)}
                        autoFocus={!job}
                        newHint={(n) => `“${n}” will be added to contacts.`}
                        limit={5}
                      />
                    )}
                  />
                  <FieldError errors={[err.customer]} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="job-phone">Phone</FieldLabel>
                  <Input id="job-phone" type="tel" inputMode="tel" {...form.register('phone')} />
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Car</FieldLegend>
              <FieldGroup>
                {carId ? (
                  <div className="flex items-center gap-3 rounded-xl border p-3">
                    {pickedCar ? <CarLogo make={pickedCar.make} /> : <Lock className="size-5 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{pickedCar ? carTitle(pickedCar) : 'Someone’s private car'}</p>
                      {pickedCar && (
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {[pickedCar.ref, pickedCar.plate].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    {!hiddenCar && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          form.setValue('carId', null);
                          for (const name of Object.keys(carFields(null))) form.setValue(name as keyof CarFields, '');
                        }}
                      >
                        Change
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    {theirCars.length > 0 && (
                      <Field>
                        <FieldLabel>{customerContact?.name}’s cars</FieldLabel>
                        <div className="flex flex-wrap gap-2">
                          {theirCars.map((c) => (
                            <Button key={c.id} type="button" variant="secondary" size="sm" onClick={() => pickCar(c)}>
                              <Car /> {[c.make, c.model, c.plate].filter(Boolean).join(' ')}
                            </Button>
                          ))}
                        </div>
                      </Field>
                    )}
                    <Field>
                      <FieldLabel htmlFor="job-car-find">Find a car we know</FieldLabel>
                      <Input
                        id="job-car-find"
                        type="search"
                        value={carQuery}
                        onChange={(e) => setCarQuery(e.target.value)}
                        placeholder="Plate, make, model or owner"
                        autoComplete="off"
                      />
                      {foundCars.length > 0 && (
                        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
                          {foundCars.map((c) => (
                            <li key={c.id}>
                              <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left active:bg-muted" onClick={() => pickCar(c)}>
                                <CarLogo make={c.make} className="size-7" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">{carTitle(c)}</span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {[c.plate, ownerLabel(c, { ...people, contactName: c.owner_contact?.name })].filter(Boolean).join(' · ')}
                                  </span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {carQuery.trim() && foundCars.length === 0 && <FieldDescription>No car like that yet: fill it in below.</FieldDescription>}
                    </Field>
                    <p className="text-sm text-muted-foreground">
                      {(make.trim() && model.trim()) || plate.trim()
                        ? 'A new car: it is added to the customer’s cars when the job is saved.'
                        : 'Or a new car:'}
                    </p>
                  </>
                )}
              </FieldGroup>
            </FieldSet>

            {!carId && (
            <FieldSet>
              <FieldGroup>
                {suggest('make', 'Make', catalog.makes, { placeholder: 'e.g. Škoda', renderOption: (o) => <MakeOption name={o} /> })}
                {suggest('model', 'Model', catalog.models, { placeholder: 'e.g. Octavia' })}
                <div className="grid grid-cols-2 gap-3">
                  {suggest('generation', 'Generation', catalog.generationNames, {
                    placeholder: 'e.g. II (1Z)',
                    renderOption: (o) => <GenerationOption name={o} info={catalog.generationInfo(o)} />,
                  })}
                  <Field data-invalid={!!err.year}>
                    <FieldLabel htmlFor="job-year">Year</FieldLabel>
                    <Input id="job-year" inputMode="numeric" placeholder="2012" {...form.register('year')} />
                    <FieldError errors={[err.year]} />
                  </Field>
                </div>
                {suggest('engine', 'Engine', catalog.engineNames, {
                  placeholder: '1.9 TDI 77 kW (105 HP)',
                  limit: 12,
                  renderOption: (o) => <EngineOption name={o} fuel={catalog.engineFuel(o)} />,
                })}
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="job-plate">Plate</FieldLabel>
                    <Input id="job-plate" className="uppercase" autoCapitalize="characters" {...form.register('plate')} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="job-vin">VIN (optional)</FieldLabel>
                    <Input id="job-vin" className="font-mono uppercase" autoCapitalize="characters" {...form.register('vin')} />
                  </Field>
                </div>
              </FieldGroup>
            </FieldSet>
            )}

            <Field data-invalid={!!err.mileage}>
              <FieldLabel htmlFor="job-mileage">Mileage</FieldLabel>
              <SuffixInput id="job-mileage" suffix="km" inputMode="numeric" {...form.register('mileage')} />
              <FieldDescription>What the car showed when it came in.</FieldDescription>
              <FieldError errors={[err.mileage]} />
            </Field>

            <Field data-invalid={!!err.description}>
              <FieldLabel htmlFor="job-desc">Work</FieldLabel>
              <Textarea id="job-desc" rows={3} placeholder="e.g. Oil and filter change, front brake pads" {...form.register('description')} />
              <FieldError errors={[err.description]} />
            </Field>
            <Field data-invalid={!!err.labor}>
              <FieldLabel htmlFor="job-labor">Labor price</FieldLabel>
              <SuffixInput id="job-labor" suffix="€" {...form.register('labor')} />
              <FieldDescription>A fixed price for the work. Parts are added on the job page.</FieldDescription>
              <FieldError errors={[err.labor]} />
            </Field>
            <Field data-invalid={!!err.ref}>
              <FieldLabel htmlFor="job-ref">Job ID</FieldLabel>
              <div className="flex gap-2">
                <Input id="job-ref" className="font-mono uppercase" autoCapitalize="characters" {...form.register('ref', { onChange: () => setRefEdited(true) })} />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Generate job ID"
                  onClick={() => {
                    setRefEdited(false);
                    form.setValue('ref', suggestedRef, { shouldValidate: true });
                  }}
                >
                  <RefreshCw />
                </Button>
              </div>
              <FieldError errors={[err.ref]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="job-notes">Notes (not on the invoice)</FieldLabel>
              <Textarea id="job-notes" rows={2} {...form.register('notes')} />
            </Field>
            <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              {job ? 'Save' : 'Add job'}
            </Button>
          </FieldGroup>
        </form>
        {job && (
          <div className="mt-4 border-t pt-4">
            <ConfirmButton
              variant="destructive"
              className="w-full"
              title={`Delete ${job.ref}?`}
              description="Only for mistakes: the job and its payments are deleted. Remove its lines first."
              confirmLabel="Delete"
              onConfirm={async () => {
                try {
                  await remove.mutateAsync(job.id);
                  toast.success('Deleted');
                  goBack('/jobs', 2);
                } catch (e) {
                  toast.error(syncErrorMessage(e));
                }
              }}
            >
              <Trash2 /> Delete job
            </ConfirmButton>
          </div>
        )}
      </PageBody>
    </>
  );
}

type CarFields = Pick<Values, 'make' | 'model' | 'generation' | 'year' | 'engine' | 'plate' | 'vin'>;

/** The car's details as the job form holds them (all empty for null). */
function carFields(car: CarRecord | null): CarFields {
  return {
    make: car?.make ?? '',
    model: car?.model ?? '',
    generation: car?.generation ?? '',
    year: car?.year ? String(car.year) : '',
    engine: car?.engine ?? '',
    plate: car?.plate ?? '',
    vin: car?.vin ?? '',
  };
}

/** Who a job on this car is for, by default: the customer who owns it, or the member. */
function carCustomer(car: CarRecord, people: OwnerPeople): { name: string; phone: string | null } | null {
  if (car.owner_kind === 'customer' && car.owner_contact) return { name: car.owner_contact.name, phone: car.owner_contact.phone };
  const member = car.owner_kind === 'member' ? people.members.find((m) => m.id === car.owner_member_id) : null;
  return member ? { name: member.display_name, phone: null } : null;
}

/** Cars matching what was typed: plate (spaces and dashes don't matter), ID, make, model or owner. */
function findCars(query: string, cars: CarRecord[], limit = 5): CarRecord[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const code = compact(query);
  return cars
    .filter((c) => {
      if (code.length >= 3 && (compact(c.plate ?? '').includes(code) || compact(c.ref).includes(code))) return true;
      const text = fold([c.make, c.model, c.generation, c.year, c.plate, c.ref, c.owner_contact?.name].filter(Boolean).join(' '));
      return words.every((w) => text.includes(w));
    })
    .slice(0, limit);
}
