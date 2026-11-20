// Making or changing a key (docs/PLAN.md §11): who it's for, the name, how long it works, and for a website key
// what it shows. Changes apply at once; the code stays the same.
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Checkbox } from '@/components/Checkbox';
import { DateField } from '@/components/DateField';
import { todayIso } from '@/domain/dates';
import { LASTS_OPTIONS, WEBSITE_SECTIONS, expiresAt, lastDay, readShows, type KeyKind, type KeyShows, type Lasts, type WebsiteSection } from '@/domain/keys';
import { syncErrorMessage } from '@/lib/errors';
import { useWebsiteCars } from '@/features/website/api';
import { useCreateKey, useUpdateKey, type AccessKey, type KeyTarget } from './api';

const chip = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';

const KIND_HELP: Partial<Record<KeyKind, string>> = {
  buyer: 'Photos, what you did, the specs and the asking price while it’s for sale. After the sale it says “Sold”.',
  owner: 'Their car’s history: what you did and the parts you fitted (no prices), the plate and photos.',
};

export function targetOf(key: AccessKey): KeyTarget {
  if (key.kind === 'job') return { jobId: key.job_id! };
  if (key.kind === 'website') return { website: true };
  return { carId: key.car_id! };
}

export function KeyForm({
  target,
  accessKey,
  defaultNote,
  onSaved,
}: {
  target: KeyTarget;
  accessKey?: AccessKey;
  defaultNote?: string;
  onSaved: (key: AccessKey) => void;
}) {
  const isWebsite = 'website' in target;
  const isCar = 'carId' in target;
  const create = useCreateKey(target);
  const update = useUpdateKey();
  const [kind, setKind] = useState<KeyKind>((accessKey?.kind as KeyKind) ?? (isWebsite ? 'website' : isCar ? 'buyer' : 'job'));
  const [audience, setAudience] = useState<'public' | 'personal'>(accessKey && !accessKey.note ? 'public' : 'personal');
  const [note, setNote] = useState(accessKey?.note ?? defaultNote ?? '');
  const [lasts, setLasts] = useState<Lasts>(accessKey?.expires_at ? 'date' : 'forever');
  const [date, setDate] = useState(accessKey?.expires_at ? lastDay(accessKey.expires_at) : '');
  const [shows, setShows] = useState<KeyShows>(readShows(accessKey?.shows));
  const [error, setError] = useState<string | null>(null);
  const websiteCars = useWebsiteCars();
  const cars = useMemo(() => (websiteCars.data ?? []).filter((w) => w.is_public), [websiteCars.data]);
  const pending = create.isPending || update.isPending;
  const named = !isWebsite || audience === 'personal';

  const toggleSection = (s: WebsiteSection, on: boolean) =>
    setShows((v) => ({ ...v, sections: on ? WEBSITE_SECTIONS.map((x) => x.value).filter((x) => x === s || v.sections.includes(x)) : v.sections.filter((x) => x !== s) }));
  const toggleCar = (id: string, on: boolean) => setShows((v) => ({ ...v, car_ids: on ? [...v.car_ids, id] : v.car_ids.filter((x) => x !== id) }));

  const submit = async () => {
    setError(null);
    if (isWebsite && audience === 'personal' && !note.trim()) return setError('Who is it for? A personal key needs a name.');
    if (lasts === 'date' && (!date || date < todayIso())) return setError('Pick the last day it works (today or later).');
    if (isWebsite && shows.sections.length === 0) return setError('Tick at least one part of the website.');
    if (isWebsite && shows.cars === 'chosen' && shows.car_ids.length === 0 && (shows.sections.includes('for_sale') || shows.sections.includes('work')))
      return setError('Pick the cars it shows, or show all cars.');
    // an unchanged end date stays exactly as it was
    const expires = accessKey?.expires_at && lasts === 'date' && date === lastDay(accessKey.expires_at) ? accessKey.expires_at : expiresAt(lasts, date);
    const name = named ? note.trim() : '';
    try {
      const saved = accessKey
        ? await update.mutateAsync({
            key: accessKey,
            values: {
              note: name || null,
              expires_at: expires,
              ...(isCar ? { kind } : {}),
              ...(isWebsite ? { shows: shows as unknown as AccessKey['shows'] } : {}),
            },
          })
        : await create.mutateAsync({ kind, note: name, expiresAt: expires, shows: isWebsite ? shows : undefined });
      toast.success(accessKey ? 'Saved. It applies straight away.' : 'Key made');
      onSaved(saved);
    } catch (e) {
      setError(syncErrorMessage(e));
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <FieldGroup>
        {isCar && (
          <Field>
            <FieldLabel>Who is it for?</FieldLabel>
            <ToggleGroup type="single" variant="outline" spacing={2} className="flex flex-wrap" value={kind} onValueChange={(v) => v && setKind(v as KeyKind)}>
              <ToggleGroupItem value="buyer" className={chip}>
                For a buyer
              </ToggleGroupItem>
              <ToggleGroupItem value="owner" className={chip}>
                For the owner
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>{KIND_HELP[kind]}</FieldDescription>
          </Field>
        )}

        {isWebsite && (
          <Field>
            <FieldLabel>Who is it for?</FieldLabel>
            <ToggleGroup type="single" variant="outline" spacing={2} className="flex flex-wrap" value={audience} onValueChange={(v) => v && setAudience(v as 'public' | 'personal')}>
              <ToggleGroupItem value="personal" className={chip}>
                One person
              </ToggleGroupItem>
              <ToggleGroupItem value="public" className={chip}>
                Public
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              {audience === 'public' ? 'No name: for an ad, Facebook or a business card. Anyone with the code gets in.' : 'For one person; you see their name in your list of keys.'}
            </FieldDescription>
          </Field>
        )}

        {named && (
          <Field>
            <FieldLabel htmlFor="key-note">{isWebsite ? 'Name' : 'Given to (optional)'}</FieldLabel>
            <Input id="key-note" maxLength={80} placeholder="e.g. Ivan, or Marko from Njuškalo" value={note} onChange={(e) => setNote(e.target.value)} />
            <FieldDescription>Only your team sees it.</FieldDescription>
          </Field>
        )}

        <Field>
          <FieldLabel>Works</FieldLabel>
          <ToggleGroup type="single" variant="outline" spacing={2} className="flex flex-wrap" value={lasts} onValueChange={(v) => v && setLasts(v as Lasts)}>
            {LASTS_OPTIONS.map((o) => (
              <ToggleGroupItem key={o.value} value={o.value} className={chip}>
                {o.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {lasts === 'date' && <DateField id="key-until" value={date} onChange={setDate} max={null} placeholder="Last day it works" />}
          {accessKey && lasts !== 'date' && lasts !== 'forever' && <FieldDescription>Counted from today.</FieldDescription>}
        </Field>

        {isWebsite && (
          <FieldSet>
            <FieldLegend>What it shows</FieldLegend>
            <div className="grid grid-cols-2 gap-2">
              {WEBSITE_SECTIONS.map((s) => (
                <label key={s.value} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={shows.sections.includes(s.value)} onChange={(on) => toggleSection(s.value, on)} />
                  {s.label}
                </label>
              ))}
            </div>
            <Field>
              <FieldLabel>Cars</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                spacing={2}
                className="flex flex-wrap"
                value={shows.cars}
                onValueChange={(v) => v && setShows((s) => ({ ...s, cars: v as 'all' | 'chosen' }))}
              >
                <ToggleGroupItem value="all" className={chip}>
                  All on the website
                </ToggleGroupItem>
                <ToggleGroupItem value="chosen" className={chip}>
                  Only the ones I pick
                </ToggleGroupItem>
              </ToggleGroup>
              {shows.cars === 'chosen' && (
                <ul className="flex flex-col gap-2 rounded-lg border p-3">
                  {cars.length === 0 && <li className="text-sm text-muted-foreground">No cars on the website yet.</li>}
                  {cars.map((w) => (
                    <li key={w.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={shows.car_ids.includes(w.id)} onChange={(on) => toggleCar(w.id, on)} />
                        <span className="min-w-0 flex-1 truncate">{w.title_hr}</span>
                        <span className="text-xs text-muted-foreground">{w.car?.ref ?? w.job?.ref}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </Field>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={shows.prices} onCheckedChange={(on) => setShows((s) => ({ ...s, prices: on }))} />
              Show asking prices
            </label>
          </FieldSet>
        )}

        {error && <FieldError>{error}</FieldError>}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <KeyRound />} {accessKey ? 'Save' : 'Make the key'}
        </Button>
      </FieldGroup>
    </form>
  );
}
