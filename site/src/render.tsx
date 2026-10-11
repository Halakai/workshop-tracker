// The public website's pages, rendered to plain HTML at build time (scripts/build-site.mjs).
// Everything typed in the app goes through React, so it is escaped; the only raw HTML is the JSON-LD block.
import type { CSSProperties, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { T, pick, type Lang, type Texts } from './i18n';
import {
  carPath,
  clip,
  coverOf,
  formatKm,
  formatPrice,
  fuelName,
  groupHours,
  homePath,
  isForSale,
  mainContacts,
  mapLink,
  paragraphs,
  specLine,
  telLink,
  viberLink,
  whatsappLink,
} from './format';
import {
  ArrowLeftIcon,
  CameraIcon,
  ChatIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  FacebookIcon,
  InstagramIcon,
  MessageIcon,
  PhoneIcon,
  PinIcon,
  StarIcon,
  WrenchIcon,
} from './icons';
import type { BuildContext, PhotoFiles, PhotoRef, SiteCar, SiteContact, Snapshot } from './types';

interface Page {
  path: string;
  html: string;
}

interface View {
  s: Snapshot;
  ctx: BuildContext;
  lang: Lang;
  t: Texts;
}

const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6';
const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 font-semibold text-white shadow-lg shadow-accent/20 transition hover:brightness-110';
const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-full border border-line bg-card/70 px-5 py-3 font-semibold text-fg transition hover:border-accent';

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Img({ photo, alt, sizes, className, eager }: { photo: PhotoFiles; alt: string; sizes: string; className?: string; eager?: boolean }) {
  return (
    <img
      src={photo.src}
      srcSet={photo.srcset}
      sizes={sizes}
      width={photo.width}
      height={photo.height}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : undefined}
      className={className}
    />
  );
}

function ContactButtons({ v, contacts, message, compact }: { v: View; contacts: SiteContact[]; message?: string; compact?: boolean }) {
  const { t } = v;
  const many = contacts.length > 1;
  return (
    <div className="flex flex-wrap gap-3">
      {contacts.flatMap((c, i) => {
        const who = many ? ` · ${c.name}` : '';
        const out: ReactNode[] = [];
        if (c.call)
          out.push(
            <a key={`c${i}`} href={telLink(c.phone)} className={i === 0 ? btnPrimary : btnSecondary}>
              <PhoneIcon /> {compact ? t.call : t.callUs}
              {who}
            </a>,
          );
        if (c.whatsapp)
          out.push(
            <a key={`w${i}`} href={whatsappLink(c.phone, message)} className={btnSecondary} target="_blank" rel="noopener">
              <ChatIcon /> {t.whatsapp}
              {who}
            </a>,
          );
        if (c.viber)
          out.push(
            <a key={`v${i}`} href={viberLink(c.phone)} className={btnSecondary}>
              <MessageIcon /> {t.viber}
              {who}
            </a>,
          );
        return out;
      })}
    </div>
  );
}

function Badge({ children, tone = 'accent' }: { children: ReactNode; tone?: 'accent' | 'dark' }) {
  return (
    <span
      className={
        tone === 'accent'
          ? 'rounded-full bg-accent px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase'
          : 'rounded-full bg-black/70 px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase backdrop-blur'
      }
    >
      {children}
    </span>
  );
}

function carBadge(car: SiteCar, t: Texts): { text: string; tone: 'accent' | 'dark' } | null {
  if (isForSale(car)) return { text: t.forSale, tone: 'accent' };
  if (car.kind === 'flip' && car.status === 'sold') return { text: t.sold, tone: 'dark' };
  return null;
}

