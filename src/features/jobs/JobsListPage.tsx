import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { jobStatusLabel, type JobStatus } from '@/domain/jobs';
import { formatMoney } from '@/domain/money';
import { cn } from '@/lib/utils';
import { useJobs, type Job } from './api';

type Filter = 'active' | 'all' | JobStatus;

const STATUS_STYLES: Record<JobStatus, string> = {
  open: 'bg-warning/20 text-foreground',
  done: 'bg-primary/15 text-foreground',
  paid: 'bg-success/20 text-foreground',
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge className={cn('border-transparent', STATUS_STYLES[status])}>{jobStatusLabel(status)}</Badge>;
}

export function jobCar(job: Pick<Job, 'car_make' | 'car_model' | 'car_plate'>): string {
  return [[job.car_make, job.car_model].filter(Boolean).join(' '), job.car_plate].filter(Boolean).join(' · ');
}

export function JobsListPage() {
  const jobs = useJobs();
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (jobs.data ?? []).filter((j) => {
      if (filter === 'active' && j.status === 'paid') return false;
      if (filter !== 'active' && filter !== 'all' && j.status !== filter) return false;
      const hay = [j.ref, j.customer?.name, j.car_make, j.car_model, j.car_plate, j.description, j.invoice_number].filter(Boolean).join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [jobs.data, filter, query]);

  const open = (jobs.data ?? []).filter((j) => j.status !== 'paid');
  const outstanding = (jobs.data ?? []).reduce((s, j) => s + (j.status === 'done' ? j.totals.outstanding : 0), 0);

  const filters: { value: Filter; label: string }[] = [
    { value: 'active', label: `Open & done (${open.length})` },
    { value: 'open', label: 'Open' },
    { value: 'done', label: 'Done' },
    { value: 'paid', label: 'Paid' },
    { value: 'all', label: 'All' },
  ];

  return (
    <>
      <PageHeader
        title="Jobs"
        actions={
          <Button size="sm" asChild>
            <Link to="/jobs/new">
              <Plus /> Job
            </Link>
          </Button>
        }
      />
      <PageBody>
        {outstanding > 0 && (
          <p className="text-sm text-muted-foreground">
            Done but not paid yet: <span className="font-semibold text-foreground">{formatMoney(outstanding)}</span>
          </p>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" placeholder="Customer, plate, job or invoice no." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {filters.map((f) => (
            <Button key={f.value} variant={filter === f.value ? 'default' : 'outline'} size="sm" className="shrink-0 rounded-full" onClick={() => setFilter(f.value)}>
              {f.label}
            </Button>
          ))}
        </div>

        {jobs.isPending && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        {jobs.isError && <p className="text-destructive">{jobs.error.message}</p>}
        {jobs.data && visible.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            {jobs.data.length === 0 ? (
              <>
                No jobs yet.{' '}
                <Link to="/jobs/new" className="text-primary underline">
                  Add the first one
                </Link>
                .
              </>
            ) : (
              'No jobs here.'
            )}
          </div>
        )}
        <ul className="flex flex-col gap-2">
          {visible.map((job) => (
            <li key={job.id}>
              <Link to={`/jobs/${job.id}`} className="flex flex-col gap-1.5 rounded-xl border bg-card p-4 active:bg-muted">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{job.customer?.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{job.description}</p>
                  </div>
                  <JobStatusBadge status={job.status as JobStatus} />
                </div>
                <div className="flex items-end justify-between gap-2 text-sm">
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {job.ref}
                    {jobCar(job) && ` · ${jobCar(job)}`}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatMoney(job.totals.due)}
                    {job.totals.outstanding > 0 && job.status !== 'open' && (
                      <span className="ml-1 text-xs font-normal text-destructive">({formatMoney(job.totals.outstanding)} open)</span>
                    )}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </PageBody>
    </>
  );
}
