import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Banknote, ChevronRight, FileText, Handshake, Loader2, Package, Pencil, Phone, Plus, Undo2, Wrench } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { AddedBy } from '@/components/AddedBy';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { JOB_STATUSES, type JobStatus } from '@/domain/jobs';
import { formatMoney } from '@/domain/money';
import { formatShare } from '@/domain/shares';
import { formatQuantity, toMilli } from '@/domain/quantity';
import { formatDate } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useAccountLabels } from '@/features/money/api';
import { useProfiles } from '@/features/auth/profiles';
import { useSettlement, useShares, useUndoSettlement } from '@/features/settlement/api';
import { SharesDrawer } from '@/features/settlement/SharesDrawer';
import { useSettings } from '@/features/settings/api';
import { useJob, useJobLines, useJobMoney, useIssueInvoiceNumber, useSaveJob, type Job, type JobLine } from './api';
import { jobCar } from './JobsListPage';
import { BoughtLineDrawer, LaborDrawer, OtherLineDrawer, PaymentDrawer, StockLineDrawer, type PaymentRow } from './JobDrawers';
import { buildInvoiceData, shareOrDownload } from './invoice/makeInvoice';
import { AttachmentStrip } from '@/features/files/AttachmentStrip';
import { useRememberVisit } from '@/features/home/recent';
import { useAttachments, useDeleteAttachment, useUploadAttachment } from '@/features/files/api';

export function JobPage() {
  const { id } = useParams();
  const job = useJob(id);
  if (job.isPending) {
    return (
      <>
        <PageHeader title="Job" back="/jobs" />
        <PageBody>
          <Skeleton className="h-48 rounded-xl" />
        </PageBody>
      </>
    );
  }
  if (!job.data) {
    return (
      <>
        <PageHeader title="Job" back="/jobs" />
        <PageBody>
          <p className="text-muted-foreground">This job doesn’t exist (anymore).</p>
        </PageBody>
      </>
    );
  }
  return <JobView job={job.data} />;
}

type LineDrawer = { kind: 'stock' } | { kind: 'other'; line?: JobLine } | { kind: 'bought'; line?: JobLine } | null;

