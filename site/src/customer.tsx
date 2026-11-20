// The pages a key opens (docs/PLAN.md §11), in the website's look and plain HTML like render.tsx. The data comes from
// open_access_key() through the files function and never holds costs:
//   job      the work at the customer's prices, their payments, the ticked photos and the invoice
//   buyer    one car like its website page, with the asking price while it is for sale
//   owner    one car's history: what we did, the parts fitted (no prices), photos
//   website  the website, without the sections and cars the key hides
import type { ReactNode } from 'react';
import { formatDate } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { T, pick, type Lang } from './i18n';
import { formatKm, fuelName } from './format';
import { Badge, BeforeAfter, CarPage, ContactButtons, Frame, Gallery, Paragraphs, btnPrimary, doc, renderSite, type Page, type View } from './render';
import type { BuildContext, PhotoFiles, SiteCar, SiteContact, Snapshot } from './types';

export interface JobKeyView {
  kind: 'job';
  code: string;
  workshop: Snapshot['workshop'];
  contacts: SiteContact[];
  job: {
    ref: string;
    description: string;
    status: 'open' | 'done' | 'paid';
    received_on: string;
    done_on: string | null;
    car_make: string | null;
    car_model: string | null;
    car_plate: string | null;
    labor_cents: number;
    invoice_number: string | null;
    invoice_date: string | null;
    has_invoice: boolean;
    lines: { description: string; qty: number; unit: string | null; price_cents: number }[];
    payments: { date: string; amount_cents: number }[];
  };
  photos: { id: string; favorite: boolean }[];
}

export interface CarKeyView {
  kind: 'buyer' | 'owner';
  code: string;
  workshop: Snapshot['workshop'];
  contacts: SiteContact[];
  car: SiteCar & { plate: string | null };
  /** the owner's: bought for the car, or taken from stock (qty, unit) */
  parts: { date: string; description: string; qty: number | null; unit: string | null }[];
}

export interface WebsiteKeyView extends Snapshot {
  kind: 'website';
  code: string;
  hidden: string[];
}

export type KeyView = JobKeyView | CarKeyView | WebsiteKeyView;

/**
 * The pages of a key: "index.html" and "en/index.html", and for a website key every page of the website.
 * `ctx.base` is the key's own address ("#/k/K7M4QX9P/").
 */
export function renderKeyPages(view: KeyView, ctx: BuildContext, invoiceUrl: string | null): Page[] {
  const keyCtx: BuildContext = { ...ctx, customerView: true };
  if (view.kind === 'website') return renderSite(view, { ...keyCtx, hidden: view.hidden });
  const s = shell(view);
  const page = (lang: Lang, node: (v: View) => ReactNode): Page => ({
    path: lang === 'hr' ? 'index.html' : 'en/index.html',
    html: doc(node({ s, ctx: keyCtx, lang, t: T[lang] })),
  });
  return (['hr', 'en'] as const).map((lang) =>
    page(lang, (v) => {
      if (view.kind === 'job') return <JobKeyPage v={v} view={view} invoiceUrl={invoiceUrl} />;
      if (view.kind === 'buyer') return <CarPage v={v} car={view.car} alone />;
      return <OwnerPage v={v} view={view} />;
    }),
  );
}

/** What the website's frame (header, footer, call bar) needs from a snapshot; the rest stays empty. */
function shell(view: JobKeyView | CarKeyView): Snapshot {
  return {
    workshop: view.workshop,
    contacts: view.contacts,
    site: {
      headline_hr: null,
      headline_en: null,
      intro_hr: null,
      intro_en: null,
      about_hr: null,
      about_en: null,
      hours_note_hr: null,
      hours_note_en: null,
      map_url: null,
      instagram_url: null,
      facebook_url: null,
    },
    site_photos: [],
    services: [],
    reviews: [],
    hours: [],
    cars: [],
  };
}

