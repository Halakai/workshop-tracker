import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { SuffixInput } from '@/components/SuffixInput';
import { SuggestionInput } from '@/components/SuggestionInput';
import { DateField } from '@/components/DateField';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { hasWorkshopMoney } from '@/domain/cars';
import { centsToInput, parseMoney } from '@/domain/money';
import { todayIso } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { useGarages, useSaveService, useServiceTypes, type CarService } from './services';

const chipClass = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';

const schema = z
  .object({
    typeId: z.string(),
    description: z.string().trim().max(2000),
    date: z.string().min(1, 'When?'),
    mileage: z.string().refine((v) => !v.trim() || /^\d{1,7}$/.test(v.replace(/\s/g, '')), 'Whole kilometres'),
    where: z.enum(['us', 'garage']),
    garage: z.string().trim().max(80),
    labor: z.string().refine((v) => !v.trim() || parseMoney(v) !== null, 'Enter a price (or leave it empty)'),
    notes: z.string().max(2000),
  })
  .refine((v) => v.typeId || v.description, { path: ['description'], message: 'Pick a type or write what was done' })
  .refine((v) => v.where === 'us' || v.garage, { path: ['garage'], message: 'Which garage?' });
type Values = z.infer<typeof schema>;

/** Add or change a service: what, when, at what mileage, where, and (on cars that aren't the workshop's) the work price. */
export function ServiceDrawer({
  car,
  service,
  open,
  onOpenChange,
  onSaved,
}: {
  car: { id: string; owner_kind: string; mileage_km: number | null };
  service?: CarService;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: (id: string) => void;
}) {
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={service ? 'Edit service' : 'New service'}>
      {open && <ServiceForm car={car} service={service} onDone={(id) => (onOpenChange(false), onSaved?.(id))} />}
    </FormDrawer>
  );
}

function ServiceForm({
  car,
  service,
  onDone,
}: {
  car: { id: string; owner_kind: string; mileage_km: number | null };
  service?: CarService;
  onDone: (id: string) => void;
}) {
  const types = useServiceTypes();
  const garages = useGarages();
  const save = useSaveService();
  const workshop = hasWorkshopMoney(car);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      typeId: service?.service_type_id ?? '',
      description: service?.description ?? '',
      date: service?.performed_on ?? todayIso(),
      mileage: service?.mileage_km != null ? String(service.mileage_km) : '',
      // a customer's car typed in here was serviced somewhere else (our work on it is a job)
      where: service ? (service.garage ? 'garage' : 'us') : car.owner_kind === 'customer' ? 'garage' : 'us',
      garage: service?.garage ?? '',
      labor: service?.labor_cents != null ? centsToInput(service.labor_cents) : '',
      notes: service?.notes ?? '',
    },
  });
  const where = form.watch('where');

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const saved = await save.mutateAsync({
        id: service?.id,
        values: {
          car_id: car.id,
          service_type_id: v.typeId || null,
          description: v.description || null,
          performed_on: v.date,
          mileage_km: v.mileage.trim() ? Number(v.mileage.replace(/\s/g, '')) : null,
          garage: v.where === 'garage' ? v.garage : null,
          labor_cents: workshop || !v.labor.trim() ? null : parseMoney(v.labor),
          notes: v.notes.trim() || null,
        },
      });
      toast.success(service ? 'Saved' : 'Service added');
      onDone(saved.id);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  const err = form.formState.errors;
  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel>Type</FieldLabel>
          <Controller
            control={form.control}
            name="typeId"
            render={({ field }) => (
              <ToggleGroup type="single" variant="outline" spacing={2} className="flex flex-wrap" value={field.value} onValueChange={(v) => field.onChange(v)}>
                {(types.data ?? []).map((t) => (
                  <ToggleGroupItem key={t.id} value={t.id} className={chipClass}>
                    {t.name}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
          />
          <FieldDescription>New types are added under More → Lists.</FieldDescription>
        </Field>
        <Field data-invalid={!!err.description}>
          <FieldLabel htmlFor="service-desc">What was done</FieldLabel>
          <Textarea id="service-desc" rows={2} placeholder="e.g. Oil, oil and air filter, checked the brakes" {...form.register('description')} />
          <FieldError errors={[err.description]} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="service-date">Date</FieldLabel>
            <Controller control={form.control} name="date" render={({ field }) => <DateField id="service-date" value={field.value} onChange={field.onChange} />} />
          </Field>
          <Field data-invalid={!!err.mileage}>
            <FieldLabel htmlFor="service-km">Mileage</FieldLabel>
            <SuffixInput id="service-km" suffix="km" inputMode="numeric" placeholder={car.mileage_km != null ? String(car.mileage_km) : ''} {...form.register('mileage')} />
            <FieldError errors={[err.mileage]} />
          </Field>
        </div>
        <Field>
          <FieldLabel>Who did it</FieldLabel>
          <Controller
            control={form.control}
            name="where"
            render={({ field }) => (
              <ToggleGroup type="single" variant="outline" spacing={2} className="flex flex-wrap" value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                <ToggleGroupItem value="us" className={chipClass}>
                  We did
                </ToggleGroupItem>
                <ToggleGroupItem value="garage" className={chipClass}>
                  Another garage
                </ToggleGroupItem>
              </ToggleGroup>
            )}
          />
        </Field>
        {where === 'garage' && (
          <Field data-invalid={!!err.garage}>
            <FieldLabel htmlFor="service-garage">Garage</FieldLabel>
            <Controller
              control={form.control}
              name="garage"
              render={({ field }) => (
                <SuggestionInput id="service-garage" value={field.value} onChange={field.onChange} options={garages.data ?? []} placeholder="e.g. Auto Kovač" limit={5} />
              )}
            />
            <FieldError errors={[err.garage]} />
          </Field>
        )}
        {!workshop && (
          <Field data-invalid={!!err.labor}>
            <FieldLabel htmlFor="service-labor">{car.owner_kind === 'customer' ? 'Price' : 'Work'}</FieldLabel>
            <SuffixInput id="service-labor" suffix="€" {...form.register('labor')} />
            <FieldDescription>
              {car.owner_kind === 'member'
                ? 'What the work cost. Parts bought for it are added on the service, so they add up.'
                : 'What it cost the customer, if you know.'}
            </FieldDescription>
            <FieldError errors={[err.labor]} />
          </Field>
        )}
        {workshop && <FieldDescription>Its price is what you file under it: parts bought, other costs and parts from stock.</FieldDescription>}
        <Field>
          <FieldLabel htmlFor="service-notes">Notes</FieldLabel>
          <Textarea id="service-notes" rows={2} {...form.register('notes')} />
        </Field>
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          {service ? 'Save' : 'Add service'}
        </Button>
      </FieldGroup>
    </form>
  );
}
