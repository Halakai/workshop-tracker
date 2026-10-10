import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ClipboardCheck, Loader2, MinusCircle, Pencil, ShoppingCart, Undo2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { AddedBy } from '@/components/AddedBy';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { formatMoney } from '@/domain/money';
import { formatQuantity, toMilli } from '@/domain/quantity';
import { averageUnitCost } from '@/domain/stock';
import { formatDate } from '@/domain/dates';
import { syncErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { usePayerOptions } from '@/features/money/accounts';
import { MOVEMENT_LABELS } from './labels';
import { itemIsLow, stockOf, unitOf, useItem, useItemMovements, useUndoMovement, type Movement, type MovementWithPayment } from './api';
import { BuyDrawer } from './BuyDrawer';
import { UseDrawer } from './UseDrawer';
import { AdjustDrawer } from './AdjustDrawer';
import { ReceiptButton } from '@/features/files/ReceiptButton';
import { useRememberVisit } from '@/features/home/recent';

type Action = 'buy' | 'use' | 'adjust' | null;

export function ItemPage() {
  const { id } = useParams();
  const item = useItem(id);
  const movements = useItemMovements(id);
  const [action, setAction] = useState<Action>(null);
  const [undoing, setUndoing] = useState<Movement | null>(null);
  useRememberVisit('item', item.data?.id);

  if (item.isPending) {
    return (
      <>
        <PageHeader title="Item" back="/inventory" />
        <PageBody>
          <Skeleton className="h-40 rounded-xl" />
        </PageBody>
      </>
    );
  }
  if (!item.data) {
    return (
      <>
        <PageHeader title="Item" back="/inventory" />
        <PageBody>
          <p className="text-muted-foreground">This item doesn’t exist (anymore).</p>
        </PageBody>
      </>
    );
  }

  const it = item.data;
  const unit = unitOf(it).name;
  const stock = stockOf(it);
  const avg = averageUnitCost(stock);
  const low = itemIsLow(it);

  return (
    <>
      <PageHeader
        title={it.name}
        back="/inventory"
        actions={
          <Button variant="ghost" size="icon" asChild aria-label="Edit item">
            <Link to={`/inventory/${it.id}/edit`}>
              <Pencil className="size-5" />
            </Link>
          </Button>
        }
      />
      <PageBody>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-sm font-semibold tracking-wide">{it.part_number}</span>
              {it.brand && <span className="font-medium">{it.brand.name}</span>}
            </div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-sm text-muted-foreground">In stock</p>
                <p className={cn('text-3xl font-semibold tabular-nums', low && 'text-destructive')}>
                  {formatQuantity(stock.qty, unit)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {low && <Badge variant="destructive">low stock</Badge>}
                {it.archived_at && <Badge variant="secondary">archived</Badge>}
                <Badge variant="outline">{it.category?.name}</Badge>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Stat label="Average cost" value={avg === null ? '–' : `${formatMoney(avg)} / ${unit}`} />
              <Stat label="Stock value" value={formatMoney(stock.value)} />
              <Stat label="Minimum" value={toMilli(it.min_qty) > 0 ? formatQuantity(toMilli(it.min_qty), unit) : 'not set'} />
              {it.location && <Stat label="Location" value={it.location} />}
              {it.manufacturer_ref && <Stat label="Manufacturer ref" value={it.manufacturer_ref} />}
            </dl>
            {it.notes && <p className="text-sm whitespace-pre-wrap">{it.notes}</p>}
            <AddedBy by={it.created_by} at={it.created_at} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-2">
          <BigAction icon={ShoppingCart} label="Buy" onClick={() => setAction('buy')} />
          <BigAction icon={MinusCircle} label="Use" onClick={() => setAction('use')} disabled={stock.qty === 0} />
          <BigAction icon={ClipboardCheck} label="Adjust" onClick={() => setAction('adjust')} />
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold">History</h2>
          {movements.isPending && <Skeleton className="h-16 rounded-xl" />}
          {movements.data?.length === 0 && <p className="text-sm text-muted-foreground">No movements yet.</p>}
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
            {movements.data?.map((m, index) => (
              <MovementRow key={m.id} movement={m} unit={unit} canUndo={index === 0} onUndo={() => setUndoing(m)} />
            ))}
          </ul>
        </section>
      </PageBody>

      <BuyDrawer item={it} open={action === 'buy'} onOpenChange={(o) => !o && setAction(null)} />
      <UseDrawer item={it} open={action === 'use'} onOpenChange={(o) => !o && setAction(null)} />
      <AdjustDrawer item={it} open={action === 'adjust'} onOpenChange={(o) => !o && setAction(null)} />
      <UndoDialog movement={undoing} unit={unit} onClose={() => setUndoing(null)} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function BigAction({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof ShoppingCart;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button variant="outline" className="h-20 flex-col gap-1 text-base" onClick={onClick} disabled={disabled}>
      <Icon className="size-6 text-primary" />
      {label}
    </Button>
  );
}

function MovementRow({
  movement,
  unit,
  canUndo,
  onUndo,
}: {
  movement: MovementWithPayment;
  unit: string;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const payers = usePayerOptions();
  const { label, icon: Icon } = MOVEMENT_LABELS[movement.type];
  const qty = toMilli(movement.qty_delta);
  const payer = movement.transaction?.from_account_id;
  const payerLabel = payer ? payers.find((p) => p.accountId === payer)?.label : null;
  const occurred = formatDate(movement.occurred_on);
  const details = [
    occurred !== formatDate(movement.created_at) && occurred,
    movement.supplier,
    payerLabel && `paid by ${payerLabel}`,
    movement.reason,
    movement.note,
  ].filter(Boolean);

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">{label}</span>
          <span className={cn('font-semibold tabular-nums', qty > 0 ? 'text-success' : 'text-foreground')}>
            {qty > 0 ? '+' : ''}
            {formatQuantity(qty, unit)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2 text-sm text-muted-foreground">
          <span className="truncate">{details.join(' · ') || ' '}</span>
          <span className="tabular-nums">{formatMoney(movement.value_delta_cents, { sign: true })}</span>
        </div>
        <div className="flex items-center justify-between">
          <AddedBy by={movement.created_by} at={movement.created_at} />
          {movement.type === 'purchase' && <ReceiptButton entityType="stock_movement" entityId={movement.id} label={movement.supplier ?? undefined} />}
          {canUndo && (
            <Button variant="ghost" size="sm" onClick={onUndo}>
              <Undo2 /> Undo
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function UndoDialog({ movement, unit, onClose }: { movement: Movement | null; unit: string; onClose: () => void }) {
  const undo = useUndoMovement();
  if (!movement) return null;
  const { label } = MOVEMENT_LABELS[movement.type];
  return (
    <AlertDialog open onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Undo “{label} {formatQuantity(Math.abs(toMilli(movement.qty_delta)), unit)}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The stock goes back to exactly what it was before
            {movement.transaction_id ? ', and the payment for it is removed too' : ''}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            disabled={undo.isPending}
            onClick={async (e) => {
              e.preventDefault();
              try {
                await undo.mutateAsync(movement);
                toast.success('Undone');
                onClose();
              } catch (err) {
                toast.error(syncErrorMessage(err));
              }
            }}
          >
            {undo.isPending && <Loader2 className="animate-spin" />}
            Undo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
