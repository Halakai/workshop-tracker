import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { CODE_PATTERN, deriveCode } from '@/domain/codes';
import { syncErrorMessage } from '@/lib/errors';
import {
  useAddCategory,
  useAddExpenseCategory,
  useAddUnit,
  useCategories,
  useDeleteEntry,
  useUpdateEntry,
  type Brand,
  type Category,
  type ExpenseCategory,
  type ListTable,
  type UnitEntry,
} from './api';

function duplicateMessage(e: unknown, what: string) {
  const err = e as { code?: string; message?: string };
  if (err?.code === '23505') return `That ${what} already exists (the name or code is taken).`;
  return syncErrorMessage(e);
}

const codeField = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .refine((v) => CODE_PATTERN.test(v), '2–6 letters or digits');

// ---------------------------------------------------------------------------
// Add (any member)
// ---------------------------------------------------------------------------

const categorySchema = z.object({ name: z.string().trim().min(1, 'Name is required').max(40), code: codeField });

export function AddCategoryDrawer({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: (category: Category) => void;
}) {
  const categories = useCategories();
  const add = useAddCategory();
  const [codeEdited, setCodeEdited] = useState(false);
  const form = useForm({ resolver: zodResolver(categorySchema), defaultValues: { name: '', code: '' } });

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      form.reset();
      setCodeEdited(false);
    }
  };
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const category = await add.mutateAsync({ ...values, sort_order: 100 });
      toast.success(`Category ${category.name} added`);
      onAdded?.(category);
      close(false);
    } catch (e) {
      toast.error(duplicateMessage(e, 'category'));
    }
  });

  return (
    <FormDrawer open={open} onOpenChange={close} title="New category">
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.name}>
            <FieldLabel htmlFor="cat-name">Name</FieldLabel>
            <Input
              id="cat-name"
              autoFocus
              {...form.register('name', {
                onChange: (e) => {
                  if (!codeEdited) {
                    form.setValue('code', e.target.value.trim() ? deriveCode(e.target.value, (categories.data ?? []).map((c) => c.code), 3) : '');
                  }
                },
              })}
            />
            <FieldError errors={[form.formState.errors.name]} />
          </Field>
          <Field data-invalid={!!form.formState.errors.code}>
            <FieldLabel htmlFor="cat-code">Code</FieldLabel>
            <Input id="cat-code" className="font-mono uppercase" autoCapitalize="characters" {...form.register('code', { onChange: () => setCodeEdited(true) })} />
            <FieldDescription>Used at the start of part numbers, e.g. FLD-CAST-001.</FieldDescription>
            <FieldError errors={[form.formState.errors.code]} />
          </Field>
          <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Add category
          </Button>
        </FieldGroup>
      </form>
    </FormDrawer>
  );
}

const unitSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(12).regex(/^\S+$/, 'No spaces'),
  whole_only: z.boolean(),
});

export function AddUnitDrawer({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded?: (unit: UnitEntry) => void;
}) {
  const add = useAddUnit();
  const form = useForm({ resolver: zodResolver(unitSchema), defaultValues: { name: '', whole_only: false } });
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) form.reset();
  };
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const unit = await add.mutateAsync({ ...values, sort_order: 100 });
      toast.success(`Unit ${unit.name} added`);
      onAdded?.(unit);
      close(false);
    } catch (e) {
      toast.error(duplicateMessage(e, 'unit'));
    }
  });
  return (
    <FormDrawer open={open} onOpenChange={close} title="New unit">
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.name}>
            <FieldLabel htmlFor="unit-name">Unit</FieldLabel>
            <Input id="unit-name" placeholder="e.g. set, pair, roll" autoFocus autoCapitalize="none" {...form.register('name')} />
            <FieldError errors={[form.formState.errors.name]} />
          </Field>
          <WholeOnlySwitch control={form.control} />
          <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Add unit
          </Button>
        </FieldGroup>
      </form>
    </FormDrawer>
  );
}

const expenseCategorySchema = z.object({ name: z.string().trim().min(1, 'Name is required').max(40) });

export function AddExpenseCategoryDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const add = useAddExpenseCategory();
  const form = useForm({ resolver: zodResolver(expenseCategorySchema), defaultValues: { name: '' } });
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) form.reset();
  };
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const category = await add.mutateAsync({ ...values, sort_order: 80 });
      toast.success(`Cost type ${category.name} added`);
      close(false);
    } catch (e) {
      toast.error(duplicateMessage(e, 'cost type'));
    }
  });
  return (
    <FormDrawer open={open} onOpenChange={close} title="New cost type">
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field data-invalid={!!form.formState.errors.name}>
            <FieldLabel htmlFor="expcat-name">Name</FieldLabel>
            <Input id="expcat-name" placeholder="e.g. Parking, Customs" autoFocus {...form.register('name')} />
            <FieldError errors={[form.formState.errors.name]} />
          </Field>
          <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
            Add cost type
          </Button>
        </FieldGroup>
      </form>
    </FormDrawer>
  );
}

