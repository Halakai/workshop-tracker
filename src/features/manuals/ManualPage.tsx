import { useMemo, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { BookOpen, ChevronRight, ExternalLink, Search, SlidersHorizontal, Video, X } from 'lucide-react';
import { CarLogo } from '@/components/CarLogo';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { ManualCar } from '@/domain/manuals';
import { googleUrl, jobPages, manualJob, searchManual, webQuery, youtubeUrl, type ManualPage as Page } from '@/domain/manualSearch';
import { carTitle } from '@/domain/cars';
import { cn } from '@/lib/utils';
import { useCar } from '@/features/cars/api';
import { useJob } from '@/features/jobs/api';
import { ALL_PARTS, useCarManual, useManualPages } from './api';
import { ChooseManualDrawer, PartsDrawer } from './ChooseManualDrawer';
import { FIT_NOTES } from './ManualCard';
import { JOBS } from './jobs';

/** The manual of one of our cars. */
export function CarManualPage() {
  const { id } = useParams();
  const car = useCar(id);
  if (!car.data) return <Nothing back="/cars" loading={car.isPending} what="car" />;
  const c = car.data;
  return (
    <ManualView
      key={c.id}
      car={{ make: c.make, model: c.model, generation: c.generation, year: c.year, engine: c.engine, fuel: c.fuel }}
      plate={c.plate}
      back={`/cars/${c.id}`}
    />
  );
}

/** The manual of a customer's car. */
export function JobManualPage() {
  const { id } = useParams();
  const job = useJob(id);
  if (!job.data) return <Nothing back="/jobs" loading={job.isPending} what="job" />;
  const j = job.data;
  return (
    <ManualView
      key={j.id}
      car={{ make: j.car_make, model: j.car_model, generation: j.car_generation, year: j.car_year, engine: j.car_engine }}
      plate={j.car_plate}
      back={`/jobs/${j.id}`}
    />
  );
}

/** The manual of any car, from the address: /manuals/car?make=…&model=… */
export function AnyCarManualPage() {
  const [params] = useSearchParams();
  const get = (name: string) => params.get(name) ?? '';
  const year = /^\d{4}$/.test(get('year')) ? Number(get('year')) : null;
  return (
    <ManualView
      car={{ make: get('make'), model: get('model'), generation: get('generation'), year, engine: get('engine') }}
      plate={null}
      back="/manuals"
    />
  );
}

const intoView = (el: HTMLElement | null) => el?.scrollIntoView({ block: 'nearest', inline: 'center' });

function Nothing({ back, loading, what }: { back: string; loading: boolean; what: string }) {
  return (
    <>
      <PageHeader title="Repair manual" back={back} />
      <PageBody>{loading ? <Skeleton className="h-48 rounded-xl" /> : <p className="text-muted-foreground">This {what} doesn’t exist (anymore).</p>}</PageBody>
    </>
  );
}

function ManualView({ car: given, plate, back }: { car: ManualCar; plate: string | null; back: string }) {
  // the same object while nothing changes: the searches below are worked out from it
  const { make, model, generation, year, engine, fuel } = given;
  const car = useMemo<ManualCar>(() => ({ make, model, generation, year, engine, fuel }), [make, model, generation, year, engine, fuel]);
  const found = useCarManual(car);
  const { manual, engines, gearboxes, parts, pages } = useManualPages(found.slug, found.car, found.choice?.parts ?? []);
  const [choosing, setChoosing] = useState(false);
  const [choosingParts, setChoosingParts] = useState(false);

  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const job = manualJob(params.get('job'));
  const change = (next: { q?: string; job?: string }) => {
    const p = new URLSearchParams(params);
    for (const key of ['q', 'job'] as const) {
      p.delete(key);
      if (next[key]) p.set(key, next[key]);
    }
    setParams(p, { replace: true });
  };

  const results = useMemo(() => (query.trim() ? searchManual(pages, query) : []), [pages, query]);
  const tasks = useMemo(() => (job && !query.trim() ? jobPages(pages, job) : []), [pages, job, query]);

  const shownEngines = engines.filter((e) => parts.includes(e));
  const shownGearboxes = gearboxes.filter((g) => parts.includes(g));
  const topic = query.trim() || job?.topic || '';
  const title = carTitle({ year: car.year ?? null, make: car.make ?? '', model: car.model ?? '', generation: car.generation });

  return (
    <>
      <PageHeader title="Repair manual" back={back} />
      <PageBody>
        <div className="flex items-center gap-3">
          <CarLogo make={car.make} className="size-11" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{title || 'Car'}</p>
            <p className="truncate text-sm text-muted-foreground">{[car.engine, plate].filter(Boolean).join(' · ')}</p>
          </div>
        </div>

        {!found.named ? (
          <p className="text-muted-foreground">Fill in the car’s make and model to get its repair manual.</p>
        ) : found.loading ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : !found.slug ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
            <p className="text-muted-foreground">{found.error ? found.error.message : 'There is no manual for this car on workshop-manuals.com.'}</p>
            <Button variant="outline" onClick={() => setChoosing(true)}>
              <BookOpen /> Choose one myself
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col divide-y overflow-hidden rounded-xl border">
              <Setting
                icon={<BookOpen className="size-5 text-primary" />}
                label={manual.data?.title ?? found.title ?? ''}
                note={found.fit && found.fit !== 'chosen' ? FIT_NOTES[found.fit] : null}
                onClick={() => setChoosing(true)}
              />
              {(engines.length > 0 || gearboxes.length > 0) && (
                <Setting
                  icon={<SlidersHorizontal className="size-5 text-primary" />}
                  label={shownEngines.length > 0 ? shownEngines.join(' · ') : 'Every engine'}
                  note={
                    shownEngines.length === 0 && !parts.includes(ALL_PARTS)
                      ? 'Choose the engine to leave out the others.'
                      : shownGearboxes.length > 0
                        ? shownGearboxes.join(' · ')
                        : null
                  }
                  quiet
                  onClick={() => setChoosingParts(true)}
                />
              )}
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                enterKeyHint="search"
                placeholder="timing belt, remen, kočnice, momenti…"
                value={query}
                onChange={(e) => change({ q: e.target.value, job: job?.id })}
                className="pl-10"
              />
            </div>

            {/* all the jobs at first; once something is shown they shrink to a row, so the pages are in sight */}
            <div className={cn(job || query.trim() ? '-mx-4 flex gap-2 overflow-x-auto px-4 pb-1' : 'grid grid-cols-2 gap-2 sm:grid-cols-3')}>
              {JOBS.map(({ id, label, icon: Icon }) => {
                const on = job?.id === id && !query.trim();
                return job || query.trim() ? (
                  <Button
                    key={id}
                    ref={on ? intoView : undefined}
                    variant={on ? 'default' : 'outline'}
                    size="sm"
                    className="shrink-0 rounded-full"
                    aria-pressed={on}
                    onClick={() => change({ job: on ? undefined : id })}
                  >
                    {label}
                  </Button>
                ) : (
                  <Button key={id} variant="outline" className="h-12 justify-start gap-2 px-3 text-sm" onClick={() => change({ job: id })}>
                    <Icon className="size-5 text-primary" />
                    <span className="truncate">{label}</span>
                  </Button>
                );
              })}
            </div>

            {manual.isLoading && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Loading the manual’s index…</p>
                <Skeleton className="h-40 rounded-xl" />
              </div>
            )}
            {manual.isError && (
              <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
                <p className="text-sm text-destructive">{manual.error.message}</p>
                <Button variant="outline" onClick={() => manual.refetch()}>
                  Try again
                </Button>
              </div>
            )}

            {manual.data && query.trim() && (
              <section className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">
                    {results.length === 0 ? `Nothing found for “${query.trim()}”` : `${results.length >= 60 ? 'Best 60' : results.length} found`}
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => change({})}>
                    <X /> Clear
                  </Button>
                </div>
                <PageList pages={results} first={20} />
              </section>
            )}

            {manual.data && !query.trim() && job && (
              <>
                {tasks.length === 0 && <p className="text-muted-foreground">This manual has no pages for that.</p>}
                {tasks.map((task) => (
                  <section key={task.label} className="flex flex-col gap-2">
                    <h2 className="font-semibold">
                      {task.label} <span className="text-sm font-normal text-muted-foreground">({task.pages.length})</span>
                    </h2>
                    <PageList pages={task.pages} first={4} />
                  </section>
                ))}
              </>
            )}
          </>
        )}

        {found.named && (
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">Elsewhere</h2>
            <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
              {manual.data && <Outside href={`${manual.data.base}fullindex/`} icon={<BookOpen className="size-5 text-muted-foreground" />} label="The whole manual" />}
              <Outside href={youtubeUrl(webQuery(car, topic || 'repair'))} icon={<Video className="size-5 text-muted-foreground" />} label={topic ? `Videos: ${topic}` : 'Videos'} />
              <Outside href={googleUrl(webQuery(car, topic || 'repair'))} icon={<Search className="size-5 text-muted-foreground" />} label={topic ? `Google: ${topic}` : 'Google'} />
            </ul>
            <p className="text-xs text-muted-foreground">
              Pages open on workshop-manuals.com, which isn’t ours. Check the engine code and the torques before you rely on them.
            </p>
          </section>
        )}
      </PageBody>

      <ChooseManualDrawer car={car} found={found} open={choosing} onOpenChange={setChoosing} />
      {found.slug && <PartsDrawer car={car} slug={found.slug} found={found} open={choosingParts} onOpenChange={setChoosingParts} />}
    </>
  );
}

