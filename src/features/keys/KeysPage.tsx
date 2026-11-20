// More → Keys: every key in one list (docs/PLAN.md §11), to see who can look at what and change keys while in use.
import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { FormDrawer } from '@/components/FormDrawer';
import { keyState, type KeyState } from '@/domain/keys';
import { useAllKeys, type KeyWithTarget } from './api';
import { KeyDrawer, KeyRow } from './CustomerAccessCard';
import { KeyForm } from './KeyForm';

type Filter = KeyState | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'working', label: 'Working' },
  { value: 'expired', label: 'Expired' },
  { value: 'off', label: 'Switched off' },
  { value: 'all', label: 'All' },
];

function subjectOf(k: KeyWithTarget): { subject: string; label: string; to: string | null } {
  if (k.kind === 'job' && k.job) {
    const car = [k.job.car_make, k.job.car_model].filter(Boolean).join(' ');
    return { subject: k.job.ref, label: [k.job.ref, k.job.customer?.name, car].filter(Boolean).join(' · '), to: `/jobs/${k.job.id}` };
  }
  if (k.car) {
    const car = [k.car.make, k.car.model, k.car.generation].filter(Boolean).join(' ');
    return { subject: k.car.ref, label: [k.car.ref, car].filter(Boolean).join(' · '), to: `/cars/${k.car.id}` };
  }
  return { subject: 'Website', label: 'Website', to: null };
}

export function KeysPage() {
  const keys = useAllKeys();
  const [filter, setFilter] = useState<Filter>('working');
  const [open, setOpen] = useState<string | null>(null);
  const [making, setMaking] = useState(false);

  const groups = useMemo(() => {
    const shown = (keys.data ?? []).filter((k) => filter === 'all' || keyState(k) === filter);
    return [
      { title: 'Website', rows: shown.filter((k) => k.kind === 'website') },
      { title: 'Cars', rows: shown.filter((k) => k.kind === 'buyer' || k.kind === 'owner') },
      { title: 'Jobs', rows: shown.filter((k) => k.kind === 'job') },
    ];
  }, [keys.data, filter]);
  const current = keys.data?.find((k) => k.id === open) ?? null;

  return (
    <>
      <PageHeader title="Keys" back="/more" />
      <PageBody>
        <p className="text-sm text-muted-foreground">
          Codes that let people outside the team see a job, a car or the website. Make them on a job or car page, or here for the website.
        </p>
        <ToggleGroup type="single" variant="outline" spacing={2} className="flex flex-wrap" value={filter} onValueChange={(v) => v && setFilter(v as Filter)}>
          {FILTERS.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value} className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {keys.isPending && <Skeleton className="h-32 rounded-xl" />}
        {groups.map((g) => (
          <section key={g.title} className="flex flex-col gap-2">
            <div className="flex min-h-8 items-center justify-between">
              <h2 className="font-semibold">{g.title}</h2>
              {g.title === 'Website' && (
                <Button size="sm" variant="outline" onClick={() => setMaking(true)}>
                  <Plus /> Website key
                </Button>
              )}
            </div>
            {g.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{keys.isPending ? '…' : 'None.'}</p>
            ) : (
              <ul className="divide-y rounded-xl border px-2">
                {g.rows.map((k) => {
                  const { label } = subjectOf(k);
                  return (
                    <li key={k.id}>
                      <KeyRow accessKey={k} label={k.kind === 'website' ? undefined : label} onOpen={() => setOpen(k.id)} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </PageBody>

      <FormDrawer open={making} onOpenChange={setMaking} title="Make a website key">
        {making && (
          <KeyForm
            target={{ website: true }}
            onSaved={(k) => {
              setMaking(false);
              setOpen(k.id);
            }}
          />
        )}
      </FormDrawer>
      <KeyDrawer
        accessKey={current}
        subject={current ? subjectOf(current).subject : ''}
        openHref={current ? (subjectOf(current).to ?? undefined) : undefined}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
