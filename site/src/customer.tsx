// A customer's own page, opened with a key (docs/PLAN.md §11). For a job: the work at the customer's prices, their
// payments, the photos the workshop ticked and the invoice. Plain HTML in the website's look, like render.tsx; the
// data comes from open_access_key() through the files function and never holds costs.
import type { ReactNode } from 'react';
import { formatDate } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { T, type Lang } from './i18n';
import { Badge, ContactButtons, Frame, Gallery, Paragraphs, btnPrimary, doc, type View } from './render';
import type { BuildContext, SiteContact, Snapshot } from './types';

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

export type KeyView = JobKeyView;

/** What the website's frame (header, footer, call bar) needs from a snapshot; the rest stays empty. */
function shell(view: KeyView): Snapshot {
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

/** The page for a key. `ctx.base` is the key's own address ("#/k/K7M4QX9P/"); English is under "en/". */
export function renderKeyPage(view: KeyView, ctx: BuildContext, lang: Lang, invoiceUrl: string | null): string {
  const v: View = { s: shell(view), ctx, lang, t: T[lang] };
  return doc(<JobKeyPage v={v} view={view} invoiceUrl={invoiceUrl} />);
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
        teamText: k.teamPreview,
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