const narrow = 'mx-auto w-full max-w-3xl px-4 sm:px-6';
const card = 'overflow-hidden rounded-2xl border border-line bg-card';
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const qtyText = (qty: number, unit: string | null) => (unit ? `${qty} ${unit}` : `${qty} ×`);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={`${narrow} mt-12`}>
      <h2 className="mb-4 text-2xl font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, strong, accent }: { label: ReactNode; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 px-5 py-3 ${strong ? 'text-lg font-bold' : ''} ${accent ? 'text-accent' : ''}`}>
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

function JobKeyPage({ v, view, invoiceUrl }: { v: View; view: JobKeyView; invoiceUrl: string | null }) {
  const { t, ctx, lang } = v;
  const k = t.key;
  const job = view.job;
  const car = [job.car_make, job.car_model].filter(Boolean).join(' ');
  const title = `${k.job} ${job.ref}`;
  const due = job.labor_cents + sum(job.lines.map((l) => l.price_cents));
  const paid = sum(job.payments.map((p) => p.amount_cents));
  const toPay = Math.max(0, due - paid);
  // the favorite first, then in the order they were taken
  const photos = [...view.photos]
    .sort((a, b) => Number(b.favorite) - Number(a.favorite))
    .filter((p) => ctx.photos[p.id])
    .map((p) => ({ ref: p, files: ctx.photos[p.id] }));
  const here = { hr: ctx.base, en: `${ctx.base}en/` };

  return (
    <Frame
      v={v}
      nav={[]}
      meta={{
        title: `${title} · ${view.workshop.name}`,
        description: car || title,
        path: here[lang],
        alternate: here[lang === 'hr' ? 'en' : 'hr'],
        noindex: true,
      }}
    >
      <section className={`${narrow} pt-10`}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={job.status === 'open' ? 'accent' : 'dark'}>{k.status[job.status] ?? job.status}</Badge>
          <span className="text-sm text-muted">
            {k.received} {formatDate(job.received_on)}
            {job.done_on && ` · ${k.finished} ${formatDate(job.done_on)}`}
          </span>
        </div>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">{car || title}</h1>
        <p className="mt-2 text-lg text-muted">{[job.car_plate, title].filter(Boolean).join(' · ')}</p>
      </section>

      {photos.length > 0 && (
        <section className={`${narrow} mt-8`}>
          <Gallery v={v} photos={photos} title={car || title} />
        </section>
      )}

      <Section title={job.status === 'open' ? k.whatWeDo : t.whatWeDid}>
        <Paragraphs text={job.description} className="space-y-3 text-lg leading-relaxed text-fg/90" />
      </Section>

      <Section title={k.workAndPrices}>
        <div className={card}>
          <div className="divide-y divide-line">
            {job.lines.map((l, i) => (
              <Row
                key={i}
                label={
                  <>
                    {l.description}
                    {(l.qty !== 1 || l.unit) && <span className="text-muted"> · {qtyText(l.qty, l.unit)}</span>}
                  </>
                }
                value={formatMoney(l.price_cents)}
              />
            ))}
            {job.labor_cents > 0 && <Row label={k.labor} value={formatMoney(job.labor_cents)} />}
          </div>
          <div className="border-t border-line bg-bg/40">
            <Row label={k.total} value={formatMoney(due)} strong />
          </div>
        </div>
      </Section>

      <Section title={k.payments}>
        <div className={card}>
          {job.payments.length === 0 ? (
            <p className="px-5 py-3 text-muted">{k.noPayments}</p>
          ) : (
            <div className="divide-y divide-line">
              {job.payments.map((p, i) => (
                <Row key={i} label={formatDate(p.date)} value={formatMoney(p.amount_cents)} />
              ))}
            </div>
          )}
          <div className="border-t border-line bg-bg/40">
            {job.payments.length > 0 && <Row label={k.paid} value={formatMoney(paid)} />}
            {toPay > 0 ? <Row label={k.toPay} value={formatMoney(toPay)} strong accent /> : due > 0 && <p className="px-5 py-3 font-semibold">{k.allPaid}</p>}
          </div>
        </div>
        {invoiceUrl && (
          <a href={invoiceUrl} target="_blank" rel="noopener" className={`${btnPrimary} mt-6`}>
            {k.downloadInvoice}
            {job.invoice_number && ` · ${job.invoice_number}`}
          </a>
        )}
      </Section>

      {view.contacts.length > 0 && (
        <Section title={k.questions}>
          <p className="mb-5 text-muted">{k.questionsLead}</p>
          <ContactButtons v={v} contacts={view.contacts} message={k.whatsappJob(job.ref)} />
        </Section>
      )}
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// The owner's page: their car's history
// ---------------------------------------------------------------------------

function OwnerPage({ v, view }: { v: View; view: CarKeyView }) {
  const { t, ctx, lang } = v;
  const k = t.key;
  const car = view.car;
  const title = pick(lang, car.title_hr, car.title_en);
  const story = pick(lang, car.story_hr, car.story_en);
  const photos = [...car.photos]
    .sort((a, b) => Number(b.favorite) - Number(a.favorite))
    .filter((p) => ctx.photos[p.id])
    .map((p) => ({ ref: p, files: ctx.photos[p.id] }));
  const pairs = car.pairs.flatMap((pair): [PhotoFiles, PhotoFiles][] =>
    ctx.photos[pair.before] && ctx.photos[pair.after] ? [[ctx.photos[pair.before], ctx.photos[pair.after]]] : [],
  );
  const specs = [
    car.plate && { label: k.plate, value: car.plate },
    car.year != null && { label: t.year, value: String(car.year) },
    car.engine && { label: t.engine, value: car.engine },
    car.fuel && { label: t.fuel, value: fuelName(car.fuel, t.fuels) },
    car.mileage_km != null && { label: t.mileage, value: formatKm(car.mileage_km) },
  ].filter(Boolean) as { label: string; value: string }[];
  const here = { hr: ctx.base, en: `${ctx.base}en/` };

  return (
    <Frame
      v={v}
      nav={[]}
      meta={{ title: `${title} · ${view.workshop.name}`, description: title, path: here[lang], alternate: here[lang === 'hr' ? 'en' : 'hr'], noindex: true }}
    >
      <section className={`${narrow} pt-10`}>
        <span className="text-sm font-semibold tracking-wide text-accent uppercase">{k.yourCar}</span>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
      </section>

      {photos.length > 0 && (
        <section className={`${narrow} mt-8`}>
          <Gallery v={v} photos={photos} title={title} />
        </section>
      )}

      {specs.length > 0 && (
        <section className={`${narrow} mt-8`}>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
            {specs.map((sp) => (
              <div key={sp.label} className="bg-card p-4">
                <dt className="text-xs tracking-wide text-muted uppercase">{sp.label}</dt>
                <dd className="mt-1 font-semibold">{sp.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {pairs.length > 0 && (
        <Section title={t.beforeAfter}>
          <BeforeAfter v={v} pairs={pairs} />
        </Section>
      )}

      {story && (
        <Section title={t.whatWeDid}>
          <Paragraphs text={story} className="space-y-3 text-lg leading-relaxed text-fg/90" />
        </Section>
      )}

      {view.parts.length > 0 && (
        <Section title={k.partsFitted}>
          <p className="-mt-2 mb-4 text-muted">{k.partsFittedLead}</p>
          <div className={`${card} divide-y divide-line`}>
            {view.parts.map((p, i) => (
              <Row
                key={i}
                label={
                  <>
                    {p.description}
                    {p.qty != null && (p.qty !== 1 || p.unit) && <span className="text-muted"> · {qtyText(p.qty, p.unit)}</span>}
                  </>
                }
                value={formatDate(p.date)}
              />
            ))}
          </div>
        </Section>
      )}

      {view.contacts.length > 0 && (
        <Section title={k.questions}>
          <p className="mb-5 text-muted">{k.questionsLead}</p>
          <ContactButtons v={v} contacts={view.contacts} message={k.whatsappOwner(title)} />
        </Section>
      )}
    </Frame>
  );
}
