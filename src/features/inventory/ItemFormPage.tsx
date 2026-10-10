import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { SuffixInput } from '@/components/SuffixInput';
import { SuggestionInput } from '@/components/SuggestionInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { milliToDb, milliToInput, parseQuantity, toMilli } from '@/domain/quantity';
import { deriveCode, nextPartNumber, partNumberPrefix, partNumberTaken } from '@/domain/codes';
import { syncErrorMessage } from '@/lib/errors';
import { ensureBrand, useBrands, useCategories, useUnits } from '@/features/catalog/api';
import { useDeleteItem, useItem, useItemMovements, useItems, useSaveItem, type Item } from './api';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  category_id: z.string().min(1, 'Pick a category'),
  unit_id: z.string().min(1, 'Pick a unit'),
  brand: z.string().trim().max(60),
  part_number: z.string().trim().min(1, 'Part number is required').max(40),
  manufacturer_ref: z.string().trim().max(80),
  min_qty: z.string(),
  location: z.string().trim().max(80),
  notes: z.string().max(2000),
});
type Values = z.infer<typeof schema>;

export function ItemFormPage() {
  const { id } = useParams();
  const existing = useItem(id);
  const categories = useCategories();
  const units = useUnits();
  const brands = useBrands();
  if ((id && existing.isPending) || categories.isPending || units.isPending || brands.isPending) {
    return (
      <>
        <PageHeader title={id ? 'Edit item' : 'New item'} back />
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
  const items = useItems();
  const categories = useCategories().data ?? [];
  const units = useUnits().data ?? [];
  const brands = useBrands().data ?? [];
  const movements = useItemMovements(item?.id);
  const hasMovements = (movements.data?.length ?? 0) > 0;
  // new items: the part number follows category + brand until you type your own
  const [partNumberEdited, setPartNumberEdited] = useState(Boolean(item));

  const defaultValues = useMemo<Values>(
    () => ({
      name: item?.name ?? '',
      category_id: item?.category_id ?? categories[0]?.id ?? '',
      unit_id: item?.unit_id ?? units[0]?.id ?? '',
      brand: item?.brand?.name ?? '',
      part_number: item?.part_number ?? '',
      manufacturer_ref: item?.manufacturer_ref ?? '',
      min_qty: item && toMilli(item.min_qty) > 0 ? milliToInput(toMilli(item.min_qty)) : '',
      location: item?.location ?? '',
      notes: item?.notes ?? '',
    }),
    // categories/units only matter for a new item's first render
    [item],
  );
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues });

  const categoryId = form.watch('category_id');
  const unitId = form.watch('unit_id');
  const brandText = form.watch('brand').trim();
  const category = categories.find((c) => c.id === categoryId);
  const unit = units.find((u) => u.id === unitId);

  // brand code for the part number: the existing brand's, or the one a new brand will get
  const brandCode = useMemo(() => {
    if (!brandText) return null;
    const existing = brands.find((b) => b.name === brandText);
    return existing ? existing.code : deriveCode(brandText, brands.map((b) => b.code), 4);
  }, [brandText, brands]);

  const otherPartNumbers = useMemo(
    () => (items.data ?? []).filter((i) => i.id !== item?.id).map((i) => i.part_number),
    [items.data, item?.id],
  );
  const suggestedPartNumber = category ? nextPartNumber(partNumberPrefix(category.code, brandCode), otherPartNumbers) : '';

  useEffect(() => {
    if (!partNumberEdited && suggestedPartNumber) form.setValue('part_number', suggestedPartNumber);
  }, [partNumberEdited, suggestedPartNumber, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    const minMilli = v.min_qty.trim() ? parseQuantity(v.min_qty, { wholeOnly: unit?.whole_only, allowZero: true }) : 0;
    if (minMilli === null) {
      form.setError('min_qty', { message: unit?.whole_only ? 'Whole numbers only' : 'Enter a number (or leave empty)' });
      return;
    }
    if (partNumberTaken(v.part_number, otherPartNumbers)) {
      form.setError('part_number', { message: 'Already used by another item' });
      return;
    }
    try {
      const brand = v.brand ? await ensureBrand(v.brand) : null;
      const saved = await save.mutateAsync({
        id: item?.id,
        values: {
          name: v.name,
          category_id: v.category_id,
          unit_id: v.unit_id,
          brand_id: brand?.id ?? null,
          part_number: v.part_number,
          manufacturer_ref: v.manufacturer_ref || null,
          min_qty: milliToDb(minMilli) as unknown as number,
          location: v.location || null,
          notes: v.notes.trim() || null,
        },
      });
      toast.success(item ? 'Saved' : `${saved.name} added (${saved.part_number}). Record a purchase or adjust the stock.`);
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

  const chipClass = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';

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

            <Field data-invalid={!!form.formState.errors.category_id}>
              <FieldLabel>Category</FieldLabel>
              <Controller
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <ToggleGroup type="single" variant="outline" spacing={2} className="flex flex-wrap" value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                    {categories.map((c) => (
                      <ToggleGroupItem key={c.id} value={c.id} className={chipClass}>
                        {c.name}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
              <FieldError errors={[form.formState.errors.category_id]} />
            </Field>

            <Field data-invalid={!!form.formState.errors.unit_id}>
              <FieldLabel>Unit</FieldLabel>
              <Controller
                control={form.control}
                name="unit_id"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    spacing={2}
                    className="flex flex-wrap"
                    value={field.value}
                    disabled={hasMovements}
                    onValueChange={(v) => v && field.onChange(v)}
                  >
                    {units.map((u) => (
                      <ToggleGroupItem key={u.id} value={u.id} className={chipClass}>
                        {u.name}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
              {hasMovements && <FieldDescription>The unit is fixed once stock has been recorded.</FieldDescription>}
              <FieldError errors={[form.formState.errors.unit_id]} />
            </Field>
            <FieldDescription className="-mt-3">
              Missing a category or unit? Add it under{' '}
              <Link to="/lists" className="text-primary underline">
                More → Categories, units &amp; brands
              </Link>
              .
            </FieldDescription>

            <Field data-invalid={!!form.formState.errors.brand}>
              <FieldLabel htmlFor="item-brand">Brand</FieldLabel>
              <Controller
                control={form.control}
                name="brand"
                render={({ field }) => (
                  <SuggestionInput
                    id="item-brand"
                    value={field.value}
                    onChange={field.onChange}
                    options={brands.map((b) => b.name)}
                    placeholder="Start typing, or leave empty"
                    newHint={(v) => `“${v}” is new: it will be added to the brands list.`}
                  />
                )}
              />
              <FieldError errors={[form.formState.errors.brand]} />
            </Field>

            <Field data-invalid={!!form.formState.errors.part_number}>
              <FieldLabel htmlFor="item-part">Part number</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="item-part"
                  className="font-mono uppercase"
                  autoCapitalize="characters"
                  {...form.register('part_number', { onChange: () => setPartNumberEdited(true) })}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Generate part number"
                  onClick={() => {
                    setPartNumberEdited(false);
                    form.setValue('part_number', suggestedPartNumber, { shouldValidate: true });
                  }}
                >
                  <RefreshCw />
                </Button>
              </div>
              <FieldDescription>
                The item’s unique ID: category code, brand code and a number. {item ? 'Tap ↻ to generate a new one.' : 'You can change it.'}
              </FieldDescription>
              <FieldError errors={[form.formState.errors.part_number]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="item-mref">Manufacturer ref</FieldLabel>
              <Input id="item-mref" placeholder="The maker’s number, e.g. 0 986 494 123" {...form.register('manufacturer_ref')} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field data-invalid={!!form.formState.errors.min_qty}>
                <FieldLabel htmlFor="item-min">Minimum stock</FieldLabel>
                <SuffixInput id="item-min" suffix={unit?.name ?? ''} {...form.register('min_qty')} />
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
