// Drawers on More → Website (admins): texts, contact buttons, opening hours, services, reviews.
import { useEffect, useState, type FormEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Checkbox } from '@/components/Checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { cleanPhone, PHONE_PATTERN, shortTime, WEEKDAYS } from '@/domain/website';
import { syncErrorMessage } from '@/lib/errors';
import {
  useDeleteWebsiteRow,
  useSaveWebsiteRow,
  useUpdateWebsiteHours,
  useUpdateWebsiteSettings,
  type WebsiteContact,
  type WebsiteHours,
  type WebsiteReview,
  type WebsiteService,
  type WebsiteSettings,
} from './api';
import { LangToggle, type Lang } from './LangToggle';

const text = (v: string) => v.trim() || null;
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https:\/\/\S+$/.test(v), 'A full link starting with https://');

function SubmitButton({ busy, children }: { busy: boolean; children: string }) {
  return (
    <Button type="submit" size="lg" disabled={busy}>
      {busy && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

function DeleteRow({ what, onConfirm }: { what: string; onConfirm: () => Promise<void> }) {
  return (
    <ConfirmButton variant="ghost" className="text-destructive" title={`Delete this ${what}?`} confirmLabel="Delete" onConfirm={onConfirm}>
      <Trash2 /> Delete
    </ConfirmButton>
  );
}

// ---------------------------------------------------------------------------
// Texts
// ---------------------------------------------------------------------------
const textsSchema = z.object({
  headline_hr: z.string().max(120),
  headline_en: z.string().max(120),
  intro_hr: z.string().max(400),
  intro_en: z.string().max(400),
  about_hr: z.string().max(3000),
  about_en: z.string().max(3000),
  hours_note_hr: z.string().max(200),
  hours_note_en: z.string().max(200),
  map_url: httpsUrl,
  instagram_url: httpsUrl,
  facebook_url: httpsUrl,
});
type TextsValues = z.infer<typeof textsSchema>;

function textsDefaults(s: WebsiteSettings): TextsValues {
  return {
    headline_hr: s.headline_hr ?? '',
    headline_en: s.headline_en ?? '',
    intro_hr: s.intro_hr ?? '',
    intro_en: s.intro_en ?? '',
    about_hr: s.about_hr ?? '',
    about_en: s.about_en ?? '',
    hours_note_hr: s.hours_note_hr ?? '',
    hours_note_en: s.hours_note_en ?? '',
    map_url: s.map_url ?? '',
    instagram_url: s.instagram_url ?? '',
    facebook_url: s.facebook_url ?? '',
  };
}

export function TextsDrawer({ settings, open, onOpenChange }: { settings: WebsiteSettings; open: boolean; onOpenChange: (open: boolean) => void }) {
  const update = useUpdateWebsiteSettings();
  const [lang, setLang] = useState<Lang>('hr');
  const form = useForm<TextsValues>({ resolver: zodResolver(textsSchema), defaultValues: textsDefaults(settings) });
  const { errors } = form.formState;
  useEffect(() => {
    if (open) form.reset(textsDefaults(settings));
  }, [open, settings, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await update.mutateAsync({
        headline_hr: text(v.headline_hr),
        headline_en: text(v.headline_en),
        intro_hr: text(v.intro_hr),
        intro_en: text(v.intro_en),
        about_hr: text(v.about_hr),
        about_en: text(v.about_en),
        hours_note_hr: text(v.hours_note_hr),
        hours_note_en: text(v.hours_note_en),
        map_url: text(v.map_url),
        instagram_url: text(v.instagram_url),
        facebook_url: text(v.facebook_url),
      });
      toast.success('Saved');
      onOpenChange(false);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Website texts">
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{lang === 'en' ? 'Empty: the Croatian text is shown.' : 'Croatian is the main language.'}</span>
            <LangToggle value={lang} onChange={setLang} />
          </div>
          <Field>
            <FieldLabel htmlFor="t-headline">Headline at the top</FieldLabel>
            <Input key={`h-${lang}`} id="t-headline" {...form.register(`headline_${lang}`)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="t-intro">A few words under it</FieldLabel>
            <Textarea key={`i-${lang}`} id="t-intro" rows={3} {...form.register(`intro_${lang}`)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="t-about">About us</FieldLabel>
            <Textarea key={`a-${lang}`} id="t-about" rows={6} {...form.register(`about_${lang}`)} />
            <FieldDescription>Who you are, since when, what you like working on. Empty: no “About us” section.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="t-hours">Note under the opening hours</FieldLabel>
            <Input key={`n-${lang}`} id="t-hours" {...form.register(`hours_note_${lang}`)} />
          </Field>
          <FieldSet>
            <FieldLegend>Links</FieldLegend>
            {(
              [
                ['map_url', 'Google Maps', 'Empty: the button searches for the address from Workshop settings.'],
                ['instagram_url', 'Instagram', undefined],
                ['facebook_url', 'Facebook', undefined],
              ] as const
            ).map(([name, label, hint]) => (
              <Field key={name} data-invalid={!!errors[name]}>
                <FieldLabel htmlFor={`t-${name}`}>{label}</FieldLabel>
                <Input id={`t-${name}`} inputMode="url" autoCapitalize="none" placeholder="https://" {...form.register(name)} />
                {hint && <FieldDescription>{hint}</FieldDescription>}
                <FieldError errors={[errors[name]]} />
              </Field>
            ))}
          </FieldSet>
          <SubmitButton busy={form.formState.isSubmitting}>Save</SubmitButton>
        </FieldGroup>
      </form>
    </FormDrawer>
  );
}

// ---------------------------------------------------------------------------
// Contact buttons
// ---------------------------------------------------------------------------
const contactSchema = z
  .object({
    name: z.string().trim().min(1, 'A name is needed').max(40),
    phone: z
      .string()
      .transform(cleanPhone)
      .refine((v) => PHONE_PATTERN.test(v), 'Start with the country code, e.g. +385 91 234 5678'),
    call: z.boolean(),
    whatsapp: z.boolean(),
    viber: z.boolean(),
  })
  .refine((v) => v.call || v.whatsapp || v.viber, { path: ['call'], message: 'Pick at least one button' });
type ContactInput = z.input<typeof contactSchema>;

export function ContactDrawer({
  target,
  lastSort,
  onClose,
}: {
  target: WebsiteContact | 'new' | null;
  lastSort: number;
  onClose: () => void;
}) {
  const save = useSaveWebsiteRow('website_contacts');
  const remove = useDeleteWebsiteRow('website_contacts');
  const row = target && target !== 'new' ? target : null;
  const form = useForm<ContactInput, unknown, z.output<typeof contactSchema>>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', phone: '+385 ', call: true, whatsapp: true, viber: false },
  });
  const { errors } = form.formState;
  useEffect(() => {
    if (target) form.reset(row ? { name: row.name, phone: row.phone, call: row.call, whatsapp: row.whatsapp, viber: row.viber } : { name: '', phone: '+385 ', call: true, whatsapp: true, viber: false });
  }, [target, row, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({ id: row?.id, values, lastSort });
      onClose();
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  });

  return (
    <FormDrawer open={target !== null} onOpenChange={(o) => !o && onClose()} title={row ? 'Contact button' : 'New contact button'}>
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="c-name">Name</FieldLabel>
            <Input id="c-name" placeholder="David" {...form.register('name')} />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field data-invalid={!!errors.phone}>
            <FieldLabel htmlFor="c-phone">Number</FieldLabel>
            <Input id="c-phone" type="tel" inputMode="tel" {...form.register('phone')} />
            <FieldDescription>With the country code, so WhatsApp and Viber work.</FieldDescription>
            <FieldError errors={[errors.phone]} />
          </Field>
          <FieldSet>
            <FieldLegend variant="label">Buttons on the website</FieldLegend>
            {(
              [
                ['call', 'Call'],
                ['whatsapp', 'WhatsApp'],
                ['viber', 'Viber'],
              ] as const
            ).map(([name, label]) => (
              <Controller
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <label className="flex items-center gap-3 text-sm">
                    <Checkbox checked={field.value} onChange={field.onChange} />
                    {label}
                  </label>
                )}
              />
            ))}
            <FieldError errors={[errors.call]} />
          </FieldSet>
          <SubmitButton busy={form.formState.isSubmitting}>{row ? 'Save' : 'Add'}</SubmitButton>
          {row && (
            <DeleteRow
              what="contact button"
              onConfirm={async () => {
                try {
                  await remove.mutateAsync(row.id);
                  onClose();
                } catch (e) {
                  toast.error(syncErrorMessage(e));
                }
              }}
            />
          )}
        </FieldGroup>
      </form>
    </FormDrawer>
  );
}

// ---------------------------------------------------------------------------
// Opening hours
// ---------------------------------------------------------------------------
interface DayValues {
  weekday: number;
  open: boolean;
  opens: string;
  closes: string;
}

function toDays(hours: WebsiteHours[]): DayValues[] {
  return hours.map((h) => ({ weekday: h.weekday, open: Boolean(h.opens), opens: shortTime(h.opens) || '08:00', closes: shortTime(h.closes) || '16:00' }));
}

export function HoursDrawer({ hours, open, onOpenChange }: { hours: WebsiteHours[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const update = useUpdateWebsiteHours();
  const [days, setDays] = useState<DayValues[]>(() => toDays(hours));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setDays(toDays(hours));
      setError(null);
    }
  }, [open, hours]);

  const set = (weekday: number, patch: Partial<DayValues>) => setDays((all) => all.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const wrong = days.find((d) => d.open && !(d.opens && d.closes && d.opens < d.closes));
    if (wrong) {
      setError(`${WEEKDAYS[wrong.weekday - 1]}: the closing time must come after the opening time.`);
      return;
    }
    try {
      const changed = days.filter((d) => {
        const old = hours.find((h) => h.weekday === d.weekday);
        return shortTime(old?.opens ?? null) !== (d.open ? d.opens : '') || shortTime(old?.closes ?? null) !== (d.open ? d.closes : '');
      });
      await update.mutateAsync(changed.map((d) => ({ weekday: d.weekday, opens: d.open ? d.opens : null, closes: d.open ? d.closes : null })));
      toast.success('Saved');
      onOpenChange(false);
    } catch (err) {
      toast.error(syncErrorMessage(err));
    }
  };

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title="Opening hours">
      <form onSubmit={submit} noValidate>
        <FieldGroup>
          <ul className="flex flex-col gap-3">
            {days.map((d) => (
              <li key={d.weekday} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <label className="flex w-36 items-center gap-3 text-sm font-medium">
                  <Checkbox checked={d.open} onChange={(v) => set(d.weekday, { open: v })} />
                  {WEEKDAYS[d.weekday - 1]}
                </label>
                {d.open ? (
                  <span className="flex items-center gap-1.5">
                    <Input type="time" className="w-28" value={d.opens} onChange={(e) => set(d.weekday, { opens: e.target.value })} aria-label="Opens" />
                    –
                    <Input type="time" className="w-28" value={d.closes} onChange={(e) => set(d.weekday, { closes: e.target.value })} aria-label="Closes" />
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Closed</span>
                )}
              </li>
            ))}
          </ul>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <SubmitButton busy={update.isPending}>Save</SubmitButton>
        </FieldGroup>
      </form>
    </FormDrawer>
  );
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------
const serviceSchema = z.object({
  title_hr: z.string().trim().min(1, 'A name is needed').max(80),
  title_en: z.string().trim().max(80),
  text_hr: z.string().trim().max(600),
  text_en: z.string().trim().max(600),
});
type ServiceValues = z.infer<typeof serviceSchema>;

export function ServiceDrawer({ target, lastSort, onClose }: { target: WebsiteService | 'new' | null; lastSort: number; onClose: () => void }) {
  const save = useSaveWebsiteRow('website_services');
  const remove = useDeleteWebsiteRow('website_services');
  const row = target && target !== 'new' ? target : null;
  const [lang, setLang] = useState<Lang>('hr');
  const form = useForm<ServiceValues>({ resolver: zodResolver(serviceSchema), defaultValues: { title_hr: '', title_en: '', text_hr: '', text_en: '' } });
  const { errors } = form.formState;
  useEffect(() => {
    if (!target) return;
    setLang('hr');
    form.reset({ title_hr: row?.title_hr ?? '', title_en: row?.title_en ?? '', text_hr: row?.text_hr ?? '', text_en: row?.text_en ?? '' });
  }, [target, row, form]);

  const onSubmit = form.handleSubmit(
    async (v) => {
      try {
        await save.mutateAsync({ id: row?.id, values: { title_hr: v.title_hr, title_en: text(v.title_en), text_hr: text(v.text_hr), text_en: text(v.text_en) }, lastSort });
        onClose();
      } catch (e) {
        toast.error(syncErrorMessage(e));
      }
    },
    () => setLang('hr'),
  );

  return (
    <FormDrawer open={target !== null} onOpenChange={(o) => !o && onClose()} title={row ? 'Service' : 'New service'}>
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <div className="flex justify-end">
            <LangToggle value={lang} onChange={setLang} />
          </div>
          <Field data-invalid={!!errors[`title_${lang}`]}>
            <FieldLabel htmlFor="s-title">Name</FieldLabel>
            <Input key={`t-${lang}`} id="s-title" placeholder={lang === 'hr' ? 'npr. Limarija i lakiranje' : 'e.g. Bodywork and paint'} {...form.register(`title_${lang}`)} />
            <FieldError errors={[errors[`title_${lang}`]]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="s-text">A few words</FieldLabel>
            <Textarea key={`x-${lang}`} id="s-text" rows={3} {...form.register(`text_${lang}`)} />
            {lang === 'en' && <FieldDescription>Empty: the Croatian text is shown.</FieldDescription>}
          </Field>
          <SubmitButton busy={form.formState.isSubmitting}>{row ? 'Save' : 'Add'}</SubmitButton>
          {row && (
            <DeleteRow
              what="service"
              onConfirm={async () => {
                try {
                  await remove.mutateAsync(row.id);
                  onClose();
                } catch (e) {
                  toast.error(syncErrorMessage(e));
                }
              }}
            />
          )}
        </FieldGroup>
      </form>
    </FormDrawer>
  );
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------
const reviewSchema = z.object({
  author: z.string().trim().min(1, 'Who said it?').max(60),
  stars: z.string(),
  text_hr: z.string().trim().min(1, 'What did they say?').max(800),
  text_en: z.string().trim().max(800),
});
type ReviewValues = z.infer<typeof reviewSchema>;

export function ReviewDrawer({ target, lastSort, onClose }: { target: WebsiteReview | 'new' | null; lastSort: number; onClose: () => void }) {
  const save = useSaveWebsiteRow('website_reviews');
  const remove = useDeleteWebsiteRow('website_reviews');
  const row = target && target !== 'new' ? target : null;
  const [lang, setLang] = useState<Lang>('hr');
  const form = useForm<ReviewValues>({ resolver: zodResolver(reviewSchema), defaultValues: { author: '', stars: '5', text_hr: '', text_en: '' } });
  const { errors } = form.formState;
  useEffect(() => {
    if (!target) return;
    setLang('hr');
    form.reset({ author: row?.author ?? '', stars: row ? String(row.stars ?? '') : '5', text_hr: row?.text_hr ?? '', text_en: row?.text_en ?? '' });
  }, [target, row, form]);

  const onSubmit = form.handleSubmit(
    async (v) => {
      try {
        await save.mutateAsync({
          id: row?.id,
          values: { author: v.author, stars: v.stars ? Number(v.stars) : null, text_hr: v.text_hr, text_en: text(v.text_en) },
          lastSort,
        });
        onClose();
      } catch (e) {
        toast.error(syncErrorMessage(e));
      }
    },
    () => setLang('hr'),
  );

  return (
    <FormDrawer open={target !== null} onOpenChange={(o) => !o && onClose()} title={row ? 'Review' : 'New review'}>
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field data-invalid={!!errors.author}>
            <FieldLabel htmlFor="r-author">From</FieldLabel>
            <Input id="r-author" placeholder="Marko, VW Golf IV" {...form.register('author')} />
            <FieldDescription>As shown on the website. Ask the customer before using their name.</FieldDescription>
            <FieldError errors={[errors.author]} />
          </Field>
          <Field>
            <FieldLabel>Stars</FieldLabel>
            <Controller
              control={form.control}
              name="stars"
              render={({ field }) => (
                <ToggleGroup type="single" variant="outline" spacing={2} className="flex flex-wrap" value={field.value} onValueChange={(v) => field.onChange(v)}>
                  {['1', '2', '3', '4', '5'].map((n) => (
                    <ToggleGroupItem key={n} value={n} className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                      {n} ★
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
            <FieldDescription>Tap the chosen one again for no stars.</FieldDescription>
          </Field>
          <div className="flex justify-end">
            <LangToggle value={lang} onChange={setLang} />
          </div>
          <Field data-invalid={!!errors[`text_${lang}`]}>
            <FieldLabel htmlFor="r-text">{lang === 'hr' ? 'What they said' : 'In English (optional)'}</FieldLabel>
            <Textarea key={`r-${lang}`} id="r-text" rows={4} {...form.register(`text_${lang}`)} />
            {lang === 'en' && <FieldDescription>Empty: the original text is shown.</FieldDescription>}
            <FieldError errors={[errors[`text_${lang}`]]} />
          </Field>
          <SubmitButton busy={form.formState.isSubmitting}>{row ? 'Save' : 'Add'}</SubmitButton>
          {row && (
            <DeleteRow
              what="review"
              onConfirm={async () => {
                try {
                  await remove.mutateAsync(row.id);
                  onClose();
                } catch (e) {
                  toast.error(syncErrorMessage(e));
                }
              }}
            />
          )}
        </FieldGroup>
      </form>
    </FormDrawer>
  );
}
