// How one car (flip) or customer job appears on the public website: switch, texts, details, photos, address.
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Check, Loader2, Trash2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Checkbox } from '@/components/Checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { formatMoney } from '@/domain/money';
import { formatInteger } from '@/domain/quantity';
import { albumSide, beforeAfterPairs, defaultWebsiteTitle, SLUG_PATTERN, slugify, uniqueSlug, type BeforeAfter } from '@/domain/website';
import { syncErrorMessage } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { useCar } from '@/features/cars/api';
import { useJob } from '@/features/jobs/api';
import { usePhotos, type Attachment, type EntityType } from '@/features/files/api';
import { usePhotoAlbums } from '@/features/catalog/api';
import { publishWebsite, useDeleteWebsiteCar, useSaveWebsiteCar, useSetPhotoOnWebsite, useWebsiteCars, type WebsiteCar } from './api';
import { websiteBase } from './links';
import { LangToggle, type Lang } from './LangToggle';

/** What the page needs to know about the car or job behind the listing. */
interface Subject {
  kind: 'car' | 'job';
  id: string;
  ref: string;
  back: string;
  make: string | null;
  model: string | null;
  generation: string | null;
  year: number | null;
  engine: string | null;
  fuel: string | null;
  mileage: number | null;
  status: string | null;
  askingPrice: number | null;
}

export function CarWebsitePage() {
  const { id } = useParams();
  const car = useCar(id);
  const subject: Subject | null = car.data
    ? {
        kind: 'car',
        id: car.data.id,
        ref: car.data.ref,
        back: `/cars/${car.data.id}`,
        make: car.data.make,
        model: car.data.model,
        generation: car.data.generation,
        year: car.data.year,
        engine: car.data.engine,
        fuel: car.data.fuel,
        mileage: car.data.sale_mileage_km ?? car.data.mileage_km,
        status: car.data.status,
        askingPrice: car.data.asking_price_cents,
      }
    : null;
  return <Loader pending={car.isPending} subject={subject} back={`/cars/${id}`} />;
}

export function JobWebsitePage() {
  const { id } = useParams();
  const job = useJob(id);
  const subject: Subject | null = job.data
    ? {
        kind: 'job',
        id: job.data.id,
        ref: job.data.ref,
        back: `/jobs/${job.data.id}`,
        make: job.data.car_make,
        model: job.data.car_model,
        generation: job.data.car_generation,
        year: job.data.car_year,
        engine: job.data.car_engine,
        fuel: null,
        mileage: null,
        status: null,
        askingPrice: null,
      }
    : null;
  return <Loader pending={job.isPending} subject={subject} back={`/jobs/${id}`} />;
}

function Loader({ pending, subject, back }: { pending: boolean; subject: Subject | null; back: string }) {
  const listings = useWebsiteCars();
  if (pending || listings.isPending) {
    return (
      <>
        <PageHeader title="On the website" back={back} />
        <PageBody>
          <Skeleton className="h-64 rounded-xl" />
        </PageBody>
      </>
    );
  }
  if (!subject || listings.isError) {
    return (
      <>
        <PageHeader title="On the website" back={back} />
        <PageBody>
          <p className="text-muted-foreground">{listings.error ? syncErrorMessage(listings.error) : 'This doesn’t exist (anymore).'}</p>
        </PageBody>
      </>
    );
  }
  const all = listings.data ?? [];
  const listing = all.find((w) => (subject.kind === 'car' ? w.car_id === subject.id : w.job_id === subject.id)) ?? null;
  const taken = all.filter((w) => w.id !== listing?.id).map((w) => w.slug);
  return <ListingForm key={listing?.id ?? 'new'} subject={subject} listing={listing} taken={taken} />;
}

const schema = z.object({
  is_public: z.boolean(),
  customer_agreed: z.boolean(),
  title_hr: z.string().trim().min(1, 'A title is needed').max(100),
  title_en: z.string().trim().max(100),
  summary_hr: z.string().trim().max(160),
  summary_en: z.string().trim().max(160),
  story_hr: z.string().trim().max(4000),
  story_en: z.string().trim().max(4000),
  show_year: z.boolean(),
  show_engine: z.boolean(),
  show_fuel: z.boolean(),
  show_mileage: z.boolean(),
  pinned: z.boolean(),
  slug: z.string().trim().max(80).regex(SLUG_PATTERN, 'Only lowercase letters, digits and dashes, e.g. bmw-e46-330d'),
  photoIds: z.array(z.string()),
});
type Values = z.infer<typeof schema>;

