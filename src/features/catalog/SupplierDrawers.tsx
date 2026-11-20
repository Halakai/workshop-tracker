import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { syncErrorMessage } from '@/lib/errors';
import { useAddSupplier, useDeleteSupplier, useRenameSupplier, useSupplierList, type Supplier } from './api';

const MAX_NAME = 120;
const plural = (n: number) => `${n} purchase${n === 1 ? '' : 's'}`;

export function AddSupplierDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Add supplier" description="Shops and people you buy parts and tools from.">
      {open && <AddSupplierForm onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function AddSupplierForm({ onDone }: { onDone: () => void }) {
  const suppliers = useSupplierList();
  const add = useAddSupplier();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return setError('Name is required');
    if (trimmed.length > MAX_NAME) return setError(`Up to ${MAX_NAME} characters`);
    if (suppliers.data?.some((s) => s.name === trimmed)) return setError('Already on the list');
    try {
      await add.mutateAsync(trimmed);
      toast.success(`${trimmed} added`);
      onDone();
    } catch (err) {
      setError((err as { code?: string }).code === '23505' ? 'Already on the list' : syncErrorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="supplier-name">Name</FieldLabel>
          <Input id="supplier-name" autoFocus placeholder="e.g. Autodijelovi Horvat" value={name} onChange={(e) => (setName(e.target.value), setError(null))} />
          <FieldError>{error}</FieldError>
        </Field>
        <Button type="submit" size="lg" disabled={add.isPending}>
          {add.isPending && <Loader2 className="animate-spin" />}
          Add
        </Button>
      </FieldGroup>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Rename / merge / delete (admins only; the database enforces it too)
// ---------------------------------------------------------------------------

export function EditSupplierDrawer({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  return (
    <FormDrawer open={!!supplier} onOpenChange={(o) => !o && onClose()} title="Edit supplier">
      {supplier && <EditSupplierForm key={supplier.id} supplier={supplier} onDone={onClose} />}
    </FormDrawer>
  );
}

function EditSupplierForm({ supplier, onDone }: { supplier: Supplier; onDone: () => void }) {
  const suppliers = useSupplierList();
  const rename = useRenameSupplier();
  const remove = useDeleteSupplier();
  const [name, setName] = useState(supplier.name);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const other = suppliers.data?.find((s) => s.name === trimmed && s.id !== supplier.id);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) return setError('Name is required');
    if (trimmed.length > MAX_NAME) return setError(`Up to ${MAX_NAME} characters`);
    if (trimmed === supplier.name) return onDone();
    try {
      await rename.mutateAsync({ id: supplier.id, name: trimmed });
      toast.success(other ? `Merged into ${trimmed}` : 'Renamed');
      onDone();
    } catch (err) {
      setError(syncErrorMessage(err));
    }
  };

  const onDelete = async () => {
    try {
      await remove.mutateAsync(supplier.id);
      toast.success(`${supplier.name} deleted`);
      onDone();
    } catch (err) {
      toast.error(syncErrorMessage(err));
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="supplier-rename">Name</FieldLabel>
          <Input id="supplier-rename" value={name} onChange={(e) => (setName(e.target.value), setError(null))} />
          {other ? (
            <FieldDescription className="text-foreground">
              “{other.name}” is already on the list: the two become one supplier with {plural(supplier.uses + other.uses)}.
            </FieldDescription>
          ) : (
            supplier.uses > 0 && <FieldDescription>The new name goes on all {plural(supplier.uses)}.</FieldDescription>
          )}
          <FieldError>{error}</FieldError>
        </Field>
        <Button type="submit" size="lg" disabled={rename.isPending}>
          {rename.isPending && <Loader2 className="animate-spin" />}
          {other ? 'Merge' : 'Save'}
        </Button>
        <div className="border-t pt-4">
          {supplier.uses > 0 ? (
            <p className="text-sm text-muted-foreground">
              Used by {plural(supplier.uses)}, so it can’t be deleted. To get rid of a duplicate, rename it to the right supplier.
            </p>
          ) : (
            <Button type="button" variant="destructive" className="w-full" disabled={remove.isPending} onClick={onDelete}>
              <Trash2 /> Delete supplier
            </Button>
          )}
        </div>
      </FieldGroup>
    </form>
  );
}
