import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Car, Loader2, RefreshCw, Trash2 } from 'lucide-react';
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
  description: z.string().trim().min(1, 'What needs doing?').max(2000),
  labor: z.string().refine((v) => !v.trim() || parseMoney(v) !== null, 'Enter a price (or leave empty)'),
  notes: z.string().max(2000),
});
type Values = z.infer<typeof schema>;

export function JobFormPage() {
  const { id } = useParams();
  const existing = useJob(id);
  if (id && existing.isPending) {
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
  const [refEdited, setRefEdited] = useState(Boolean(job));

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      ref: job?.ref ?? '',
      customer: job?.customer?.name ?? '',
      phone: job?.customer?.phone ?? '',
      make: job?.car_make ?? '',
      model: job?.car_model ?? '',
      generation: job?.car_generation ?? '',
      year: job?.car_year ? String(job.car_year) : '',
      engine: job?.car_engine ?? '',
      plate: job?.car_plate ?? '',
      vin: job?.car_vin ?? '',
      description: job?.description ?? '',
      labor: job ? centsToInput(job.labor_price_cents) : '',
      notes: job?.notes ?? '',
    },
  });

  const [customer, make, model, generation, year] = form.watch(['customer', 'make', 'model', 'generation', 'year']);
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
      const names = catalog.canonical(v);
      void rememberCar({ ...names, year: v.year.trim() ? Number(v.year) : null });
      const saved = await save.mutateAsync({
        id: job?.id,
        values: {
          ref: v.ref.toUpperCase(),
          customer_id: contact!.id,
          car_make: names.make || null,
          car_model: names.model || null,
          car_generation: names.generation || null,
          car_year: v.year.trim() ? Number(v.year) : null,
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
              <FieldLegend>Their car</FieldLegend>
              <FieldGroup>
                {suggestions.customerCars.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {suggestions.customerCars.map((c) => (
                      <Button
                        key={`${c.plate}${c.make}${c.model}`}
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          form.setValue('make', c.make);
                          form.setValue('model', c.model);
                          form.setValue('generation', c.generation);
                          form.setValue('year', c.year);
                          form.setValue('engine', c.engine);
                          form.setValue('plate', c.plate);
                          form.setValue('vin', c.vin);
                        }}
                      >
                        <Car /> {[c.make, c.model, c.plate].filter(Boolean).join(' ')}
                      </Button>
                    ))}
                  </div>
                )}
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
