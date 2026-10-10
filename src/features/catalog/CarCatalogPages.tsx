// Lists → Car makes & models: browse the car catalogue; members add, admins rename and delete.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Loader2, Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { FormDrawer } from '@/components/FormDrawer';
import { ConfirmButton } from '@/components/ConfirmButton';
import { CarLogo } from '@/components/CarLogo';
import { SuggestionInput } from '@/components/SuggestionInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { supabase } from '@/lib/supabase';
import { syncErrorMessage } from '@/lib/errors';
import { fold } from '@/domain/search';
import { useCurrentProfile } from '@/features/auth/profiles';
import { useCarGenerations, useCarMakes, useCarModels, yearsLabel, type CarEngine, type CarGeneration } from './carCatalog';

const FUELS = ['Petrol', 'Diesel', 'LPG', 'CNG', 'Hybrid', 'Plug-in hybrid', 'Electric'];

type Entry =
  | { kind: 'make'; id?: string; name: string }
  | { kind: 'model'; id?: string; name: string; makeId: string }
  | { kind: 'generation'; id?: string; name: string; modelId: string; yearFrom: number | null; yearTo: number | null }
  | { kind: 'engine'; id?: string; name: string; generationId: string; fuel: string | null };

const TABLE = { make: 'car_makes', model: 'car_models', generation: 'car_generations', engine: 'car_engines' } as const;

