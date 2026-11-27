import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { SuffixInput } from '@/components/SuffixInput';
import { SuggestionInput } from '@/components/SuggestionInput';
import { DateField } from '@/components/DateField';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { carTitle } from '@/domain/cars';
import { badNumbers, cleanDetails, dotAgeYears, partKind, PART_KINDS, PART_STATES, type DetailField } from '@/domain/carParts';
import { centsToInput, parseMoney } from '@/domain/money';
import { formatDate, todayIso } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { ensureBrand, useBrands } from '@/features/catalog/api';
import { newSupplierHint, useSuppliers } from '@/features/inventory/api';
import { AttachmentStrip } from '@/features/files/AttachmentStrip';
import { useCar, type Car } from './api';
import { serviceTitle, useCarParts, useCarServices, useDeletePart, useSavePart, type CarPart } from './services';

const chipClass = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';

const schema = z.object({
  kind: z.string(),
  name: z.string().trim().min(1, 'What is it?').max(120),
  brand: z.string().trim().max(60),
  partNumber: z.string().trim().max(60),
  price: z.string().refine((v) => !v.trim() || parseMoney(v) !== null, 'Enter a price (or leave it empty)'),
  boughtOn: z.string(),
  boughtFrom: z.string().trim().max(120),
  fittedKm: z.string().refine((v) => !v.trim() || /^\d{1,7}$/.test(v.replace(/\s/g, '')), 'Whole kilometres'),
  state: z.enum(['fitted', 'stored', 'gone']),
  serviceId: z.string(),
  notes: z.string().max(2000),
});
type Values = z.infer<typeof schema>;

/** A part bought for one of our own cars: what it is, its details (by kind), where and when it was bought, and where it is now. */
export function PartFormPage() {
  const { id, partId } = useParams();
  const car = useCar(id);
  const parts = useCarParts(id);
  const brands = useBrands();
  const part = parts.data?.find((p) => p.id === partId);
  if (car.isPending || (partId && parts.isPending) || brands.isPending) {
    return (
      <>
        <PageHeader title={partId ? 'Part' : 'New part'} back />
        <PageBody>
          <Skeleton className="h-96 rounded-xl" />
        </PageBody>
      </>
    );
  }
  if (!car.data || (partId && !part)) {
    return (
      <>
        <PageHeader title="Part" back={`/cars/${id}`} />
        <PageBody>
          <p className="text-muted-foreground">This part doesn’t exist (anymore).</p>
        </PageBody>
      </>
    );
  }
  return <PartForm car={car.data} part={part} />;
}