function WholeOnlySwitch({ control }: { control: any }) {
  return (
    <Field orientation="horizontal">
      <Controller
        control={control}
        name="whole_only"
        render={({ field }) => <Switch id="unit-whole" checked={field.value} onCheckedChange={field.onChange} />}
      />
      <FieldLabel htmlFor="unit-whole">Whole numbers only (like pieces)</FieldLabel>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Edit / delete (admins only; RLS enforces it too)
// ---------------------------------------------------------------------------

export type EditTarget =
  | { table: 'item_categories'; entry: Category; usedBy: number }
  | { table: 'units'; entry: UnitEntry; usedBy: number }
  | { table: 'brands'; entry: Brand; usedBy: number }
  | { table: 'expense_categories'; entry: ExpenseCategory; usedBy: number };

const TITLES: Record<ListTable, string> = {
  item_categories: 'category',
  units: 'unit',
  brands: 'brand',
  expense_categories: 'cost type',
};

const editSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  code: z.string(),
  whole_only: z.boolean(),
});

export function EditEntryDrawer({ target, onClose }: { target: EditTarget | null; onClose: () => void }) {
  return (
    <FormDrawer open={!!target} onOpenChange={(o) => !o && onClose()} title={target ? `Edit ${TITLES[target.table]}` : ''}>
      {target && <EditEntryForm key={target.entry.id} target={target} onDone={onClose} />}
    </FormDrawer>
  );
}

function EditEntryForm({ target, onDone }: { target: EditTarget; onDone: () => void }) {
  const update = useUpdateEntry(target.table);
  const remove = useDeleteEntry(target.table);
  const hasCode = target.table === 'item_categories' || target.table === 'brands';
  const form = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: target.entry.name,
      code: 'code' in target.entry ? target.entry.code : '',
      whole_only: 'whole_only' in target.entry ? target.entry.whole_only : false,
    },
  });

  const onSubmit = form.handleSubmit(async (v) => {
    const code = v.code.trim().toUpperCase();
    const maxCode = target.table === 'item_categories' ? 5 : 6;
    if (hasCode && (!CODE_PATTERN.test(code) || code.length > maxCode)) {
      form.setError('code', { message: `2–${maxCode} letters or digits` });
      return;
    }
    if (target.table === 'units' && /\s/.test(v.name)) {
      form.setError('name', { message: 'No spaces' });
      return;
    }
    const values =
      target.table === 'units'
        ? { name: v.name, whole_only: v.whole_only }
        : hasCode
          ? { name: v.name, code }
          : { name: v.name };
    try {
      await update.mutateAsync({ id: target.entry.id, values });
      toast.success('Saved');
      onDone();
    } catch (e) {
      toast.error(duplicateMessage(e, TITLES[target.table]));
    }
  });

  const onDelete = async () => {
    try {
      await remove.mutateAsync(target.entry.id);
      toast.success(`${target.entry.name} deleted`);
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.name}>
          <FieldLabel htmlFor="edit-name">Name</FieldLabel>
          <Input id="edit-name" {...form.register('name')} />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>
        {hasCode && (
          <Field data-invalid={!!form.formState.errors.code}>
            <FieldLabel htmlFor="edit-code">Code</FieldLabel>
            <Input id="edit-code" className="font-mono uppercase" autoCapitalize="characters" {...form.register('code')} />
            <FieldDescription>Only new part numbers use the new code; existing ones stay as they are.</FieldDescription>
            <FieldError errors={[form.formState.errors.code]} />
          </Field>
        )}
        {target.table === 'units' && <WholeOnlySwitch control={form.control} />}
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          Save
        </Button>
        <div className="border-t pt-4">
          {target.usedBy > 0 ? (
            <p className="text-sm text-muted-foreground">
              Used {target.usedBy} time{target.usedBy === 1 ? '' : 's'}, so it can’t be deleted.
            </p>
          ) : (
            <Button type="button" variant="destructive" className="w-full" disabled={remove.isPending} onClick={onDelete}>
              <Trash2 /> Delete {TITLES[target.table]}
            </Button>
          )}
        </div>
      </FieldGroup>
    </form>
  );
}