export function CarMakesPage() {
  const makes = useCarMakes();
  const me = useCurrentProfile();
  const [query, setQuery] = useState('');
  const [entry, setEntry] = useState<Entry | null>(null);
  const visible = useMemo(
    () => (makes.data ?? []).filter((m) => fold(m.name).includes(fold(query.trim()))),
    [makes.data, query],
  );
  return (
    <>
      <PageHeader
        title="Car makes & models"
        back="/lists"
        actions={
          <Button variant="ghost" size="icon" aria-label="Add make" onClick={() => setEntry({ kind: 'make', name: '' })}>
            <Plus className="size-5" />
          </Button>
        }
      />
      <PageBody>
        <p className="text-sm text-muted-foreground">
          Suggested on the car and job forms. Anything new you type there is added here when you save.
          {me.role !== 'admin' && ' Only an admin can rename or delete entries.'}
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" placeholder="Find a make" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </div>
        {makes.isPending && <Skeleton className="h-64 rounded-xl" />}
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border empty:hidden">
          {visible.map((m) => (
            <li key={m.id}>
              <Link to={`/lists/cars/${m.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-muted">
                <CarLogo make={m.name} logo={m.logo} />
                <span className="flex-1 font-medium">{m.name}</span>
                <ChevronRight className="size-5 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </PageBody>
      <EntryDrawer entry={entry} onClose={() => setEntry(null)} />
    </>
  );
}

export function CarMakePage() {
  const { id } = useParams();
  const makes = useCarMakes();
  const make = makes.data?.find((m) => m.id === id);
  const models = useCarModels(id);
  const me = useCurrentProfile();
  const isAdmin = me.role === 'admin';
  const [entry, setEntry] = useState<Entry | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  if (makes.isPending) {
    return (
      <>
        <PageHeader title="Make" back="/lists/cars" />
        <PageBody>
          <Skeleton className="h-64 rounded-xl" />
        </PageBody>
      </>
    );
  }
  if (!make) {
    return (
      <>
        <PageHeader title="Make" back="/lists/cars" />
        <PageBody>
          <p className="text-muted-foreground">This make doesn’t exist (anymore).</p>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={make.name}
        back="/lists/cars"
        actions={
          isAdmin && (
            <Button variant="ghost" size="icon" aria-label="Edit make" onClick={() => setEntry({ kind: 'make', id: make.id, name: make.name })}>
              <Pencil className="size-5" />
            </Button>
          )
        }
      />
      <PageBody>
        <div className="flex items-center gap-3">
          <CarLogo make={make.name} logo={make.logo} className="size-14 rounded-xl p-1.5" />
          <p className="text-sm text-muted-foreground">
            {models.data ? `${models.data.length} models` : ''}
            {!isAdmin && (
              <span className="mt-1 flex items-center gap-1.5">
                <Lock className="size-3.5" /> You can add; an admin can rename and delete.
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" onClick={() => setEntry({ kind: 'model', name: '', makeId: make.id })}>
          <Plus /> Add model
        </Button>
        {models.isPending && <Skeleton className="h-40 rounded-xl" />}
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border empty:hidden">
          {models.data?.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-2 px-4 py-2 text-left active:bg-muted"
                onClick={() => setOpen(open === m.id ? null : m.id)}
                aria-expanded={open === m.id}
              >
                <span className="flex-1 font-medium">{m.name}</span>
                <ChevronDown className={`size-5 text-muted-foreground transition-transform ${open === m.id ? 'rotate-180' : ''}`} />
              </button>
              {open === m.id && (
                <ModelDetails
                  modelId={m.id}
                  isAdmin={isAdmin}
                  onEditModel={() => setEntry({ kind: 'model', id: m.id, name: m.name, makeId: make.id })}
                  onEntry={setEntry}
                />
              )}
            </li>
          ))}
        </ul>
      </PageBody>
      <EntryDrawer entry={entry} onClose={() => setEntry(null)} />
    </>
  );
}

function ModelDetails({
  modelId,
  isAdmin,
  onEditModel,
  onEntry,
}: {
  modelId: string;
  isAdmin: boolean;
  onEditModel: () => void;
  onEntry: (e: Entry) => void;
}) {
  const generations = useCarGenerations(modelId);
  return (
    <div className="flex flex-col gap-3 border-t bg-muted/30 px-4 py-3">
      {generations.isPending && <Skeleton className="h-16" />}
      {generations.data?.length === 0 && <p className="text-sm text-muted-foreground">No generations yet.</p>}
      {generations.data?.map((g: CarGeneration) => (
        <div key={g.id} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">{g.name}</span>
            <span className="text-sm text-muted-foreground">{yearsLabel(g)}</span>
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto size-8"
                aria-label={`Edit ${g.name}`}
                onClick={() => onEntry({ kind: 'generation', id: g.id, name: g.name, modelId, yearFrom: g.year_from, yearTo: g.year_to })}
              >
                <Pencil className="size-4" />
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {g.engines.map((e: CarEngine) => (
              <button
                key={e.id}
                type="button"
                disabled={!isAdmin}
                onClick={() => onEntry({ kind: 'engine', id: e.id, name: e.name, generationId: g.id, fuel: e.fuel })}
                className="rounded-md border bg-background px-2 py-1 text-left text-xs leading-tight disabled:cursor-default"
              >
                {e.name}
                {e.fuel && <span className="block text-[10px] text-muted-foreground">{e.fuel}</span>}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onEntry({ kind: 'engine', name: '', generationId: g.id, fuel: null })}
              className="flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs text-muted-foreground"
            >
              <Plus className="size-3.5" /> Engine
            </button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => onEntry({ kind: 'generation', name: '', modelId, yearFrom: null, yearTo: null })}>
          <Plus /> Generation
        </Button>
        {isAdmin && (
          <Button size="sm" variant="ghost" onClick={onEditModel}>
            <Pencil /> Rename model
          </Button>
        )}
      </div>
    </div>
  );
}

const thisYear = new Date().getFullYear();
const yearField = z
  .string()
  .refine((v) => !v.trim() || (/^\d{4}$/.test(v.trim()) && +v >= 1900 && +v <= thisYear + 1), 'A year like 2012');
const schema = z.object({ name: z.string().trim().min(1, 'Name is required').max(60), yearFrom: yearField, yearTo: yearField, fuel: z.string().trim().max(30) });

const KIND_LABEL = { make: 'make', model: 'model', generation: 'generation', engine: 'engine' };

function EntryDrawer({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const title = entry ? `${entry.id ? 'Edit' : 'New'} ${KIND_LABEL[entry.kind]}` : '';
  return (
    <FormDrawer open={!!entry} onOpenChange={(o) => !o && onClose()} title={title}>
      {entry && <EntryForm key={`${entry.kind}${entry.id ?? 'new'}`} entry={entry} onDone={onClose} />}
    </FormDrawer>
  );
}

function useSaveEntry() {
  const queryClient = useQueryClient();
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['car-makes'] }),
      queryClient.invalidateQueries({ queryKey: ['car-models'] }),
      queryClient.invalidateQueries({ queryKey: ['car-generations'] }),
    ]);
  const save = useMutation({
    mutationFn: async ({ entry, values }: { entry: Entry; values: Record<string, unknown> }) => {
      const table = supabase.from(TABLE[entry.kind] as 'car_makes');
      const { data, error } = entry.id
        ? await table.update(values as never).eq('id', entry.id).select()
        : await table.insert(values as never).select();
      if (error) throw error;
      if (!data.length) throw new Error('Only an admin can change entries.');
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (entry: Entry) => {
      const { data, error } = await supabase.from(TABLE[entry.kind] as 'car_makes').delete().eq('id', entry.id!).select();
      if (error) throw error;
      if (!data.length) throw new Error('Only an admin can delete entries.');
    },
    onSuccess: invalidate,
  });
  return { save, remove };
}

function EntryForm({ entry, onDone }: { entry: Entry; onDone: () => void }) {
  const { save, remove } = useSaveEntry();
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: entry.name,
      yearFrom: entry.kind === 'generation' && entry.yearFrom ? String(entry.yearFrom) : '',
      yearTo: entry.kind === 'generation' && entry.yearTo ? String(entry.yearTo) : '',
      fuel: entry.kind === 'engine' ? (entry.fuel ?? '') : '',
    },
  });
  const err = form.formState.errors;

  const onSubmit = form.handleSubmit(async (v) => {
    const year = (s: string) => (s.trim() ? Number(s) : null);
    if (entry.kind === 'generation' && year(v.yearFrom) && year(v.yearTo) && year(v.yearTo)! < year(v.yearFrom)!) {
      form.setError('yearTo', { message: 'Before the first year' });
      return;
    }
    const values: Record<string, unknown> = { name: v.name };
    if (entry.kind === 'model' && !entry.id) values.make_id = entry.makeId;
    if (entry.kind === 'generation') {
      if (!entry.id) values.model_id = entry.modelId;
      values.year_from = year(v.yearFrom);
      values.year_to = year(v.yearTo);
    }
    if (entry.kind === 'engine') {
      if (!entry.id) values.generation_id = entry.generationId;
      values.fuel = v.fuel || null;
      const kw = /(\d{1,4})\s*kW/i.exec(v.name);
      values.power_kw = kw ? Number(kw[1]) : null;
    }
    try {
      await save.mutateAsync({ entry, values });
      toast.success(entry.id ? 'Saved' : `${v.name} added`);
      onDone();
    } catch (e) {
      const code = (e as { code?: string }).code;
      toast.error(code === '23505' ? `There already is a ${KIND_LABEL[entry.kind]} called “${v.name}”.` : syncErrorMessage(e));
    }
  });

  const onDelete = async () => {
    try {
      await remove.mutateAsync(entry);
      toast.success(`${entry.name} deleted`);
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  const placeholder = { make: 'e.g. Zastava', model: 'e.g. Octavia', generation: 'e.g. II (1Z)', engine: '1.9 TDI 77 kW (105 HP)' }[entry.kind];
  const below = {
    make: 'everything listed under it: models, generations and engines',
    model: 'its generations and engines',
    generation: 'its engines',
    engine: '',
  }[entry.kind];

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={!!err.name}>
          <FieldLabel htmlFor="catalog-name">Name</FieldLabel>
          <Input id="catalog-name" placeholder={placeholder} autoFocus={!entry.id} {...form.register('name')} />
          {entry.kind === 'engine' && <FieldDescription>Size, name and power, like the other entries: “1.6 TDI 77 kW (105 HP)”.</FieldDescription>}
          <FieldError errors={[err.name]} />
        </Field>
        {entry.kind === 'generation' && (
          <div className="grid grid-cols-2 gap-3">
            <Field data-invalid={!!err.yearFrom}>
              <FieldLabel htmlFor="catalog-from">From year</FieldLabel>
              <Input id="catalog-from" inputMode="numeric" {...form.register('yearFrom')} />
              <FieldError errors={[err.yearFrom]} />
            </Field>
            <Field data-invalid={!!err.yearTo}>
              <FieldLabel htmlFor="catalog-to">To year</FieldLabel>
              <Input id="catalog-to" inputMode="numeric" placeholder="still made" {...form.register('yearTo')} />
              <FieldError errors={[err.yearTo]} />
            </Field>
          </div>
        )}
        {entry.kind === 'engine' && (
          <Field>
            <FieldLabel htmlFor="catalog-fuel">Fuel</FieldLabel>
            <SuggestionInput
              id="catalog-fuel"
              value={form.watch('fuel')}
              onChange={(v) => form.setValue('fuel', v)}
              options={FUELS}
              limit={FUELS.length}
            />
          </Field>
        )}
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
          {entry.id ? 'Save' : `Add ${KIND_LABEL[entry.kind]}`}
        </Button>
        {entry.id && (
          <div className="border-t pt-4">
            <ConfirmButton
              variant="destructive"
              className="w-full"
              title={`Delete ${entry.name}?`}
              description={`${below ? `This also deletes ${below}. ` : ''}Cars and jobs keep what was typed on them.`}
              confirmLabel="Delete"
              onConfirm={onDelete}
            >
              <Trash2 /> Delete {KIND_LABEL[entry.kind]}
            </ConfirmButton>
          </div>
        )}
      </FieldGroup>
    </form>
  );
}