function PartForm({ car, part }: { car: Car; part?: CarPart }) {
  const navigate = useNavigate();
  const goBack = useGoBack();
  const [params] = useSearchParams();
  const brands = useBrands().data ?? [];
  const suppliers = useSuppliers();
  const services = useCarServices(car.id);
  const save = useSavePart();
  const remove = useDeletePart();
  const startDetails = (part?.details ?? {}) as Record<string, string>;
  const [details, setDetails] = useState<Record<string, string>>(startDetails);
  const [detailErrors, setDetailErrors] = useState<string[]>([]);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: part?.kind ?? 'tyres',
      name: part?.name ?? 'Tyres',
      brand: part?.brand?.name ?? '',
      partNumber: part?.part_number ?? '',
      price: part?.price_cents != null ? centsToInput(part.price_cents) : '',
      boughtOn: part?.bought_on ?? todayIso(),
      boughtFrom: part?.bought_from ?? '',
      fittedKm: part?.fitted_km != null ? String(part.fitted_km) : '',
      state: (part?.state as Values['state']) ?? 'fitted',
      serviceId: part ? (part.service_id ?? '') : (params.get('service') ?? ''),
      notes: part?.notes ?? '',
    },
  });
  const kind = form.watch('kind');
  const info = partKind(kind);

  // picking a kind names the part after it, unless a name was typed
  const pickKind = (next: string) => {
    const name = form.getValues('name').trim();
    if (!name || PART_KINDS.some((k) => k.name === name)) form.setValue('name', partKind(next).name);
    form.setValue('kind', next);
    setDetailErrors([]);
  };

  const onSubmit = form.handleSubmit(async (v) => {
    const bad = badNumbers(v.kind, details);
    if (bad.length) {
      setDetailErrors(bad);
      return;
    }
    try {
      const brand = v.brand ? await ensureBrand(v.brand) : null;
      const saved = await save.mutateAsync({
        id: part?.id,
        values: {
          car_id: car.id,
          kind: v.kind,
          name: v.name,
          brand_id: brand?.id ?? null,
          part_number: v.partNumber || null,
          price_cents: v.price.trim() ? parseMoney(v.price) : null,
          bought_on: v.boughtOn || null,
          bought_from: v.boughtFrom || null,
          fitted_km: v.fittedKm.trim() ? Number(v.fittedKm.replace(/\s/g, '')) : null,
          state: v.state,
          service_id: v.serviceId || null,
          details: cleanDetails(v.kind, details),
          notes: v.notes.trim() || null,
        },
      });
      toast.success(part ? 'Saved' : `${saved.name} added`);
      if (part) goBack(`/cars/${car.id}`);
      // a new part stays open, so its receipt can be added
      else navigate(`/cars/${car.id}/parts/${saved.id}`, { replace: true });
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  const err = form.formState.errors;
  const chips = (name: 'state' | 'serviceId', options: { value: string; label: string }[], allowNone = false) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={2}
          className="flex flex-wrap"
          value={field.value}
          onValueChange={(v) => (v || allowNone) && field.onChange(v)}
        >
          {options.map((o) => (
            <ToggleGroupItem key={o.value} value={o.value} className={`h-auto py-1.5 ${chipClass}`}>
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
    />
  );

  return (
    <>
      <PageHeader title={part ? part.name : 'New part'} back />
      <PageBody>
        <p className="text-sm text-muted-foreground">
          {carTitle(car)} · {car.ref}
        </p>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel>What is it?</FieldLabel>
              <ToggleGroup type="single" variant="outline" spacing={2} className="flex flex-wrap" value={kind} onValueChange={(v) => v && pickKind(v)}>
                {PART_KINDS.map((k) => (
                  <ToggleGroupItem key={k.value} value={k.value} className={chipClass}>
                    {k.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <Field data-invalid={!!err.name}>
              <FieldLabel htmlFor="part-name">Name</FieldLabel>
              <Input id="part-name" placeholder={kind === 'tyres' ? 'e.g. Winter tyres' : 'e.g. Front brake pads'} {...form.register('name')} />
              <FieldError errors={[err.name]} />
            </Field>

            {info.fields.length > 0 && (
              <FieldSet>
                <FieldLegend>{info.label}</FieldLegend>
                <div className="grid grid-cols-2 gap-3">
                  {info.fields.map((f) => (
                    <DetailInput
                      key={`${kind}-${f.key}`}
                      field={f}
                      value={details[f.key] ?? ''}
                      invalid={detailErrors.includes(f.key)}
                      onChange={(value) => {
                        setDetails((d) => ({ ...d, [f.key]: value }));
                        setDetailErrors((e) => e.filter((k) => k !== f.key));
                      }}
                    />
                  ))}
                </div>
                {kind === 'tyres' && details.dot && (dotAgeYears(details.dot, todayIso()) ?? 0) >= 6 && (
                  <p className="text-sm text-warning">These tyres are {dotAgeYears(details.dot, todayIso())} years old: rubber hardens with age, check them.</p>
                )}
              </FieldSet>
            )}

            <FieldSet>
              <FieldLegend>Bought</FieldLegend>
              <FieldGroup>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="part-brand">Brand</FieldLabel>
                    <Controller
                      control={form.control}
                      name="brand"
                      render={({ field }) => (
                        <SuggestionInput
                          id="part-brand"
                          value={field.value}
                          onChange={field.onChange}
                          options={brands.map((b) => b.name)}
                          newHint={(v) => `“${v}” will be added to the brands list.`}
                          limit={5}
                        />
                      )}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="part-number">Part number</FieldLabel>
                    <Input id="part-number" className="font-mono" {...form.register('partNumber')} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field data-invalid={!!err.price}>
                    <FieldLabel htmlFor="part-price">Price</FieldLabel>
                    <SuffixInput id="part-price" suffix="€" {...form.register('price')} />
                    <FieldError errors={[err.price]} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="part-bought">Bought on</FieldLabel>
                    <Controller
                      control={form.control}
                      name="boughtOn"
                      render={({ field }) => (
                        <DateField id="part-bought" value={field.value} onChange={field.onChange} placeholder="Not set" onClear={() => field.onChange('')} />
                      )}
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="part-from">Bought from</FieldLabel>
                  <Controller
                    control={form.control}
                    name="boughtFrom"
                    render={({ field }) => (
                      <SuggestionInput id="part-from" value={field.value} onChange={field.onChange} options={suppliers.data ?? []} newHint={newSupplierHint} limit={5} />
                    )}
                  />
                </Field>
                <FieldDescription>Paid by the car’s owner: it doesn’t touch the workshop’s money.</FieldDescription>
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Where it is</FieldLegend>
              <FieldGroup>
                {chips('state', PART_STATES)}
                <Field data-invalid={!!err.fittedKm}>
                  <FieldLabel htmlFor="part-km">Fitted at</FieldLabel>
                  <SuffixInput id="part-km" suffix="km" inputMode="numeric" {...form.register('fittedKm')} />
                  <FieldError errors={[err.fittedKm]} />
                </Field>
                {(services.data ?? []).length > 0 && (
                  <Field>
                    <FieldLabel>Part of a service</FieldLabel>
                    {chips(
                      'serviceId',
                      (services.data ?? []).slice(0, 6).map((s) => ({ value: s.id, label: `${serviceTitle(s)} · ${formatDate(s.performed_on)}` })),
                      true,
                    )}
                    <FieldDescription>Its price then adds to that service.</FieldDescription>
                  </Field>
                )}
              </FieldGroup>
            </FieldSet>

            <Field>
              <FieldLabel htmlFor="part-notes">Notes</FieldLabel>
              <Textarea id="part-notes" rows={2} {...form.register('notes')} />
            </Field>

            {part && (
              <>
                <AttachmentStrip entityType="car_part" entityId={part.id} kind="receipt" title="Receipt" allowPdf label={part.name} />
                <AttachmentStrip entityType="car_part" entityId={part.id} kind="photo" title="Photos" label={part.name} />
              </>
            )}

            <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              {part ? 'Save' : 'Add part'}
            </Button>
            {!part && <FieldDescription>After saving you can add the receipt and photos.</FieldDescription>}
          </FieldGroup>
        </form>

        {part && (
          <div className="mt-4 border-t pt-4">
            <ConfirmButton
              variant="ghost"
              className="w-full text-destructive"
              title={`Delete ${part.name}?`}
              description="Only for mistakes. A part you no longer have is better marked “Gone”: it stays in the car’s history."
              confirmLabel="Delete"
              onConfirm={async () => {
                try {
                  await remove.mutateAsync(part);
                  toast.success('Deleted');
                  goBack(`/cars/${car.id}`, 2);
                } catch (e) {
                  toast.error(syncErrorMessage(e));
                }
              }}
            >
              <Trash2 /> Delete part
            </ConfirmButton>
          </div>
        )}
      </PageBody>
    </>
  );
}

function DetailInput({ field, value, invalid, onChange }: { field: DetailField; value: string; invalid: boolean; onChange: (v: string) => void }) {
  const id = `part-${field.key}`;
  const wide = field.type === 'choice' || field.hint;
  return (
    <Field data-invalid={invalid} className={wide ? 'col-span-2' : undefined}>
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      {field.type === 'choice' ? (
        <ToggleGroup type="single" variant="outline" spacing={2} className="flex flex-wrap" value={value} onValueChange={(v) => onChange(v)}>
          {field.options!.map((o) => (
            <ToggleGroupItem key={o.value} value={o.value} className={chipClass}>
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : field.type === 'date' ? (
        <DateField id={id} value={value} onChange={onChange} placeholder="Not set" onClear={() => onChange('')} />
      ) : field.suffix ? (
        <SuffixInput
          id={id}
          suffix={field.suffix}
          inputMode={field.type === 'number' ? 'decimal' : undefined}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Input
          id={id}
          inputMode={field.type === 'number' ? 'decimal' : undefined}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.hint && <FieldDescription>{field.hint}</FieldDescription>}
      {invalid && <FieldError>Enter a number</FieldError>}
    </Field>
  );
}
