// More → Website: what the public website shows. Members see it; admins change the texts and lists.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ChevronRight, ExternalLink, Globe, Loader2, Pencil, Plus, Star, Upload } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/domain/dates';
import { shortTime, WEEKDAYS } from '@/domain/website';
import { syncErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useCurrentProfile } from '@/features/auth/profiles';
import { PhotoSection } from '@/features/files/Photos';
import {
  usePublishWebsite,
  useSwapWebsiteRows,
  useWebsiteCars,
  useWebsiteHours,
  useWebsiteList,
  useWebsiteSettings,
  useWebsiteStatus,
  type WebsiteContact,
  type WebsiteList,
  type WebsiteReview,
  type WebsiteService,
} from './api';
import { ContactDrawer, HoursDrawer, ReviewDrawer, ServiceDrawer, TextsDrawer } from './WebsiteDrawers';
import { websiteBase } from './links';

export function WebsitePage() {
  const admin = useCurrentProfile().role === 'admin';
  const settings = useWebsiteSettings();
  const hours = useWebsiteHours();
  const cars = useWebsiteCars();
  const contacts = useWebsiteList('website_contacts');
  const services = useWebsiteList('website_services');
  const reviews = useWebsiteList('website_reviews');
  const [editingTexts, setEditingTexts] = useState(false);
  const [editingHours, setEditingHours] = useState(false);
  const [contact, setContact] = useState<WebsiteContact | 'new' | null>(null);
  const [service, setService] = useState<WebsiteService | 'new' | null>(null);
  const [review, setReview] = useState<WebsiteReview | 'new' | null>(null);
  const site = websiteBase();
  const lastSort = (rows: { sort_order: number }[] | undefined) => Math.max(0, ...(rows ?? []).map((r) => r.sort_order));

  const s = settings.data;
  const shown = (cars.data ?? []).filter((c) => c.is_public);
  const hidden = (cars.data ?? []).filter((c) => !c.is_public);

  return (
    <>
      <PageHeader title="Website" back="/more" />
      <PageBody>
        <PublishCard site={site} />

        <Section title="Cars and jobs on the website">
          {cars.isPending && <Skeleton className="h-16 rounded-xl" />}
          {cars.isSuccess && cars.data.length === 0 && (
            <p className="text-sm text-muted-foreground">None yet. Open a car or job and tap “Website” to add it.</p>
          )}
          {cars.data && cars.data.length > 0 && (
            <ul className="divide-y overflow-hidden rounded-xl border">
              {[...shown, ...hidden].map((w) => {
                const ref = w.car?.ref ?? w.job?.ref ?? '';
                const to = w.car_id ? `/cars/${w.car_id}/website` : `/jobs/${w.job_id}/website`;
                return (
                  <li key={w.id}>
                    <Link to={to} className="flex items-center gap-3 px-4 py-3 active:bg-muted">
                      <Globe className={cn('size-5', w.is_public ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {w.pinned && <Star className="mr-1 inline size-3.5 fill-amber-400 text-amber-400" />}
                          {w.title_hr}
                        </span>
                        <span className="block text-sm text-muted-foreground">
                          {ref} · {w.is_public ? (w.car?.status === 'listed' ? 'shown, for sale' : 'shown') : 'not shown'}
                        </span>
                      </span>
                      <ChevronRight className="size-5 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="Texts" action={admin && s && <EditButton onClick={() => setEditingTexts(true)} />}>
          {s ? (
            <Card>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p className="text-base font-semibold">{s.headline_hr || '—'}</p>
                {s.intro_hr && <p className="text-muted-foreground">{s.intro_hr}</p>}
                <p className="line-clamp-3">{s.about_hr ? <>About us: {s.about_hr}</> : <span className="text-muted-foreground">No “About us” text yet.</span>}</p>
                <p className="text-xs text-muted-foreground">
                  English: {[s.headline_en, s.intro_en, s.about_en].filter(Boolean).length ? 'written' : 'not written yet (the Croatian texts are shown)'}
                  {[s.instagram_url, s.facebook_url].some(Boolean) && ` · links: ${[s.instagram_url && 'Instagram', s.facebook_url && 'Facebook'].filter(Boolean).join(', ')}`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Skeleton className="h-24 rounded-xl" />
          )}
        </Section>

        <Section title="Contact buttons" action={admin && <AddButton onClick={() => setContact('new')} />}>
          <OrderedRows
            table="website_contacts"
            rows={contacts.data}
            admin={admin}
            empty="No contact buttons yet: visitors can't call or message you."
            render={(c) => ({
              title: c.name,
              subtitle: `${c.phone} · ${[c.call && 'call', c.whatsapp && 'WhatsApp', c.viber && 'Viber'].filter(Boolean).join(', ')}`,
            })}
            onOpen={setContact}
          />
        </Section>

        <Section title="Opening hours" action={admin && hours.data && <EditButton onClick={() => setEditingHours(true)} />}>
          {hours.data ? (
            <Card>
              <CardContent className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                {hours.data.map((h) => (
                  <HoursRow key={h.weekday} day={WEEKDAYS[h.weekday - 1]} value={h.opens ? `${shortTime(h.opens)}–${shortTime(h.closes)}` : 'closed'} />
                ))}
                {s?.hours_note_hr && <p className="col-span-2 mt-1 text-muted-foreground">{s.hours_note_hr}</p>}
              </CardContent>
            </Card>
          ) : (
            <Skeleton className="h-32 rounded-xl" />
          )}
        </Section>

        <Section title="Services" action={admin && <AddButton onClick={() => setService('new')} />}>
          <OrderedRows
            table="website_services"
            rows={services.data}
            admin={admin}
            empty="No services yet."
            render={(r) => ({ title: r.title_hr, subtitle: r.text_hr ?? '' })}
            onOpen={setService}
          />
        </Section>

        <Section title="Reviews" action={admin && <AddButton onClick={() => setReview('new')} />}>
          <OrderedRows
            table="website_reviews"
            rows={reviews.data}
            admin={admin}
            empty="No reviews yet."
            render={(r) => ({ title: `${r.author}${r.stars ? ` · ${'★'.repeat(r.stars)}` : ''}`, subtitle: r.text_hr })}
            onOpen={setReview}
          />
        </Section>

        {admin && s && (
          <div className="flex flex-col gap-1">
            <PhotoSection entityType="website" entityId={s.photos_id} title="Photos of the workshop" />
            <p className="text-xs text-muted-foreground">
              Shown under “About us”. The favorite (★) is the big photo at the top of the website.
            </p>
          </div>
        )}

        {admin && s && <TextsDrawer settings={s} open={editingTexts} onOpenChange={setEditingTexts} />}
        {admin && hours.data && <HoursDrawer hours={hours.data} open={editingHours} onOpenChange={setEditingHours} />}
        {admin && <ContactDrawer target={contact} lastSort={lastSort(contacts.data)} onClose={() => setContact(null)} />}
        {admin && <ServiceDrawer target={service} lastSort={lastSort(services.data)} onClose={() => setService(null)} />}
        {admin && <ReviewDrawer target={review} lastSort={lastSort(reviews.data)} onClose={() => setReview(null)} />}
      </PageBody>
    </>
  );
}

/** Publish button and how the latest website build went. */
function PublishCard({ site }: { site: string }) {
  const publish = usePublishWebsite();
  // the run that was the latest when Publish was pressed; until GitHub lists a newer one, it is "starting"
  const [startedFrom, setStartedFrom] = useState<string | null | undefined>(undefined);
  const waiting = startedFrom !== undefined;
  const status = useWebsiteStatus(waiting);
  const run = status.data;
  const isNew = waiting && run && run.url !== startedFrom;
  const running = waiting && (!isNew || run.status !== 'completed');
  if (waiting && isNew && run.status === 'completed') setStartedFrom(undefined);

  const onPublish = async () => {
    try {
      await publish.mutateAsync();
      setStartedFrom(run?.url ?? null);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  let line: ReactNode = null;
  if (running) line = <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Publishing… usually 2–3 minutes.</span>;
  else if (status.error) line = <span className="text-muted-foreground">{status.error.message}</span>;
  else if (run?.status === 'completed' && run.conclusion === 'success') line = <span className="text-success">Live since {formatDateTime(run.updated)}.</span>;
  else if (run?.status === 'completed' && run.conclusion === 'cancelled') line = <span className="text-muted-foreground">The last publish was replaced by a newer one.</span>;
  else if (run?.status === 'completed')
    line = (
      <span className="text-destructive">
        The last publish failed ({formatDateTime(run.updated)}).{' '}
        <a href={run.url} target="_blank" rel="noreferrer" className="underline">
          Details on GitHub
        </a>
      </span>
    );
  else if (run) line = <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Publishing…</span>;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p>The public website shows the cars and jobs you choose, and the texts below. Changes show on it after you publish.</p>
        {line && <p>{line}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={onPublish} disabled={publish.isPending || running}>
            {publish.isPending ? <Loader2 className="animate-spin" /> : <Upload />} Publish
          </Button>
          <Button variant="outline" asChild>
            <a href={site} target="_blank" rel="noreferrer">
              <ExternalLink /> Open
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      <Pencil /> Edit
    </Button>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      <Plus /> Add
    </Button>
  );
}

function HoursRow({ day, value }: { day: string; value: string }) {
  return (
    <>
      <span>{day}</span>
      <span className={cn('tabular-nums', value === 'closed' && 'text-muted-foreground')}>{value}</span>
    </>
  );
}

/** A small list in the order the website shows it; admins tap a row to edit it and move rows with ↑ ↓. */
function OrderedRows<T extends { id: string; sort_order: number }>({
  table,
  rows,
  admin,
  empty,
  render,
  onOpen,
}: {
  table: WebsiteList;
  rows: T[] | undefined;
  admin: boolean;
  empty: string;
  render: (row: T) => { title: string; subtitle: string };
  onOpen: (row: T) => void;
}) {
  const swap = useSwapWebsiteRows(table);
  if (!rows) return <Skeleton className="h-16 rounded-xl" />;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const move = async (i: number, j: number) => {
    try {
      await swap.mutateAsync([rows[i], rows[j]]);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };
  return (
    <ul className="divide-y overflow-hidden rounded-xl border">
      {rows.map((row, i) => {
        const { title, subtitle } = render(row);
        return (
          <li key={row.id} className="flex items-center">
            <button type="button" disabled={!admin} onClick={() => onOpen(row)} className="min-w-0 flex-1 px-4 py-3 text-left active:bg-muted disabled:active:bg-transparent">
              <span className="block truncate font-medium">{title}</span>
              {subtitle && <span className="block truncate text-sm text-muted-foreground">{subtitle}</span>}
            </button>
            {admin && rows.length > 1 && (
              <span className="flex pr-1">
                <Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0 || swap.isPending} onClick={() => move(i, i - 1)}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Move down" disabled={i === rows.length - 1 || swap.isPending} onClick={() => move(i, i + 1)}>
                  <ArrowDown />
                </Button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
