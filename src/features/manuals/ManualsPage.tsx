import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BookOpen, ChevronRight } from 'lucide-react';
import { CarLogo } from '@/components/CarLogo';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { SuggestionInput } from '@/components/SuggestionInput';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { carTitle, isClosed, type CarStatus } from '@/domain/cars';
import { useCars } from '@/features/cars/api';
import { useJobs } from '@/features/jobs/api';
import { jobCar } from '@/features/jobs/JobsListPage';
import { useCarFieldOptions } from '@/features/catalog/carCatalog';
import { EngineOption, GenerationOption, MakeOption } from '@/features/catalog/CarOptions';

/** Repair manuals: of the cars in the workshop, or of any car. */
export function ManualsPage() {
  const cars = useCars();
  const jobs = useJobs();
  const rows = useMemo(
    () => [
      ...(jobs.data ?? [])
        .filter((j) => j.status === 'open' && j.car_make && j.car_model)
        .map((j) => ({ key: `job:${j.id}`, to: `/jobs/${j.id}/manual`, make: j.car_make!, title: jobCar({ ...j, car_plate: null }), sub: [j.customer?.name, j.car_engine].filter(Boolean).join(' · ') })),
      ...(cars.data ?? [])
        .filter((c) => !isClosed(c.status as CarStatus))
        .map((c) => ({ key: `car:${c.id}`, to: `/cars/${c.id}/manual`, make: c.make, title: carTitle(c), sub: [c.plate ?? c.ref, c.engine].filter(Boolean).join(' · ') })),
    ],
    [cars.data, jobs.data],
  );

  return (
    <>
      <PageHeader title="Repair manuals" back />
      <PageBody>
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">In the workshop</h2>
          {(cars.isPending || jobs.isPending) && <Skeleton className="h-32 rounded-xl" />}
          {cars.data && jobs.data && rows.length === 0 && <p className="text-sm text-muted-foreground">No cars in progress and no open jobs with a car.</p>}
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border empty:hidden">
            {rows.map((r) => (
              <li key={r.key}>
                <Link to={r.to} className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-muted">
                  <CarLogo make={r.make} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.title}</span>
                    {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <AnyCar />
      </PageBody>
    </>
  );
}

function AnyCar() {
  const navigate = useNavigate();
  const [v, setV] = useState({ make: '', model: '', generation: '', year: '', engine: '' });
  const set = (name: keyof typeof v) => (value: string) => setV((old) => ({ ...old, [name]: value }));
  const catalog = useCarFieldOptions(v);

  const open = () => {
    const names = catalog.canonical(v);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...names, year: v.year.trim() })) if (value) params.set(key, value);
    navigate(`/manuals/car?${params}`);
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Any other car</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (v.make.trim() && v.model.trim()) open();
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="manual-make">Make</FieldLabel>
            <SuggestionInput id="manual-make" value={v.make} onChange={set('make')} options={catalog.makes} limit={8} renderOption={(o) => <MakeOption name={o} />} />
          </Field>
          <Field>
            <FieldLabel htmlFor="manual-model">Model</FieldLabel>
            <SuggestionInput id="manual-model" value={v.model} onChange={set('model')} options={catalog.models} limit={8} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="manual-generation">Generation</FieldLabel>
              <SuggestionInput
                id="manual-generation"
                value={v.generation}
                onChange={set('generation')}
                options={catalog.generationNames}
                limit={8}
                renderOption={(o) => <GenerationOption name={o} info={catalog.generationInfo(o)} />}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="manual-year">or year</FieldLabel>
              <Input id="manual-year" inputMode="numeric" value={v.year} onChange={(e) => set('year')(e.target.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="manual-engine">Engine</FieldLabel>
            <SuggestionInput
              id="manual-engine"
              value={v.engine}
              onChange={set('engine')}
              options={catalog.engineNames}
              limit={12}
              renderOption={(o) => <EngineOption name={o} fuel={catalog.engineFuel(o)} />}
            />
          </Field>
          <Button type="submit" size="lg" disabled={!v.make.trim() || !v.model.trim()}>
            <BookOpen /> Open the manual
          </Button>
        </FieldGroup>
      </form>
    </section>
  );
}
