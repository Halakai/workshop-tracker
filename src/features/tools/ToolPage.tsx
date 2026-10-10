import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ArchiveRestore, CornerDownLeft, Handshake, Loader2, PackageX, Pencil, Stethoscope, Trash2, Wallet } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { AddedBy } from '@/components/AddedBy';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/domain/money';
import { formatDate, formatDateTime, todayIso } from '@/domain/dates';
import { conditionLabel, goneLabel, lentSince, warrantyState } from '@/domain/tools';
import { syncErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useProfileNames } from '@/features/auth/profiles';
import { useAccountLabels } from '@/features/money/api';
import { AttachmentStrip } from '@/features/files/AttachmentStrip';
import { useRememberVisit } from '@/features/home/recent';
import { useRemoveToolPayment, useSaveTool, useTool, useToolHistory, type Tool } from './api';
import { ToolBadges } from './ToolBadges';
import { ConditionDrawer, GoneDrawer, LendDrawer, PaymentDrawer } from './ToolDrawers';

type Action = 'lend' | 'condition' | 'gone' | 'pay' | null;

export function ToolPage() {
  const { id } = useParams();
  const tool = useTool(id);
  useRememberVisit('tool', tool.data?.id);

  if (tool.isPending || !tool.data) {
    return (
      <>
        <PageHeader title="Tool" back="/inventory/tools" />
        <PageBody>
          {tool.isPending ? <Skeleton className="h-48 rounded-xl" /> : <p className="text-muted-foreground">This tool doesn’t exist (anymore).</p>}
        </PageBody>
      </>
    );
  }
  return <ToolView tool={tool.data} />;
}

function ToolView({ tool }: { tool: Tool }) {
  const names = useProfileNames();
  const save = useSaveTool();
  const [action, setAction] = useState<Action>(null);
  const today = todayIso();
  const warranty = warrantyState(tool.warranty_until, today);
  const owner = tool.owner_id ? (names.get(tool.owner_id) ?? 'a partner') : 'The workshop';
  const gone = Boolean(tool.gone_on);

  const update = async (values: Parameters<typeof save.mutateAsync>[0]['values'], message: string) => {
    try {
      await save.mutateAsync({ id: tool.id, values });
      toast.success(message);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title={tool.name}
        back="/inventory/tools"
        actions={
          <Button variant="ghost" size="icon" asChild aria-label="Edit tool">
            <Link to={`/inventory/tools/${tool.id}/edit`}>
              <Pencil className="size-5" />
            </Link>
          </Button>
        }
      />
      <PageBody>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-sm font-semibold tracking-wide">{tool.code}</span>
              {(tool.brand || tool.model) && <span className="font-medium">{[tool.brand?.name, tool.model].filter(Boolean).join(' ')}</span>}
              <Badge variant="outline" className="ml-auto">
                {tool.category?.name}
              </Badge>
            </div>
            {(tool.lent_to || tool.condition !== 'good' || gone) && <ToolBadges tool={tool} className="justify-start" />}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Stat label="Belongs to" value={owner} />
              {tool.qty > 1 && <Stat label="How many" value={String(tool.qty)} />}
              {tool.location && <Stat label="Where" value={tool.location} />}
              <Stat label="Condition" value={conditionLabel(tool.condition)} />
              {tool.serial_number && <Stat label="Serial number" value={tool.serial_number} mono />}
              {tool.bought_on && <Stat label="Bought" value={formatDate(tool.bought_on)} />}
              {tool.bought_from && <Stat label="Bought from" value={tool.bought_from} />}
              {tool.price_cents !== null && <Stat label="Price" value={formatMoney(tool.price_cents)} />}
              {warranty && <Stat label="Warranty" value={warranty.text} className={cn(warranty.over && 'text-muted-foreground line-through')} />}
              {gone && <Stat label="No longer have it" value={`${goneLabel(tool.gone_reason!)}, ${formatDate(tool.gone_on)}`} />}
            </dl>
            {tool.notes && <p className="text-sm whitespace-pre-wrap">{tool.notes}</p>}
            <AddedBy by={tool.created_by} at={tool.created_at} />
          </CardContent>
        </Card>

        {tool.lent_to && !gone && (
          <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
            <Handshake className="size-5 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-medium">{tool.lent_to}</span> has it {tool.lent_on && lentSince(tool.lent_on, today)}
            </p>
            <Button size="sm" disabled={save.isPending} onClick={() => update({ lent_to: null, lent_on: null }, `${tool.name} is back`)}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <CornerDownLeft />} Back
            </Button>
          </div>
        )}

        {gone ? (
          <Button variant="outline" size="lg" disabled={save.isPending} onClick={() => update({ gone_on: null, gone_reason: null }, 'Back in the tools list')}>
            <ArchiveRestore /> We have it again
          </Button>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <BigAction icon={Handshake} label="Lend" onClick={() => setAction('lend')} disabled={Boolean(tool.lent_to)} />
            <BigAction icon={Stethoscope} label="Condition" onClick={() => setAction('condition')} />
            <BigAction icon={PackageX} label="Gone" onClick={() => setAction('gone')} />
          </div>
        )}

        <PaymentSection tool={tool} onPay={() => setAction('pay')} />

        <AttachmentStrip entityType="tool" entityId={tool.id} kind="photo" title="Photos" />
        <AttachmentStrip entityType="tool" entityId={tool.id} kind="receipt" title="Receipt, warranty & manual" allowPdf />

        <History tool={tool} />
      </PageBody>

      <LendDrawer tool={tool} open={action === 'lend'} onOpenChange={(o) => !o && setAction(null)} />
      <ConditionDrawer tool={tool} open={action === 'condition'} onOpenChange={(o) => !o && setAction(null)} />
      <GoneDrawer tool={tool} open={action === 'gone'} onOpenChange={(o) => !o && setAction(null)} />
      <PaymentDrawer tool={tool} open={action === 'pay'} onOpenChange={(o) => !o && setAction(null)} />
    </>
  );
}

