import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Loader2, Trash2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { SuffixInput } from '@/components/SuffixInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { UNITS, milliToDb, milliToInput, parseQuantity, toMilli, type Unit } from '@/domain/quantity';
import { syncErrorMessage } from '@/lib/errors';
import { CATEGORY_LABELS, type ItemCategory } from './labels';
import { useDeleteItem, useItem, useItemMovements, useSaveItem, type Item } from './api';

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    category: z.enum(['part', 'consumable', 'fluid', 'other']),
    unit: z.enum(['pcs', 'L', 'ml', 'kg', 'm']),
    brand: z.string().trim().max(80),
    part_number: z.string().trim().max(80),
    min_qty: z.string(),
    location: z.string().trim().max(80),
    notes: z.string().max(2000),
  })
  .refine((v) => v.min_qty.trim() === '' || parseQuantity(v.min_qty, { unit: v.unit, allowZero: true }) !== null, {
    path: ['min_qty'],
    message: 'Enter a number (or leave empty)',
  });
type Values = z.infer<typeof schema>;

export function ItemFormPage() {
  const { id } = useParams();
  const existing = useItem(id);
  if (id && existing.isPending) {
    return (
      <>
        <PageHeader title="Edit item" back />
        <PageBody>
          <Skeleton className="h-96 rounded-xl" />
        </PageBody>
      </>
    );
  }
  return <ItemForm item={id ? existing.data : undefined} />;
}

function ItemForm({ item }: { item?: Item }) {
  const navigate = useNavigate();
  const save = useSaveItem();
  const remove = useDeleteItem();
  const movements = useItemMovements(item?.id);
  const hasMovements = (movements.data?.length ?? 0) > 0;

  const defaultValues = useMemo<Values>(
    () => ({
      name: item?.name ?? '',
      category: item?.category ?? 'part',
      unit: (item?.unit as Unit) ?? 'pcs',
      brand: item?.brand ?? '',
      part_number: item?.part_number ?? '',
      min_qty: item && toMilli(item.min_qty) > 0 ? milliToInput(toMilli(item.min_qty)) : '',
      location: item?.location ?? '',
      notes: item?.notes ?? '',
    }),
    [item],
  );
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues });
  const unit = form.watch('unit');

  const onSubmit = form.handleSubmit(async (v) => {
    const minMilli = v.min_qty.trim() ? parseQuantity(v.min_qty, { unit: v.unit, allowZero: true })! : 0;
    try {
      const saved = await save.mutateAsync({
        id: item?.id,
        values: {
          name: v.name,
          category: v.category,
          unit: v.unit,
          brand: v.brand || null,
          part_number: v.part_number || null,
          min_qty: milliToDb(minMilli) as unknown as number,
          location: v.location || null,
          notes: v.notes.trim() || null,
        },
      });
      toast.success(item ? 'Saved' : `${saved.name} added. Record a purchase or count what you have.`);
      navigate(`/stock/${saved.id}`, { replace: true });
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  const toggleArchive = async () => {
    if (!item) return;
    try {
      await save.mutateAsync({ id: item.id, values: { archived_at: item.archived_at ? null : new Date().toISOString() } });
      toast.success(item.archived_at ? 'Back in the stock list' : 'Archived: hidden from the stock list');
      navigate('/stock', { replace: true });
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  const deleteItem = async () => {
    if (!item) return;
    try {
      await remove.mutateAsync(item.id);
      toast.success('Deleted');
      navigate('/stock', { replace: true });
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title={item ? 'Edit item' : 'New item'} back />
      <PageBody>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <Field data-invalid={!!form.formState.errors.name}>
              <FieldLabel htmlFor="item-name">Name</FieldLabel>
              <Input id="item-name" placeholder="e.g. Engine oil 5W-30" autoFocus={!item} {...form.register('name')} />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>
            <Field>
              <FieldLabel>Category</FieldLabel>
              <Controller
                control={form.control}
                name="category"
                render={({ field }) => (
                  <ToggleGroup type="single" variant="outline" className="grid w-full grid-cols-4" value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    {(Object.keys(CATEGORY_LABELS) as ItemCategory[]).map((c) => (
                      <ToggleGroupItem key={c} value={c} className="px-1 text-sm">
                        {CATEGORY_LABELS[c]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
            </Field>
            <Field>
              <FieldLabel>Unit</FieldLabel>
              <Controller
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    className="grid w-full grid-cols-5"
                    value={field.value}
                    disabled={hasMovements}
                    onValueChange={(v) => v && field.onChange(v)}
                  >
                    {UNITS.map((u) => (
                      <ToggleGroupItem key={u} value={u}>
                        {u}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
              {hasMovements && <FieldDescription>The unit is fixed once stock has been recorded.</FieldDescription>}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="item-brand">Brand</FieldLabel>
                <Input id="item-brand" {...form.register('brand')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-part">Part number</FieldLabel>
                <Input id="item-part" autoCapitalize="characters" {...form.register('part_number')} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!form.formState.errors.min_qty}>
                <FieldLabel htmlFor="item-min">Minimum stock</FieldLabel>
                <SuffixInput id="item-min" suffix={unit} {...form.register('min_qty')} />
                <FieldError errors={[form.formState.errors.min_qty]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="item-location">Location</FieldLabel>
                <Input id="item-location" placeholder="Shelf B2" {...form.register('location')} />
              </Field>
            </div>
            <FieldDescription className="-mt-3">At or below the minimum it shows up on the shopping list.</FieldDescription>
            <Field>
              <FieldLabel htmlFor="item-notes">Notes</FieldLabel>
              <Textarea id="item-notes" {...form.register('notes')} />
            </Field>
            <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              {item ? 'Save' : 'Add item'}
            </Button>
          </FieldGroup>
        </form>

        {item && (
          <div className="mt-4 flex flex-col gap-2 border-t pt-4">
            <Button variant="outline" onClick={toggleArchive}>
              {item.archived_at ? <ArchiveRestore /> : <Archive />}
              {item.archived_at ? 'Unarchive' : 'Archive (hide from the list)'}
            </Button>
            {!hasMovements && movements.isSuccess && (
              <Button variant="destructive" onClick={deleteItem}>
                <Trash2 /> Delete item
              </Button>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}
