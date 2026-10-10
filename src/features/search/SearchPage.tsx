import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { BookUser, Car, ChevronRight, Hammer, Package, Search, Wallet, Wrench, type LucideIcon } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { search, type SearchDoc } from '@/domain/search';
import { carStatusLabel, carTitle, type CarStatus } from '@/domain/cars';
import { jobStatusLabel, type JobStatus } from '@/domain/jobs';
import { centsToInput, formatMoney } from '@/domain/money';
import { formatDate } from '@/domain/dates';
import { formatQuantity, toMilli } from '@/domain/quantity';
import { useCars } from '@/features/cars/api';
import { useJobs } from '@/features/jobs/api';
import { unitOf, useItems } from '@/features/inventory/api';
import { useContacts } from '@/features/contacts/api';
import { useTransactions } from '@/features/money/api';
import { categoryInfo } from '@/features/money/labels';
import { useTools } from '@/features/tools/api';
import { useProfileNames } from '@/features/auth/profiles';
import { conditionLabel, goneLabel } from '@/domain/tools';

type Group = 'cars' | 'jobs' | 'items' | 'tools' | 'contacts' | 'money';

const GROUPS: { id: Group; label: string; icon: LucideIcon }[] = [
  { id: 'cars', label: 'Cars', icon: Car },
  { id: 'jobs', label: 'Jobs', icon: Wrench },
  { id: 'items', label: 'Inventory', icon: Package },
  { id: 'tools', label: 'Tools', icon: Hammer },
  { id: 'contacts', label: 'Contacts', icon: BookUser },
  { id: 'money', label: 'Money', icon: Wallet },
];

interface Result extends SearchDoc {
  group: Group;
  to: string;
  heading: string;
  sub: string;
  right?: string;
}

const SHOWN = 5;