function JobView({ job }: { job: Job }) {
  useRememberVisit('job', job.id);
  const lines = useJobLines(job.id);
  const money = useJobMoney(job.id);
  const label = useAccountLabels();
  const profiles = useProfiles();
  const settings = useSettings();
  const saveJob = useSaveJob();
  const issue = useIssueInvoiceNumber();
  const target = { kind: 'job' as const, id: job.id };
  const shares = useShares(target);
  const settlement = useSettlement(target);
  const undoSettlement = useUndoSettlement();
  const [lineDrawer, setLineDrawer] = useState<LineDrawer>(null);
  const [laborOpen, setLaborOpen] = useState(false);
  const [payment, setPayment] = useState<{ row?: PaymentRow } | null>(null);
  const [editingShares, setEditingShares] = useState(false);
  const [making, setMaking] = useState(false);
  const files = useAttachments('job', job.id);
  const uploadFile = useUploadAttachment();
  const deleteFile = useDeleteAttachment();

  const status = job.status as JobStatus;
  const settled = Boolean(job.settled_at);
  const { totals } = job;
  const payments = (money.data ?? []).filter((t) => t.category === 'job_payment');
  const partnerName = (id: string) => profiles.data?.find((p) => p.id === id)?.display_name ?? 'partner';

  const setStatus = async (next: JobStatus) => {
    try {
      await saveJob.mutateAsync({
        id: job.id,
        values: {
          ref: job.ref,
          customer_id: job.customer_id,
          description: job.description,
          status: next,
          done_on: next === 'open' ? null : (job.done_on ?? new Date().toISOString().slice(0, 10)),
        },
      });
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  const makeInvoice = async () => {
    if (!settings.data || !lines.data) return;
    setMaking(true);
    try {
      const number = await issue.mutateAsync(job.id);
      const { renderInvoicePdf } = await import('./invoice/InvoiceDocument');
      const data = buildInvoiceData({ job, number, lines: lines.data, settings: settings.data });
      const blob = await renderInvoicePdf(data);
      const name = `${data.title} ${number} ${job.customer?.name ?? ''}`.trim();
      // a copy goes to Google Drive (Invoices/<year>), replacing the previous copy of this job's invoice
      const previous = (files.data ?? []).filter((f) => f.kind === 'invoice');
      uploadFile
        .mutateAsync({ file: new File([blob], `${name}.pdf`, { type: 'application/pdf' }), entityType: 'job', entityId: job.id, kind: 'invoice', label: name })
        .then(() => Promise.all(previous.map((p) => deleteFile.mutateAsync(p))))
        .then(() => toast.success('Invoice copy saved in Google Drive'))
        .catch((e: Error) => toast.warning(`Invoice not copied to Google Drive: ${e.message}`));
      await shareOrDownload(blob, name);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    } finally {
      setMaking(false);
    }
  };

  return (
    <>
      <PageHeader
        title={`${job.ref} · ${job.customer?.name ?? ''}`}
        back="/jobs"
        actions={
          !settled && (
            <Button variant="ghost" size="icon" asChild aria-label="Edit job">
              <Link to={`/jobs/${job.id}/edit`}>
                <Pencil className="size-5" />
              </Link>
            </Button>
          )
        }
      />
      <PageBody>
        <div className="grid grid-cols-3 gap-1.5">
          {JOB_STATUSES.map((s) => (
            <Button
              key={s.value}
              variant={status === s.value ? 'default' : 'outline'}
              disabled={settled || saveJob.isPending}
              onClick={() => status !== s.value && setStatus(s.value)}
            >
              {s.label}
            </Button>
          ))}
        </div>

        <Card>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{job.customer?.name}</p>
                {jobCar(job) && <p className="text-muted-foreground">{jobCar(job)}</p>}
                {job.car_vin && <p className="font-mono text-xs text-muted-foreground">{job.car_vin}</p>}
              </div>
              {job.customer?.phone && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`tel:${job.customer.phone.replace(/\s/g, '')}`}>
                    <Phone /> Call
                  </a>
                </Button>
              )}
            </div>
            <p className="whitespace-pre-wrap">{job.description}</p>
            {job.notes && <p className="whitespace-pre-wrap text-muted-foreground">{job.notes}</p>}
            <AddedBy by={job.created_by} at={job.created_at} />
          </CardContent>
        </Card>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">Charged to the customer</h2>
          {lines.isPending && <Skeleton className="h-16 rounded-xl" />}
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
            {lines.data?.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                onOpen={settled ? undefined : () => setLineDrawer(line.kind === 'bought' ? { kind: 'bought', line } : { kind: 'other', line })}
              />
            ))}
            <li>
              <button
                type="button"
                disabled={settled}
                onClick={() => setLaborOpen(true)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted"
              >
                <Wrench className="size-5 text-muted-foreground" />
                <span className="flex-1 font-medium">Labor</span>
                <span className="font-semibold tabular-nums">{formatMoney(job.labor_price_cents)}</span>
              </button>
            </li>
          </ul>
          {!settled && (
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="h-14 flex-col gap-0.5 text-xs" onClick={() => setLineDrawer({ kind: 'stock' })}>
                <Package className="size-5 text-primary" /> From stock
              </Button>
              <Button variant="outline" className="h-14 flex-col gap-0.5 text-xs" onClick={() => setLineDrawer({ kind: 'bought' })}>
                <Wrench className="size-5 text-primary" /> Part bought
              </Button>
              <Button variant="outline" className="h-14 flex-col gap-0.5 text-xs" onClick={() => setLineDrawer({ kind: 'other' })}>
                <Plus className="size-5 text-primary" /> Other
              </Button>
            </div>
          )}
        </section>

        <Card>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            <Line label="Parts and other lines" value={formatMoney(job.money.linesCents)} />
            <Line label="Labor" value={formatMoney(job.money.laborCents)} />
            <Line label="Total" value={formatMoney(totals.due)} strong />
            <Line label="Paid" value={formatMoney(totals.paid)} />
            {totals.outstanding > 0 && <Line label="Still to pay" value={formatMoney(totals.outstanding)} strong className="text-destructive" />}
            <div className="my-1 border-t" />
            <Line label="Our costs (parts)" value={formatMoney(totals.cost)} />
            <Line
              label={status === 'paid' ? 'Profit' : 'Expected profit'}
              value={formatMoney(status === 'paid' ? totals.profit : totals.expectedProfit, { sign: true })}
              className={(status === 'paid' ? totals.profit : totals.expectedProfit) >= 0 ? 'text-success' : 'text-destructive'}
            />
          </CardContent>
        </Card>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Payments</h2>
            {!settled && (
              <Button variant="outline" size="sm" onClick={() => setPayment({})}>
                <Banknote /> Customer paid
              </Button>
            )}
          </div>
          {payments.length === 0 && <p className="text-sm text-muted-foreground">No payment yet.</p>}
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border empty:hidden">
            {payments.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={settled}
                  onClick={() => setPayment({ row: p })}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted"
                >
                  <Banknote className="size-5 text-success" />
                  <span className="flex-1">
                    {formatDate(p.occurred_on)} · to {label(p.to_account_id)}
                  </span>
                  <span className="font-semibold text-success tabular-nums">{formatMoney(p.amount_cents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <Button size="lg" variant="outline" disabled={making || !settings.data || !lines.data} onClick={makeInvoice}>
          {making ? <Loader2 className="animate-spin" /> : <FileText />}
          {job.invoice_number ? `Invoice ${job.invoice_number} (PDF)` : 'Make invoice (PDF)'}
        </Button>
        {!job.invoice_number && (
          <p className="-mt-2 text-center text-xs text-muted-foreground">Gets the next invoice number the first time.</p>
        )}

        <AttachmentStrip entityType="job" entityId={job.id} kind="photo" title="Photos" />

        {!settled && (
          <Card>
            <CardHeader>
              <CardTitle>Profit shares</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p>
                {(shares.data ?? []).length === 0
                  ? 'Not set'
                  : (shares.data ?? []).map((s) => `${partnerName(s.partner_id)} ${formatShare(s.share_bp)}`).join(' · ')}
              </p>
              <Button variant="outline" size="sm" className="self-start" onClick={() => setEditingShares(true)}>
                <Pencil /> Change for this job
              </Button>
            </CardContent>
          </Card>
        )}

        {status === 'paid' && !settled && (
          <Button size="lg" asChild>
            <Link to={`/jobs/${job.id}/settle`}>
              <Handshake /> Settle up
            </Link>
          </Button>
        )}

        {settled && settlement.data && (
          <Card>
            <CardHeader>
              <CardTitle>Settled {formatDate(settlement.data.settled_on)}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {settlement.data.allocations.map((a) => (
                <div key={a.partner_id} className="flex justify-between">
                  <span>{partnerName(a.partner_id)}</span>
                  <span className={cn('font-medium tabular-nums', a.amount_cents < 0 && 'text-destructive')}>{formatMoney(a.amount_cents, { sign: true })}</span>
                </div>
              ))}
              {settlement.data.transactions.map((t) => (
                <p key={t.id} className="text-muted-foreground">
                  {label(t.from_account_id)} → {label(t.to_account_id)}: {formatMoney(t.amount_cents)}
                </p>
              ))}
              <ConfirmButton
                variant="ghost"
                className="self-start"
                title="Undo the settlement?"
                description="Its profit split and transfers are removed and the job can be changed again."
                confirmLabel="Undo settlement"
                onConfirm={async () => {
                  try {
                    await undoSettlement.mutateAsync(target);
                    toast.success('Settlement undone');
                  } catch (e) {
                    toast.error(syncErrorMessage(e));
                  }
                }}
              >
                <Undo2 /> Undo settlement
              </ConfirmButton>
            </CardContent>
          </Card>
        )}
      </PageBody>

      <StockLineDrawer job={job} open={lineDrawer?.kind === 'stock'} onOpenChange={(o) => !o && setLineDrawer(null)} />
      <OtherLineDrawer
        job={job}
        line={lineDrawer?.kind === 'other' ? lineDrawer.line : undefined}
        open={lineDrawer?.kind === 'other'}
        onClose={() => setLineDrawer(null)}
      />
      <BoughtLineDrawer
        job={job}
        line={lineDrawer?.kind === 'bought' ? lineDrawer.line : undefined}
        open={lineDrawer?.kind === 'bought'}
        onClose={() => setLineDrawer(null)}
      />
      <LaborDrawer job={job} open={laborOpen} onOpenChange={setLaborOpen} />
      <PaymentDrawer job={job} payment={payment?.row} open={payment !== null} onClose={() => setPayment(null)} />
      <SharesDrawer target={target} open={editingShares} onOpenChange={setEditingShares} />
    </>
  );
}

function Line({ label, value, strong, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn('flex justify-between gap-2', strong && 'text-base font-semibold', className)}>
      <span className={strong ? undefined : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function LineRow({ line, onOpen }: { line: JobLine; onOpen?: () => void }) {
  const qty = toMilli(line.qty);
  const qtyText = line.kind === 'stock' ? formatQuantity(qty, line.unit ?? undefined) : qty === 1000 ? '' : `${formatQuantity(qty)} ×`;
  const kindLabel = line.kind === 'stock' ? 'from stock' : line.kind === 'bought' ? 'bought' : '';
  const content = (
    <>
      {line.kind === 'stock' ? (
        <Package className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      ) : line.kind === 'bought' ? (
        <Wrench className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      ) : (
        <Plus className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{line.description}</span>
          <span className="shrink-0 font-semibold tabular-nums">{formatMoney(line.sale_price_cents)}</span>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {[qtyText, kindLabel, line.cost > 0 && `cost ${formatMoney(line.cost)}`].filter(Boolean).join(' · ')}
        </p>
      </div>
      {onOpen && <ChevronRight className="mt-0.5 size-5 shrink-0 text-muted-foreground" />}
    </>
  );
  return (
    <li>
      {onOpen ? (
        <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-muted">
          {content}
        </button>
      ) : (
        <div className="flex items-start gap-3 px-4 py-3">{content}</div>
      )}
    </li>
  );
}
