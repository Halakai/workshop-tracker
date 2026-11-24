import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { FormDrawer } from '@/components/FormDrawer';
import { Checkbox } from '@/components/Checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { manualTitle, type ManualCar, type ManualFit } from '@/domain/manuals';
import { rankEngineParts } from '@/domain/manualSearch';
import { syncErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { ALL_PARTS, useManualPages, useManualsByWords, useSaveCarManual, type useCarManual } from './api';

const FIT_LABELS: Record<ManualFit, string> = { exact: 'this car', close: 'same model, check the version', related: 'same technology' };

/** The text after a short pause in typing, so every letter doesn't ask the server. */
function useSettled(value: string, ms = 350): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** Which manual a kind of car uses: the suggestions, or any manual found by its name. */
export function ChooseManualDrawer({
  car,
  found,
  open,
  onOpenChange,
}: {
  car: ManualCar;
  found: ReturnType<typeof useCarManual>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Repair manual" description="For every car of this make, model, generation and engine.">
      {open && <ManualPicker car={car} found={found} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function ManualPicker({ car, found, onDone }: { car: ManualCar; found: ReturnType<typeof useCarManual>; onDone: () => void }) {
  const save = useSaveCarManual();
  const [query, setQuery] = useState('');
  const settled = useSettled(query);
  const byWords = useManualsByWords(settled);

  const choose = async (slug: string) => {
    try {
      // another manual has other parts
      await save.mutateAsync({ car, choice: found.choice, slug, parts: slug === found.slug ? (found.choice?.parts ?? []) : [] });
      toast.success('Manual chosen');
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  const searching = settled.trim().length >= 2;
  const rows: { slug: string; note?: string }[] = searching
    ? (byWords.data ?? []).map((slug) => ({ slug }))
    : found.matches.map((m) => ({ slug: m.slug, note: FIT_LABELS[m.fit] }));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" placeholder="Any manual: passat b5, e46 320d…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
      </div>
      {searching && byWords.isLoading && <Skeleton className="h-24 rounded-xl" />}
      {searching && byWords.isError && <p className="text-sm text-destructive">{byWords.error.message}</p>}
      {rows.length === 0 && !byWords.isLoading && (
        <p className="text-sm text-muted-foreground">
          {searching ? 'No manual with these words.' : 'No suggestions for this car. Type a make and model above (Opel is listed as Vauxhall).'}
        </p>
      )}
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border empty:hidden">
        {rows.map(({ slug, note }) => {
          const current = slug === found.slug;
          return (
            <li key={slug}>
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => choose(slug)}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className={cn('block', current && 'font-semibold')}>{manualTitle(slug)}</span>
                  {note && <span className="block text-xs text-muted-foreground">{note}</span>}
                </span>
                {save.isPending && save.variables?.slug === slug ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  current && <Check className="size-5 text-primary" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Which of the manual's engines and gearboxes to show. */
export function PartsDrawer({
  car,
  slug,
  found,
  open,
  onOpenChange,
}: {
  car: ManualCar;
  slug: string;
  found: ReturnType<typeof useCarManual>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Engine and gearbox"
      description="The search then leaves out the other engines and gearboxes of this model."
    >
      {open && <PartsForm car={car} slug={slug} found={found} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}

function PartsForm({ car, slug, found, onDone }: { car: ManualCar; slug: string; found: ReturnType<typeof useCarManual>; onDone: () => void }) {
  const { engines, gearboxes, parts } = useManualPages(slug, found.car, found.choice?.parts ?? []);
  const [chosen, setChosen] = useState<string[]>(() => parts.filter((p) => p !== ALL_PARTS));
  const save = useSaveCarManual();
  // what was ticked when the pop-up opened stays on top, then the likelier engines
  const [first] = useState(chosen);
  const ranked = useMemo(() => {
    const top = (names: string[]) => [...names.filter((n) => first.includes(n)), ...names.filter((n) => !first.includes(n))];
    return { engines: top(rankEngineParts(engines, found.car)), gearboxes: top([...gearboxes]) };
  }, [engines, gearboxes, found.car, first]);
  const toggle = (name: string) => setChosen((c) => (c.includes(name) ? c.filter((x) => x !== name) : [...c, name]));

  const submit = async () => {
    try {
      await save.mutateAsync({ car, choice: found.choice, slug, parts: chosen.length > 0 ? chosen : [ALL_PARTS] });
      toast.success('Saved');
      onDone();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  const group = (title: string, names: readonly string[], none: string) =>
    names.length > 0 && (
      <section className="flex flex-col gap-1">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{none}</p>
        {names.map((name) => (
          <label key={name} className="flex min-h-11 items-center gap-3">
            <Checkbox checked={chosen.includes(name)} onChange={() => toggle(name)} />
            <span>{name}</span>
          </label>
        ))}
      </section>
    );

  return (
    <div className="flex flex-col gap-4">
      {group('Engine', ranked.engines, 'None ticked: every engine is shown.')}
      {group('Gearbox', ranked.gearboxes, 'None ticked: every gearbox is shown.')}
      <div className="sticky bottom-0 -mb-2 bg-popover pt-2 pb-2">
        <Button size="lg" className="w-full" disabled={save.isPending} onClick={submit}>
          {save.isPending && <Loader2 className="animate-spin" />} Save
        </Button>
      </div>
    </div>
  );
}