function CarCard({ v, car }: { v: View; car: SiteCar }) {
  const { ctx, lang, t } = v;
  const cover = coverOf(car.photos);
  const photo = cover ? ctx.photos[cover.id] : undefined;
  const title = pick(lang, car.title_hr, car.title_en);
  const summary = pick(lang, car.summary_hr, car.summary_en);
  const specs = specLine(car, t.fuels);
  const badge = carBadge(car, t);
  return (
    <a href={carPath(ctx.base, lang, car.slug)} className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-card transition hover:border-accent/60">
      <div className="relative aspect-[4/3] overflow-hidden bg-line">
        {photo ? (
          <Img
            photo={photo}
            alt={title}
            sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
            className="size-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-2xl font-bold text-muted">{car.make}</div>
        )}
        {badge && (
          <span className="absolute top-3 left-3">
            <Badge tone={badge.tone}>{badge.text}</Badge>
          </span>
        )}
        {car.photos.length > 1 && (
          <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white backdrop-blur">
            <CameraIcon className="size-3.5" /> {car.photos.length}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="text-lg leading-snug font-semibold text-balance">{title}</h3>
        {summary && <p className="line-clamp-2 text-sm text-muted">{summary}</p>}
        {specs && <p className="text-sm text-muted">{specs}</p>}
        {isForSale(car) && car.price_cents != null && <p className="mt-auto pt-2 text-xl font-bold text-accent">{formatPrice(car.price_cents)}</p>}
      </div>
    </a>
  );
}

function SectionTitle({ id, title, lead }: { id?: string; title: string; lead?: string }) {
  return (
    <div id={id} className="mb-8 scroll-mt-24">
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {lead && <p className="mt-2 max-w-2xl text-muted">{lead}</p>}
    </div>
  );
}

function Paragraphs({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {paragraphs(text).map((lines, i) => (
        <p key={i}>
          {lines.map((line, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {line}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Frame: <head>, header, footer, the call bar on phones
// ---------------------------------------------------------------------------

interface Meta {
  title: string;
  description: string;
  path: string;
  alternate: string;
  image?: string;
  type?: 'website' | 'article';
  jsonLd?: object;
  noindex?: boolean;
}

function abs(ctx: BuildContext, path: string) {
  return new URL(path, ctx.origin).href;
}

function Frame({ v, meta, nav, children }: { v: View; meta: Meta; nav: { href: string; label: string }[]; children: ReactNode }) {
  const { s, ctx, lang, t } = v;
  const other: Lang = lang === 'hr' ? 'en' : 'hr';
  const main = mainContacts(s.contacts);
  const bar = [
    main.call && { href: telLink(main.call.phone), label: t.call, icon: <PhoneIcon />, primary: true },
    main.whatsapp && { href: whatsappLink(main.whatsapp.phone), label: t.whatsapp, icon: <ChatIcon />, primary: false },
  ].filter(Boolean) as { href: string; label: string; icon: ReactNode; primary: boolean }[];
  const hrefs = lang === 'hr' ? { hr: meta.path, en: meta.alternate } : { hr: meta.alternate, en: meta.path };

  return (
    <html lang={t.htmlLang} className="bg-bg">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{meta.title}</title>
        <meta name="description" content={meta.description} />
        {(meta.noindex || ctx.preview) && <meta name="robots" content="noindex" />}
        <meta name="theme-color" content="#0c0f14" />
        <link rel="canonical" href={abs(ctx, meta.path)} />
        <link rel="alternate" hrefLang="hr" href={abs(ctx, hrefs.hr)} />
        <link rel="alternate" hrefLang="en" href={abs(ctx, hrefs.en)} />
        <link rel="alternate" hrefLang="x-default" href={abs(ctx, hrefs.hr)} />
        <meta property="og:type" content={meta.type ?? 'website'} />
        <meta property="og:site_name" content={s.workshop.name} />
        <meta property="og:title" content={meta.title} />
        <meta property="og:description" content={meta.description} />
        <meta property="og:url" content={abs(ctx, meta.path)} />
        <meta property="og:locale" content={t.locale} />
        {meta.image && <meta property="og:image" content={abs(ctx, meta.image)} />}
        {meta.image && <meta property="og:image:width" content="1200" />}
        {meta.image && <meta property="og:image:height" content="630" />}
        <meta name="twitter:card" content={meta.image ? 'summary_large_image' : 'summary'} />
        <link rel="icon" href={`${ctx.base}favicon.svg`} type="image/svg+xml" />
        <link rel="apple-touch-icon" href={`${ctx.base}apple-touch-icon-180x180.png`} />
        {ctx.css.map((href) => (
          <link key={href} rel="stylesheet" href={href} />
        ))}
        {meta.jsonLd && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c') }} />
        )}
      </head>
      <body className={`min-h-dvh bg-bg font-sans text-fg antialiased ${bar.length ? 'pb-24 sm:pb-0' : ''}`}>
        {ctx.preview && <div className="bg-amber-400 py-1 text-center text-sm font-semibold text-black">{t.preview}</div>}
        <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur">
          <div className={`${container} flex h-16 items-center gap-4`}>
            <a href={homePath(ctx.base, lang)} className="flex min-w-0 items-center gap-3">
              <img src={ctx.logo} alt="" width={36} height={36} className="size-9 shrink-0 rounded-lg object-contain" />
              <span className="truncate text-lg font-bold">{s.workshop.name}</span>
            </a>
            <nav className="ml-auto hidden items-center gap-6 text-sm text-muted md:flex">
              {nav.map((n) => (
                <a key={n.href} href={n.href} className="transition hover:text-fg">
                  {n.label}
                </a>
              ))}
            </nav>
            <a
              href={hrefs[other]}
              hrefLang={other}
              lang={other}
              className="ml-auto shrink-0 rounded-full border border-line px-3 py-1.5 text-sm font-semibold text-muted transition hover:border-accent hover:text-fg md:ml-0"
              aria-label={t.otherLang}
            >
              {t.otherLangShort}
            </a>
          </div>
        </header>
        <main>{children}</main>
        <Footer v={v} />
        {bar.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t border-line bg-bg/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur sm:hidden">
            {bar.map((b) => (
              <a key={b.href} href={b.href} className={`flex-1 ${b.primary ? btnPrimary : btnSecondary}`}>
                {b.icon} {b.label}
              </a>
            ))}
          </div>
        )}
        <script type="module" src={ctx.js} />
      </body>
    </html>
  );
}

function Footer({ v }: { v: View }) {
  const { s, ctx, t } = v;
  return (
    <footer className="mt-24 border-t border-line">
      <div className={`${container} flex flex-col gap-6 py-10 text-sm text-muted sm:flex-row sm:items-end sm:justify-between`}>
        <div className="flex flex-col gap-1">
          <span className="text-base font-semibold text-fg">{s.workshop.name}</span>
          {s.workshop.address && <span>{s.workshop.address}</span>}
          {s.contacts.map((c) => (
            <a key={c.phone} href={telLink(c.phone)} className="hover:text-fg">
              {c.name}: {c.phone}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-5">
          {s.site.instagram_url && (
            <a href={s.site.instagram_url} target="_blank" rel="noopener" aria-label="Instagram" className="hover:text-fg">
              <InstagramIcon className="size-6" />
            </a>
          )}
          {s.site.facebook_url && (
            <a href={s.site.facebook_url} target="_blank" rel="noopener" aria-label="Facebook" className="hover:text-fg">
              <FacebookIcon className="size-6" />
            </a>
          )}
          <a href={`${ctx.base}privacy.html`} className="hover:text-fg">
            {t.privacy}
          </a>
          <a href={`${ctx.base}app/`} rel="nofollow" className="opacity-70 hover:text-fg hover:opacity-100">
            {t.login}
          </a>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function heroPhoto(s: Snapshot): PhotoRef | null {
  return coverOf(s.site_photos) ?? coverOf(s.cars.flatMap((c) => c.photos.filter((p) => p.favorite)).concat(s.cars.flatMap((c) => c.photos)));
}

function HomePage({ v }: { v: View }) {
  const { s, ctx, lang, t } = v;
  const forSale = s.cars.filter(isForSale);
  const work = s.cars.filter((c) => !isForSale(c));
  const hero = heroPhoto(s);
  const heroFiles = hero ? ctx.photos[hero.id] : undefined;
  const aboutPhotos = s.site_photos.filter((p) => p.id !== hero?.id);
  const about = pick(lang, s.site.about_hr, s.site.about_en);
  const headline = pick(lang, s.site.headline_hr, s.site.headline_en) || t.defaultHeadline;
  const intro = pick(lang, s.site.intro_hr, s.site.intro_en);
  const map = mapLink(s);
  const hours = groupHours(s.hours, t.days);
  const hoursNote = pick(lang, s.site.hours_note_hr, s.site.hours_note_en);
  const home = homePath(ctx.base, lang);
  const hasHours = s.hours.some((h) => h.opens);

  const nav = [
    forSale.length > 0 && { href: '#prodaja', label: t.nav.forSale },
    work.length > 0 && { href: '#radovi', label: t.nav.work },
    s.services.length > 0 && { href: '#usluge', label: t.nav.services },
    (about || aboutPhotos.length > 0) && { href: '#o-nama', label: t.nav.about },
    { href: '#kontakt', label: t.nav.contact },
  ].filter(Boolean) as { href: string; label: string }[];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: s.workshop.name,
    url: abs(ctx, home),
    ...(heroFiles && { image: abs(ctx, heroFiles.share) }),
    ...((s.contacts[0]?.phone ?? s.workshop.phone) && { telephone: s.contacts[0]?.phone ?? s.workshop.phone }),
    ...(s.workshop.address && { address: s.workshop.address }),
    openingHoursSpecification: s.hours
      .filter((h) => h.opens && h.closes)
      .map((h) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: `https://schema.org/${T.en.days[h.weekday - 1]}`,
        opens: h.opens,
        closes: h.closes,
      })),
    sameAs: [s.site.instagram_url, s.site.facebook_url].filter(Boolean),
  };

  return (
    <Frame
      v={v}
      nav={nav}
      meta={{
        title: `${s.workshop.name} · ${headline}`,
        description: clip(intro || headline),
        path: home,
        alternate: homePath(ctx.base, lang === 'hr' ? 'en' : 'hr'),
        image: heroFiles?.share,
        jsonLd,
      }}
    >
      {/* the forwarding for old app links lives in the Croatian home page only (see build-site.mjs) */}
      <section className="relative isolate overflow-hidden border-b border-line">
        {heroFiles ? (
          <>
            <Img photo={heroFiles} alt="" sizes="100vw" eager className="absolute inset-0 -z-20 size-full object-cover opacity-60" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-bg via-bg/75 to-bg/30" />
          </>
        ) : (
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,rgba(232,89,12,0.28),transparent_60%)]" />
        )}
        <div className={`${container} py-20 sm:py-28 lg:py-36`}>
          <p className="text-sm font-semibold tracking-[0.2em] text-accent uppercase">{s.workshop.name}</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">{headline}</h1>
          {intro && <p className="mt-5 max-w-2xl text-lg text-muted sm:text-xl">{intro}</p>}
          {s.contacts.length > 0 && (
            <div className="mt-8">
              <ContactButtons v={v} contacts={s.contacts.slice(0, 1)} message={t.whatsappHello} />
            </div>
          )}
        </div>
      </section>

      {forSale.length > 0 && (
        <section className={`${container} pt-20`}>
          <SectionTitle id="prodaja" title={t.forSale} lead={t.forSaleLead} />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {forSale.map((c) => (
              <CarCard key={c.id} v={v} car={c} />
            ))}
          </div>
        </section>
      )}

      {work.length > 0 && (
        <section className={`${container} pt-20`}>
          <SectionTitle id="radovi" title={t.work} lead={t.workLead} />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {work.map((c) => (
              <CarCard key={c.id} v={v} car={c} />
            ))}
          </div>
        </section>
      )}

      {s.services.length > 0 && (
        <section className={`${container} pt-20`}>
          <SectionTitle id="usluge" title={t.services} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.services.map((sv, i) => {
              const text = pick(lang, sv.text_hr, sv.text_en);
              return (
                <div key={i} className="rounded-2xl border border-line bg-card p-6">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
                    <WrenchIcon />
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{pick(lang, sv.title_hr, sv.title_en)}</h3>
                  {text && <p className="mt-1.5 text-muted">{text}</p>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {(about || aboutPhotos.length > 0) && (
        <section className={`${container} pt-20`}>
          <SectionTitle id="o-nama" title={t.about} />
          <div className="grid items-start gap-8 lg:grid-cols-2">
            {about && <Paragraphs text={about} className="flex flex-col gap-4 text-lg leading-relaxed text-muted" />}
            {aboutPhotos.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {aboutPhotos.slice(0, 4).map((p, i) => {
                  const files = ctx.photos[p.id];
                  return files ? (
                    <Img
                      key={p.id}
                      photo={files}
                      alt=""
                      sizes="(min-width: 1024px) 280px, 50vw"
                      className={`w-full rounded-2xl object-cover ${i === 0 && aboutPhotos.length !== 2 ? 'col-span-2 aspect-[16/9]' : 'aspect-square'}`}
                    />
                  ) : null;
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {s.reviews.length > 0 && (
        <section className={`${container} pt-20`}>
          <SectionTitle title={t.reviews} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.reviews.map((r, i) => (
              <figure key={i} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-6">
                {r.stars != null && (
                  <span className="flex gap-0.5 text-amber-400" aria-label={`${r.stars}/5`}>
                    {Array.from({ length: r.stars }, (_, k) => (
                      <StarIcon key={k} className="size-4" />
                    ))}
                  </span>
                )}
                <blockquote className="text-lg leading-relaxed">“{pick(lang, r.text_hr, r.text_en)}”</blockquote>
                <figcaption className="mt-auto text-sm text-muted">{r.author}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className={`${container} pt-20`}>
        <SectionTitle id="kontakt" title={t.contact} />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-6 rounded-2xl border border-line bg-card p-6">
            {s.contacts.map((c) => (
              <div key={c.phone} className="flex flex-col gap-3">
                <p>
                  <span className="text-lg font-semibold">{c.name}</span> <span className="text-muted">{c.phone}</span>
                </p>
                <ContactButtons v={v} contacts={[c]} message={t.whatsappHello} compact />
              </div>
            ))}
            {s.workshop.address && (
              <div className="flex flex-col gap-3 border-t border-line pt-6">
                <p className="flex items-start gap-2">
                  <PinIcon className="mt-0.5 size-5 shrink-0 text-accent" />
                  {s.workshop.address}
                </p>
                {map && (
                  <a href={map} target="_blank" rel="noopener" className={`${btnSecondary} self-start`}>
                    <PinIcon /> {t.openMap}
                  </a>
                )}
              </div>
            )}
          </div>
          {hasHours && (
            <div
              className="rounded-2xl border border-line bg-card p-6"
              data-hours={JSON.stringify(s.hours)}
              data-open-text={t.openNow}
              data-closed-text={t.closedNow}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <ClockIcon className="size-5 text-accent" /> {t.hours}
                </h3>
                <span data-open-now className="hidden rounded-full px-3 py-1 text-xs font-semibold" />
              </div>
              <dl className="mt-4 flex flex-col divide-y divide-line">
                {hours.map((h) => (
                  <div key={h.days} data-weekdays={h.weekdays.join(' ')} className="flex justify-between gap-4 py-2.5">
                    <dt>{h.days}</dt>
                    <dd className={h.time ? 'tabular-nums' : 'text-muted'}>{h.time ?? t.closed}</dd>
                  </div>
                ))}
              </dl>
              {hoursNote && <p className="mt-4 text-sm text-muted">{hoursNote}</p>}
            </div>
          )}
        </div>
      </section>
    </Frame>
  );
}

// ---------------------------------------------------------------------------
// One car
// ---------------------------------------------------------------------------

function Gallery({ v, photos, title }: { v: View; photos: { ref: PhotoRef; files: PhotoFiles }[]; title: string }) {
  const { t } = v;
  if (photos.length === 0) return null;
  return (
    <>
      <div className="relative -mx-4 sm:mx-0" data-gallery>
        <div className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] sm:rounded-2xl" data-track>
          {photos.map((p, i) => (
            <button
              key={p.ref.id}
              type="button"
              data-open={i}
              className="aspect-[4/3] w-full shrink-0 snap-center bg-line"
              aria-label={`${t.photo} ${i + 1} ${t.of} ${photos.length}`}
            >
              <Img photo={p.files} alt={i === 0 ? title : ''} sizes="(min-width: 896px) 864px, 100vw" eager={i === 0} className="size-full object-cover" />
            </button>
          ))}
        </div>
        {photos.length > 1 && (
          <>
            <span data-counter className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/60 px-3 py-1 text-sm text-white backdrop-blur">
              1 / {photos.length}
            </span>
            <button type="button" data-prev aria-label={t.previous} className="absolute top-1/2 left-3 hidden -translate-y-1/2 rounded-full bg-black/60 p-2 text-white backdrop-blur hover:bg-black/80 sm:block">
              <ChevronLeftIcon className="size-6" />
            </button>
            <button type="button" data-next aria-label={t.next} className="absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-full bg-black/60 p-2 text-white backdrop-blur hover:bg-black/80 sm:block">
              <ChevronRightIcon className="size-6" />
            </button>
          </>
        )}
      </div>
      <dialog data-lightbox className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black" aria-label={title}>
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between p-3">
            <span data-counter className="px-2 text-sm text-white/80">
              1 / {photos.length}
            </span>
            <button type="button" data-close aria-label={t.close} className="rounded-full p-2 hover:bg-white/10">
              <CloseIcon className="size-7" />
            </button>
          </div>
          <div className="relative min-h-0 flex-1">
            <div className="flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none]" data-track>
              {photos.map((p) => (
                <div key={p.ref.id} className="flex h-full w-full shrink-0 snap-center items-center justify-center">
                  <img data-src={p.files.full} alt="" className="max-h-full max-w-full object-contain" />
                </div>
              ))}
            </div>
            {photos.length > 1 && (
              <>
                <button type="button" data-prev aria-label={t.previous} className="absolute top-1/2 left-3 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20 sm:block">
                  <ChevronLeftIcon className="size-7" />
                </button>
                <button type="button" data-next aria-label={t.next} className="absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20 sm:block">
                  <ChevronRightIcon className="size-7" />
                </button>
              </>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}

function Compare({ v, before, after }: { v: View; before: PhotoFiles; after: PhotoFiles }) {
  const { t } = v;
  const label = 'pointer-events-none absolute top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold tracking-wide text-white uppercase backdrop-blur';
  return (
    <div data-compare className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-line select-none" style={{ '--pos': '50%' } as CSSProperties}>
      <Img photo={after} alt={t.after} sizes="(min-width: 896px) 864px, 100vw" className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0" style={{ clipPath: 'inset(0 calc(100% - var(--pos)) 0 0)' }}>
        <Img photo={before} alt={t.before} sizes="(min-width: 896px) 864px, 100vw" className="size-full object-cover" />
      </div>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow" style={{ left: 'var(--pos)' }}>
        <span className="absolute top-1/2 left-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black shadow-lg">
          <ChevronLeftIcon className="size-4" />
          <ChevronRightIcon className="size-4" />
        </span>
      </div>
      <span className={`${label} left-3`}>{t.before}</span>
      <span className={`${label} right-3`}>{t.after}</span>
      <input type="range" min={0} max={100} defaultValue={50} aria-label={t.compareHint} className="absolute inset-0 size-full cursor-ew-resize opacity-0" />
    </div>
  );
}

function CarPage({ v, car }: { v: View; car: SiteCar }) {
  const { s, ctx, lang, t } = v;
  const title = pick(lang, car.title_hr, car.title_en);
  const summary = pick(lang, car.summary_hr, car.summary_en);
  const story = pick(lang, car.story_hr, car.story_en);
  // the favorite first, like in the app
  const photos = [...car.photos]
    .sort((a, b) => Number(b.favorite) - Number(a.favorite))
    .flatMap((ref) => (ctx.photos[ref.id] ? [{ ref, files: ctx.photos[ref.id] }] : []));
  const cover = coverOf(car.photos);
  const before = car.before_photo_id ? ctx.photos[car.before_photo_id] : undefined;
  const after = car.after_photo_id ? ctx.photos[car.after_photo_id] : undefined;
  const forSale = isForSale(car);
  const badge = carBadge(car, t);
  const path = carPath(ctx.base, lang, car.slug);
  const url = abs(ctx, path);
  const specs = [
    car.year != null && { label: t.year, value: String(car.year) },
    car.engine && { label: t.engine, value: car.engine },
    car.fuel && { label: t.fuel, value: fuelName(car.fuel, t.fuels) },
    car.mileage_km != null && { label: t.mileage, value: formatKm(car.mileage_km) },
  ].filter(Boolean) as { label: string; value: string }[];
  const others = [...s.cars.filter((c) => c.id !== car.id && isForSale(c) === forSale), ...s.cars.filter((c) => c.id !== car.id && isForSale(c) !== forSale)].slice(0, 3);
  const home = homePath(ctx.base, lang);
  const description = clip(summary || story || title);

  const jsonLd = forSale
    ? {
        '@context': 'https://schema.org',
        '@type': 'Car',
        name: title,
        url,
        ...(car.make && { brand: { '@type': 'Brand', name: car.make } }),
        ...(car.model && { model: car.model }),
        ...(car.year != null && { vehicleModelDate: String(car.year) }),
        ...(car.fuel && { fuelType: car.fuel }),
        ...(car.mileage_km != null && { mileageFromOdometer: { '@type': 'QuantitativeValue', value: car.mileage_km, unitCode: 'KMT' } }),
        image: photos.slice(0, 5).map((p) => abs(ctx, p.files.full)),
        ...(car.price_cents != null && {
          offers: { '@type': 'Offer', price: Math.round(car.price_cents / 100), priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url },
        }),
      }
    : undefined;

  return (
    <Frame
      v={v}
      nav={[
        { href: `${home}#radovi`, label: t.nav.work },
        { href: `${home}#kontakt`, label: t.nav.contact },
      ]}
      meta={{
        title: `${title} · ${s.workshop.name}`,
        description,
        path,
        alternate: carPath(ctx.base, lang === 'hr' ? 'en' : 'hr', car.slug),
        image: cover ? ctx.photos[cover.id]?.share : undefined,
        type: 'article',
        jsonLd,
      }}
    >
      <div className="mx-auto w-full max-w-4xl px-4 pt-4 sm:px-6 sm:pt-8">
        <a href={`${home}#${forSale ? 'prodaja' : 'radovi'}`} className="mb-4 inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeftIcon className="size-4" /> {forSale ? t.forSale : t.allWork}
        </a>
        <Gallery v={v} photos={photos} title={title} />

        <div className="mt-6 flex flex-col gap-3">
          {badge && (
            <span>
              <Badge tone={badge.tone}>{badge.text}</Badge>
            </span>
          )}
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h1>
          {summary && <p className="text-lg text-muted">{summary}</p>}
          {forSale && car.price_cents != null && <p className="text-3xl font-bold text-accent">{formatPrice(car.price_cents)}</p>}
        </div>

        {specs.length > 0 && (
          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
            {specs.map((sp) => (
              <div key={sp.label} className="bg-card p-4">
                <dt className="text-xs tracking-wide text-muted uppercase">{sp.label}</dt>
                <dd className="mt-1 font-semibold">{sp.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {before && after && (
          <section className="mt-10">
            <h2 className="mb-4 text-2xl font-bold">{t.beforeAfter}</h2>
            <Compare v={v} before={before} after={after} />
            <p className="mt-2 text-sm text-muted">{t.compareHint}</p>
          </section>
        )}

        {story && (
          <section className="mt-10">
            <h2 className="mb-4 text-2xl font-bold">{t.whatWeDid}</h2>
            <Paragraphs text={story} className="flex flex-col gap-4 text-lg leading-relaxed text-muted" />
          </section>
        )}

        {s.contacts.length > 0 && (
          <section className="mt-10 rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/15 to-card p-6">
            <h2 className="text-2xl font-bold">{forSale ? t.askAboutCar : t.jobCta}</h2>
            <p className="mt-1 text-muted">{forSale ? t.askAboutCarLead : t.jobCtaLead}</p>
            <div className="mt-5">
              <ContactButtons v={v} contacts={s.contacts} message={forSale ? t.whatsappCar(title, url) : t.whatsappHello} compact />
            </div>
          </section>
        )}
      </div>

      {others.length > 0 && (
        <section className={`${container} pt-20`}>
          <SectionTitle title={t.moreWork} />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((c) => (
              <CarCard key={c.id} v={v} car={c} />
            ))}
          </div>
        </section>
      )}
    </Frame>
  );
}

function NotFoundPage({ v }: { v: View }) {
  const { ctx, t } = v;
  return (
    <Frame v={v} nav={[]} meta={{ title: `${T.hr.notFound} · ${T.en.notFound}`, description: t.notFoundLead, path: `${ctx.base}404.html`, alternate: `${ctx.base}404.html`, noindex: true }}>
      <div className={`${container} flex flex-col items-start gap-4 py-24`}>
        <h1 className="text-4xl font-bold">{T.hr.notFound}</h1>
        <p className="text-muted">
          {T.hr.notFoundLead} {T.en.notFound}.
        </p>
        <a href={ctx.base} className={btnPrimary}>
          {T.hr.home} · {T.en.home}
        </a>
      </div>
    </Frame>
  );
}

// ---------------------------------------------------------------------------

function doc(node: ReactNode): string {
  return `<!doctype html>\n${renderToStaticMarkup(node)}`;
}

/** Every page of the website: [path inside the site, HTML]. */
export function renderSite(s: Snapshot, ctx: BuildContext): Page[] {
  const pages: Page[] = [];
  for (const lang of ['hr', 'en'] as const) {
    const v: View = { s, ctx, lang, t: T[lang] };
    pages.push({ path: lang === 'hr' ? 'index.html' : 'en/index.html', html: doc(<HomePage v={v} />) });
    for (const car of s.cars) {
      pages.push({ path: `${carPath('', lang, car.slug)}index.html`, html: doc(<CarPage v={v} car={car} />) });
    }
  }
  pages.push({ path: '404.html', html: doc(<NotFoundPage v={{ s, ctx, lang: 'hr', t: T.hr }} />) });
  return pages;
}

/** Page addresses for sitemap.xml. */
export function sitemapPaths(s: Snapshot, base: string): string[] {
  return (['hr', 'en'] as const).flatMap((lang) => [homePath(base, lang), ...s.cars.map((c) => carPath(base, lang, c.slug))]);
}