/** Whether the purchase is in Money (a workshop expense) and who paid. */
function PaymentSection({ tool, onPay }: { tool: Tool; onPay: () => void }) {
  const accountLabel = useAccountLabels();
  const remove = useRemoveToolPayment();
  if (tool.payment) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border p-3 text-sm">
        <p className="flex items-start gap-2">
          <Wallet className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            In Money: {formatMoney(tool.payment.amount_cents)} paid by <span className="font-medium">{accountLabel(tool.payment.from_account_id)}</span>{' '}
            on {formatDate(tool.payment.occurred_on)}, split by profit shares.
          </span>
        </p>
        {tool.payment.amount_cents !== tool.price_cents && (
          <p className="rounded-md bg-warning/15 px-2 py-1">
            The tool’s price is {formatMoney(tool.price_cents ?? 0)}. Saving the tool (✎) puts that price into Money.
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onPay}>
            Who paid
          </Button>
          <ConfirmButton
            variant="ghost"
            size="sm"
            title="Take the purchase out of Money?"
            description="The workshop expense for this tool is deleted, so balances and profit change back. The tool itself stays."
            confirmLabel="Take out"
            onConfirm={async () => {
              try {
                await remove.mutateAsync(tool.payment!.id);
                toast.success('Taken out of Money');
              } catch (e) {
                toast.error(syncErrorMessage(e));
              }
            }}
          >
            <Trash2 /> Take out of Money
          </ConfirmButton>
        </div>
      </div>
    );
  }
  if (tool.owner_id || !tool.price_cents || tool.gone_on) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed p-3 text-sm">
      <Wallet className="size-4 shrink-0 text-muted-foreground" />
      <p className="flex-1 text-muted-foreground">Bought with workshop money? Put the purchase into Money.</p>
      <Button variant="outline" size="sm" onClick={onPay}>
        Add to Money
      </Button>
    </div>
  );
}

function History({ tool }: { tool: Tool }) {
  const history = useToolHistory(tool.id);
  const names = useProfileNames();
  if (!history.data?.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">History</h2>
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
        {history.data.map((h) => (
          <li key={h.id} className="px-4 py-2.5">
            <p className="text-sm">{h.summary}</p>
            <p className="text-xs text-muted-foreground">
              {h.actor_id ? (names.get(h.actor_id) ?? 'someone') : 'system'} · {formatDateTime(h.at)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-medium break-words', mono && 'font-mono', className)}>{value}</dd>
    </div>
  );
}

function BigAction({ icon: Icon, label, onClick, disabled }: { icon: typeof Wallet; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" className="h-20 flex-col gap-1 text-base" onClick={onClick} disabled={disabled}>
      <Icon className="size-6 text-primary" />
      {label}
    </Button>
  );
}