function Setting({ icon, label, note, quiet, onClick }: { icon: ReactNode; label: string; note: string | null; quiet?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-muted">
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className={cn('line-clamp-2', quiet ? 'text-sm' : 'font-medium')}>{label}</span>
        {note && <span className="line-clamp-2 text-xs text-muted-foreground">{note}</span>}
      </span>
      <span className="shrink-0 text-sm text-primary">Change</span>
    </button>
  );
}

/** Where a page is in the manual. The car's own engine goes without saying. */
function where(p: Page): string {
  return (p.engine && p.trail.length > 0 ? p.trail : [p.chapter, ...p.trail]).join(' › ');
}

function PageList({ pages, first }: { pages: readonly Page[]; first: number }) {
  const [all, setAll] = useState(false);
  if (pages.length === 0) return null;
  const shown = all ? pages : pages.slice(0, first);
  return (
    <>
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
        {shown.map((p) => (
          <li key={p.url}>
            <a href={p.url} target="_blank" rel="noreferrer" className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{p.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{where(p)}</span>
              </span>
              <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
            </a>
          </li>
        ))}
      </ul>
      {pages.length > first && !all && (
        <Button variant="ghost" size="sm" onClick={() => setAll(true)}>
          Show all {pages.length}
        </Button>
      )}
    </>
  );
}

function Outside({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <li>
      <a href={href} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 px-4 py-2.5 active:bg-muted">
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </a>
    </li>
  );
}
