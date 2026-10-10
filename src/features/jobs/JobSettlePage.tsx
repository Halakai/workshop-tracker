import { useParams } from 'react-router';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { todayIso } from '@/domain/dates';
import { SettleView } from '@/features/settlement/SettlePage';
import { useJob, useJobMoney } from './api';
import { jobCar } from './JobsListPage';

/** Settle up a paid job (profit = payments − parts). */
export function JobSettlePage() {
  const { id } = useParams();
  const job = useJob(id);
  const money = useJobMoney(id);
  if (job.isPending) {
    return (
      <>
        <PageHeader title="Settle up" back />
        <PageBody>
          <Skeleton className="h-64 rounded-xl" />
        </PageBody>
      </>
    );
  }
  if (!job.data) return null;
  const j = job.data;
  return (
    <SettleView
      target={{ kind: 'job', id: j.id }}
      title={`Settle up ${j.ref}`}
      subtitle={[j.customer?.name, jobCar(j), j.description].filter(Boolean).join(' · ')}
      backTo={`/jobs/${j.id}`}
      settled={Boolean(j.settled_at)}
      ready={j.status === 'paid'}
      notReady="Mark the job as paid first; then settle up."
      rows={money.data}
      stockCents={j.money.stockCents}
      defaultDate={todayIso()}
      costWord="job"
    />
  );
}