/** One search for everything: cars, jobs, inventory, contacts and money entries. */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const [expanded, setExpanded] = useState<Set<Group>>(new Set());
  const cars = useCars();
  const jobs = useJobs();
  const items = useItems();
  const contacts = useContacts();
  const money = useTransactions();
  const tools = useTools();
  const names = useProfileNames();
  const loading = cars.isPending || jobs.isPending || items.isPending || tools.isPending || contacts.isPending || money.isPending;

  const docs = useMemo<Result[]>(() => {
    const list: Result[] = [];
    for (const c of cars.data ?? []) {
      list.push({
        key: `car:${c.id}`,
        group: 'cars',
        to: `/cars/${c.id}`,
        title: carTitle(c),
        codes: [c.ref, c.plate, c.vin],
        text: [c.generation, c.engine, c.fuel, c.colour, c.notes, c.seller?.name, c.buyer?.name, carStatusLabel(c.status as CarStatus)],
        heading: carTitle(c),
        sub: [c.ref, c.plate].filter(Boolean).join(' · '),
        right: carStatusLabel(c.status as CarStatus),
      });
    }
    for (const j of jobs.data ?? []) {
      list.push({
        key: `job:${j.id}`,
        group: 'jobs',
        to: `/jobs/${j.id}`,
        title: `${j.customer?.name ?? ''} ${j.description}`,
        codes: [j.ref, j.invoice_number, j.car_plate, j.car_vin],
        text: [j.car_make, j.car_model, j.car_generation, j.car_engine, j.notes, j.customer?.phone, jobStatusLabel(j.status as JobStatus)],
        heading: j.customer?.name ?? j.ref,
        sub: [j.ref, j.description, [j.car_make, j.car_model].filter(Boolean).join(' '), j.car_plate].filter(Boolean).join(' · '),
        right: formatMoney(j.totals.due),
      });
    }
    for (const i of items.data ?? []) {
      list.push({
        key: `item:${i.id}`,
        group: 'items',
        to: `/inventory/${i.id}`,
        title: i.name,
        codes: [i.part_number, i.manufacturer_ref],
        text: [i.brand?.name, i.category?.name, i.location, i.notes],
        heading: i.name,
        sub: [i.part_number, i.brand?.name, i.location].filter(Boolean).join(' · '),
        right: formatQuantity(toMilli(i.qty_on_hand), unitOf(i).name),
      });
    }
    for (const t of tools.data ?? []) {
      const status = t.gone_reason ? goneLabel(t.gone_reason) : t.lent_to ? `at ${t.lent_to}` : t.condition !== 'good' ? conditionLabel(t.condition) : '';
      list.push({
        key: `tool:${t.id}`,
        group: 'tools',
        to: `/inventory/tools/${t.id}`,
        title: t.name,
        codes: [t.code, t.serial_number, t.model],
        text: [t.brand?.name, t.category?.name, t.location, t.lent_to, t.owner_id ? names.get(t.owner_id) : null, t.bought_from, t.notes, status],
        heading: t.name,
        sub: [t.code, [t.brand?.name, t.model].filter(Boolean).join(' '), t.location].filter(Boolean).join(' · '),
        right: status,
      });
    }
    for (const c of contacts.data ?? []) {
      list.push({
        key: `contact:${c.id}`,
        group: 'contacts',
        to: `/contacts?open=${c.id}`,
        title: c.name,
        codes: [c.phone],
        text: [c.notes],
        heading: c.name,
        sub: c.phone ?? '',
      });
    }
    for (const t of money.data ?? []) {
      const label = categoryInfo(t.category).label;
      list.push({
        key: `money:${t.id}`,
        group: 'money',
        to: t.car_id ? `/cars/${t.car_id}` : t.job_id ? `/jobs/${t.job_id}` : '/money',
        title: t.description ?? label,
        codes: [t.car?.ref],
        // amounts can be typed as 120.50 or 120,50
        text: [label, t.counterparty, t.expense_category?.name, t.car ? carTitle(t.car) : null, centsToInput(t.amount_cents), centsToInput(t.amount_cents).replace('.', ',')],
        heading: t.description ?? label,
        sub: [formatDate(t.occurred_on), label, t.counterparty, t.car?.ref].filter(Boolean).join(' · '),
        right: formatMoney(t.amount_cents),
      });
    }
    return list;
  }, [cars.data, jobs.data, items.data, tools.data, names, contacts.data, money.data]);

  const results = useMemo(() => search(query, docs), [query, docs]);
  const byGroup = GROUPS.map((g) => ({ ...g, rows: results.filter((r) => r.group === g.id) })).filter((g) => g.rows.length > 0);

  return (
    <>
      <PageHeader title="Search" back />
      <PageBody>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            autoFocus
            enterKeyHint="search"
            placeholder="Plate, VIN, name, part number, phone, amount…"
            value={query}
            onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
            className="pl-10"
          />
        </div>

        {!query.trim() && (
          <p className="text-sm text-muted-foreground">
            Finds cars (make, model, plate, VIN, car ID), jobs (customer, work, plate, invoice number), inventory (name, part
            number, brand, shelf), tools (name, ID, brand, serial number, who has it), contacts (name, phone) and money entries
            (description, who, amount). Spaces and dashes don’t matter in plates and IDs.
          </p>
        )}
        {query.trim() && loading && <Skeleton className="h-40 rounded-xl" />}
        {query.trim() && !loading && results.length === 0 && <p className="text-muted-foreground">Nothing found for “{query.trim()}”.</p>}

        {byGroup.map(({ id, label, icon: Icon, rows }) => {
          const all = expanded.has(id);
          return (
            <section key={id} className="flex flex-col gap-2">
              <h2 className="flex items-center gap-2 font-semibold">
                <Icon className="size-4 text-muted-foreground" /> {label}
                <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
              </h2>
              <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
                {(all ? rows : rows.slice(0, SHOWN)).map((r) => (
                  <li key={r.key}>
                    <Link to={r.to} className="flex min-h-14 items-center gap-3 px-4 py-2.5 active:bg-muted">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.heading}</span>
                        {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
                      </span>
                      {r.right && <span className="shrink-0 text-sm tabular-nums">{r.right}</span>}
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
              {rows.length > SHOWN && !all && (
                <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set([...expanded, id]))}>
                  Show all {rows.length}
                </Button>
              )}
            </section>
          );
        })}
      </PageBody>
    </>
  );
}
