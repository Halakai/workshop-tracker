import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Loader2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { SuffixInput } from '@/components/SuffixInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { CAR_STATUSES, type CarStatus } from '@/domain/cars';
import { centsToInput, parseMoney } from '@/domain/money';
import { syncErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useUpdateCar, type Car } from './api';

/** Bought → In repair → Ready for sale → Listed → Sold (or Scrapped). "Sold" opens the sale form. */
export function StatusDrawer({
  car,
  open,
  onOpenChange,
  onSell,
}: {
  car: Car;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSell: () => void;
}) {
  const update = useUpdateCar();
  const [listing, setListing] = useState(false);
  const [asking, setAsking] = useState(car.asking_price_cents ? centsToInput(car.asking_price_cents) : '');
  const [url, setUrl] = useState(car.listing_url ?? '');

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) setListing(false);
  };

  const setStatus = async (status: CarStatus, extra: { asking_price_cents?: number | null; listing_url?: string | null } = {}) => {
    try {
      await update.mutateAsync({ id: car.id, values: { status, ...extra } });
      toast.success('Status changed');
      close(false);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  const choose = (status: CarStatus) => {
    if (status === 'sold') {
      close(false);
      onSell();
    } else if (status === 'listed') {
      setListing(true);
    } else {
      void setStatus(status);
    }
  };

  return (
    <FormDrawer open={open} onOpenChange={close} title={listing ? 'Listed for sale' : 'Status'}>
      {listing ? (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="asking">Asking price</FieldLabel>
            <SuffixInput id="asking" suffix="€" value={asking} onChange={(e) => setAsking(e.target.value)} autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="listing-url">Ad link (optional)</FieldLabel>
            <Input id="listing-url" type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Button
            size="lg"
            disabled={update.isPending}
            onClick={() =>
              setStatus('listed', { asking_price_cents: asking.trim() ? parseMoney(asking) : null, listing_url: url.trim() || null })
            }
          >
            {update.isPending && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </FieldGroup>
      ) : (
        <div className="flex flex-col gap-2">
          {CAR_STATUSES.map((s) => (
            <Button
              key={s.value}
              variant="outline"
              size="lg"
              disabled={update.isPending}
              className={cn('justify-between', car.status === s.value && 'border-primary')}
              onClick={() => choose(s.value)}
            >
              {s.label}
              {car.status === s.value && <Check className="text-primary" />}
            </Button>
          ))}
          {car.saleCount > 0 && car.status !== 'sold' && (
            <p className="text-sm text-muted-foreground">This car has a sale payment recorded. Remove it in the sale form if the sale fell through.</p>
          )}
        </div>
      )}
    </FormDrawer>
  );
}
