import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Car, ChevronRight, Hammer, Package, Wrench, type LucideIcon } from 'lucide-react';
import { CarLogo } from '@/components/CarLogo';
import { carTitle } from '@/domain/cars';
import { useCars } from '@/features/cars/api';
import { useItems } from '@/features/inventory/api';
import { useJobs } from '@/features/jobs/api';
import { useTools } from '@/features/tools/api';
import { readRecent } from './recent';

/** The last cars, jobs, parts and tools opened on this device. */
export function RecentlyOpened() {
  const [visits] = useState(readRecent);
  const cars = useCars().data;
  const jobs = useJobs().data;
  const items = useItems().data;
  const tools = useTools().data;
  const entries = useMemo(() => {
    const list: { key: string; to: string; icon: LucideIcon; make?: string; title: string; sub: string }[] = [];
    for (const v of visits) {
      if (v.kind === 'car') {
        const c = cars?.find((x) => x.id === v.id);
        if (c) list.push({ key: `car:${c.id}`, to: `/cars/${c.id}`, icon: Car, make: c.make, title: carTitle(c), sub: c.plate ?? c.ref });
      } else if (v.kind === 'job') {
        const j = jobs?.find((x) => x.id === v.id);
        if (j) list.push({ key: `job:${j.id}`, to: `/jobs/${j.id}`, icon: Wrench, title: j.customer?.name ?? j.ref, sub: [j.ref, j.description].filter(Boolean).join(' · ') });
      } else if (v.kind === 'tool') {
        const t = tools?.find((x) => x.id === v.id);
        if (t) list.push({ key: `tool:${t.id}`, to: `/inventory/tools/${t.id}`, icon: Hammer, title: t.name, sub: t.code });
      } else {
        const i = items?.find((x) => x.id === v.id);
        if (i) list.push({ key: `item:${i.id}`, to: `/inventory/${i.id}`, icon: Package, title: i.name, sub: i.part_number });
      }
    }
    return list.slice(0, 10);
  }, [visits, cars, jobs, items, tools]);

  if (entries.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">Recently opened</h2>
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
        {entries.map(({ key, to, icon: Icon, make, title, sub }) => (
          <li key={key}>
            <Link to={to} className="flex min-h-14 items-center gap-3 px-4 py-2 active:bg-muted">
              <span className="flex w-9 shrink-0 justify-center">{make ? <CarLogo make={make} /> : <Icon className="size-5 text-primary" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{title}</span>
                <span className="block truncate text-xs text-muted-foreground">{sub}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