function ListingForm({ subject, listing, taken }: { subject: Subject; listing: WebsiteCar | null; taken: string[] }) {
  const goBack = useGoBack();
  const entityType: EntityType = subject.kind;
  const { photos, links } = usePhotos(entityType, subject.id);
  const save = useSaveWebsiteCar();
  const remove = useDeleteWebsiteCar();
  const setOnWebsite = useSetPhotoOnWebsite();
  const [lang, setLang] = useState<Lang>('hr');
  const [slugEdited, setSlugEdited] = useState(Boolean(listing));

  const defaults = useMemo<Values>(() => {
    const title = listing?.title_hr ?? (defaultWebsiteTitle(subject) || subject.ref);
    return {
      is_public: listing?.is_public ?? false,
      customer_agreed: listing?.customer_agreed ?? false,
      title_hr: title,
      title_en: listing?.title_en ?? '',
      summary_hr: listing?.summary_hr ?? '',
      summary_en: listing?.summary_en ?? '',
      story_hr: listing?.story_hr ?? '',
      story_en: listing?.story_en ?? '',
      show_year: listing?.show_year ?? true,
      show_engine: listing?.show_engine ?? true,
      show_fuel: listing?.show_fuel ?? true,
      show_mileage: listing?.show_mileage ?? true,
      pinned: listing?.pinned ?? false,
      slug: listing?.slug ?? uniqueSlug(slugify([title, subject.year].filter(Boolean).join(' ')), taken),
      photoIds: photos.filter((p) => p.on_website).map((p) => p.id),
    };
    // only once per listing: the photos may arrive later (synced below)
  }, [listing]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { errors } = form.formState;
  const [isPublic, agreed, photoIds] = useWatch({ control: form.control, name: ['is_public', 'customer_agreed', 'photoIds'] });
  const albums = usePhotoAlbums();

  // when the photos arrive after the form, start from the ones already on the website (unless someone tapped already)
  const onWebsite = photos.filter((p) => p.on_website).map((p) => p.id).join(',');
  useEffect(() => {
    if (!form.getFieldState('photoIds').isDirty) form.setValue('photoIds', onWebsite ? onWebsite.split(',') : []);
  }, [onWebsite, form]);

  const chosen = photos.filter((p) => photoIds.includes(p.id));
  const setPhotos = (ids: string[]) => form.setValue('photoIds', ids, { shouldDirty: true });
  const togglePhoto = (id: string) => setPhotos(photoIds.includes(id) ? photoIds.filter((x) => x !== id) : [...photoIds, id]);

  // before/after comes from the Before and After albums (paired in the order the photos were added), as on the website
  const albumName = new Map((albums.data ?? []).map((a) => [a.id, a.name]));
  const sideOf = (p: Attachment): BeforeAfter | null => albumSide(p.album_id ? albumName.get(p.album_id) : null);
  const byAdded = (list: Attachment[]) => [...list].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const pairs = beforeAfterPairs(byAdded(chosen), sideOf);
  const albumPhotos = photos.filter((p) => sideOf(p));

  const onSubmit = form.handleSubmit(async (values) => {
    if (taken.includes(values.slug)) {
      form.setError('slug', { message: 'Another car already uses this address' });
      return;
    }
    if (subject.kind === 'job' && values.is_public && !values.customer_agreed) {
      form.setError('customer_agreed', { message: 'Only with the customer’s permission' });
      return;
    }
    const text = (v: string) => v || null;
    try {
      for (const photo of photos) {
        const on = values.photoIds.includes(photo.id);
        if (photo.on_website !== on) await setOnWebsite.mutateAsync({ photo, on });
      }
      await save.mutateAsync({
        id: listing?.id,
        target: subject.kind === 'car' ? { car_id: subject.id } : { job_id: subject.id },
        values: {
          is_public: values.is_public,
          customer_agreed: values.customer_agreed,
          title_hr: values.title_hr,
          title_en: text(values.title_en),
          summary_hr: text(values.summary_hr),
          summary_en: text(values.summary_en),
          story_hr: text(values.story_hr),
          story_en: text(values.story_en),
          show_year: values.show_year,
          show_engine: values.show_engine,
          show_fuel: values.show_fuel,
          show_mileage: values.show_mileage,
          pinned: values.pinned,
          slug: values.slug,
        },
      });
      const wasPublic = listing?.is_public ?? false;
      if (!values.is_public && !wasPublic) {
        toast.success('Saved (not shown on the website)');
        goBack(subject.back);
        return;
      }
      toast.success(values.is_public ? 'Saved. It shows on the website after the next publish.' : 'Saved. Publish to take it off the website.', {
        duration: 8000,
        action: {
          label: 'Publish now',
          onClick: () =>
            publishWebsite().then(
              () => toast.success('Publishing. The website updates in 2–3 minutes.'),
              (e) => toast.error(syncErrorMessage(e)),
            ),
        },
      });
      goBack(subject.back);
    } catch (e) {
      const err = e as { code?: string };
      toast.error(err?.code === '23505' ? 'Another car already uses this address' : syncErrorMessage(e));
    }
  });

  const deleteListing = async () => {
    if (!listing) return;
    try {
      for (const photo of photos.filter((p) => p.on_website)) await setOnWebsite.mutateAsync({ photo, on: false });
      await remove.mutateAsync(listing.id);
      toast.success('Taken off the website');
      goBack(subject.back);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  const checkbox = (name: 'customer_agreed' | 'pinned' | 'show_year' | 'show_engine' | 'show_fuel' | 'show_mileage', label: string, hint?: string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <label className="flex items-start gap-3 text-sm">
          <span className="pt-0.5">
            <Checkbox checked={field.value} onChange={field.onChange} />
          </span>
          <span>
            {label}
            {hint && <span className="block text-muted-foreground">{hint}</span>}
          </span>
        </label>
      )}
    />
  );

  const specs = [
    { name: 'show_year' as const, label: 'Year', value: subject.year != null ? String(subject.year) : null },
    { name: 'show_engine' as const, label: 'Engine', value: subject.engine },
    { name: 'show_fuel' as const, label: 'Fuel', value: subject.fuel },
    { name: 'show_mileage' as const, label: 'Mileage', value: subject.mileage != null ? `${formatInteger(subject.mileage)} km` : null },
  ].filter((s) => s.value);
  const needsAgreement = subject.kind === 'job' && !agreed;
  const site = websiteBase();
  const t = (hr: string, en: string) => (lang === 'hr' ? hr : en);

  return (
    <>
      <PageHeader title={`${subject.ref} on the website`} back={subject.back} />
      <PageBody>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            {subject.kind === 'job' && (
              <Field data-invalid={!!errors.customer_agreed}>
                {checkbox('customer_agreed', 'The customer agreed to have their car on the website', 'Their name, plate and the price are never shown.')}
                <FieldError errors={[errors.customer_agreed]} />
              </Field>
            )}
            <label className={cn('flex items-center gap-3 rounded-xl border p-4', isPublic && 'border-primary')}>
              <Controller
                control={form.control}
                name="is_public"
                render={({ field }) => <Switch checked={field.value} disabled={needsAgreement && !field.value} onCheckedChange={field.onChange} />}
              />
              <span className="flex-1">
                <span className="block font-medium">Show on the website</span>
                <span className="block text-sm text-muted-foreground">
                  {needsAgreement ? 'Tick the customer’s permission first.' : isPublic ? 'Shown after the next publish.' : 'Not shown. Texts and photos are kept.'}
                </span>
              </span>
            </label>
            {subject.kind === 'car' && (
              <p className="-mt-2 text-sm text-muted-foreground">
                {subject.status === 'listed'
                  ? `It is for sale, so it also shows under “For sale” with the asking price${subject.askingPrice != null ? ` (${formatMoney(subject.askingPrice)})` : ''}.`
                  : 'Once the car is “Listed”, it also shows under “For sale” with its asking price.'}
              </p>
            )}

            <FieldSet>
              <div className="flex items-center justify-between gap-2">
                <FieldLegend className="mb-0">Texts</FieldLegend>
                <LangToggle value={lang} onChange={setLang} />
              </div>
              {lang === 'en' && <FieldDescription>Leave an English text empty to show the Croatian one.</FieldDescription>}
              <Field data-invalid={!!errors[`title_${lang}`]}>
                <FieldLabel htmlFor="w-title">{t('Title', 'Title (English)')}</FieldLabel>
                <Input
                  key={`title-${lang}`}
                  id="w-title"
                  {...form.register(`title_${lang}`, {
                    onChange: (e) => {
                      if (lang === 'hr' && !slugEdited) form.setValue('slug', uniqueSlug(slugify([e.target.value, subject.year].filter(Boolean).join(' ')), taken));
                    },
                  })}
                />
                <FieldError errors={[errors[`title_${lang}`]]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="w-summary">{t('Short line under the title', 'Short line (English)')}</FieldLabel>
                <Input key={`summary-${lang}`} id="w-summary" placeholder={t('npr. Remont motora i novo lakiranje', 'e.g. Engine rebuild and new paint')} {...form.register(`summary_${lang}`)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="w-story">{t('What we did', 'What we did (English)')}</FieldLabel>
                <Textarea key={`story-${lang}`} id="w-story" rows={6} {...form.register(`story_${lang}`)} />
              </Field>
            </FieldSet>

            {specs.length > 0 && (
              <FieldSet>
                <FieldLegend>Details to show</FieldLegend>
                <div className="grid grid-cols-2 gap-3">
                  {specs.map((s) => (
                    <div key={s.name}>{checkbox(s.name, s.label, s.value ?? undefined)}</div>
                  ))}
                </div>
              </FieldSet>
            )}

            <FieldSet>
              <div className="flex items-center justify-between gap-2">
                <FieldLegend className="mb-0">Photos on the website</FieldLegend>
                {photos.length > 0 && (
                  <span className="flex gap-1">
                    <Button type="button" variant="outline" size="sm" disabled={chosen.length === photos.length} onClick={() => setPhotos(photos.map((p) => p.id))}>
                      Select all
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={chosen.length === 0} onClick={() => setPhotos([])}>
                      None
                    </Button>
                  </span>
                )}
              </div>
              <FieldDescription>
                Tap to choose. {chosen.length} of {photos.length} chosen. Check them for licence plates and people first.
              </FieldDescription>
              {photos.length === 0 && <p className="text-sm text-muted-foreground">No photos yet. Add them on the {subject.kind} page.</p>}
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {photos.map((p) => {
                  const on = photoIds.includes(p.id);
                  const link = links?.[p.id];
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePhoto(p.id)}
                      aria-pressed={on}
                      className={cn('relative aspect-square overflow-hidden rounded-lg bg-muted', on ? 'ring-3 ring-primary' : 'opacity-60')}
                    >
                      {link ? <img src={link.thumb ?? link.full} alt="" loading="lazy" className="size-full object-cover" /> : <Loader2 className="m-auto size-5 animate-spin text-muted-foreground" />}
                      {on && (
                        <span className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-4" />
                        </span>
                      )}
                      {sideOf(p) && (
                        <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white uppercase">
                          {sideOf(p) === 'before' ? 'Before' : 'After'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Before / after</FieldLegend>
              {pairs.length > 0 ? (
                <>
                  <FieldDescription>
                    {pairs.length === 1 ? 'One pair' : `${pairs.length} pairs`} from the Before and After albums: the 1st Before photo with the
                    1st After photo, and so on, in the order they were added. On the website, visitors drag a line across to compare.
                  </FieldDescription>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
                    {pairs.map(([before, after], i) => (
                      <div key={before.id} className="flex items-center gap-1">
                        <span className="w-4 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                        {[before, after].map((p) => {
                          const link = links?.[p.id];
                          return (
                            <span key={p.id} className="aspect-square flex-1 overflow-hidden rounded-md bg-muted">
                              {link && <img src={link.thumb ?? link.full} alt="" loading="lazy" className="size-full object-cover" />}
                            </span>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <FieldDescription>
                  {albumPhotos.length > 0
                    ? 'Choose photos from both the Before and After albums above to get a before/after slider.'
                    : `Put photos into the Before and After albums on the ${subject.kind} page to get a before/after slider.`}
                </FieldDescription>
              )}
            </FieldSet>

            {checkbox('pinned', 'Show it first', 'Pinned cars come before the others on the website.')}

            <Field data-invalid={!!errors.slug}>
              <FieldLabel htmlFor="w-slug">Web address</FieldLabel>
              <Input id="w-slug" className="font-mono" autoCapitalize="none" {...form.register('slug', { onChange: () => setSlugEdited(true) })} />
              <FieldDescription className="break-all">
                {site}auti/{form.watch('slug') || '…'}/
              </FieldDescription>
              <FieldError errors={[errors.slug]} />
            </Field>

            <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="animate-spin" />}
              Save
            </Button>
            {listing && (
              <ConfirmButton
                variant="ghost"
                className="text-destructive"
                title="Remove from the website?"
                description="The texts written for the website are deleted and its photos are taken off the website. The car or job itself stays."
                confirmLabel="Remove"
                onConfirm={deleteListing}
              >
                <Trash2 /> Remove from the website
              </ConfirmButton>
            )}
          </FieldGroup>
        </form>
      </PageBody>
    </>
  );
}
