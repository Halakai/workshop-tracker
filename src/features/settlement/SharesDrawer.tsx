import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FULL_SHARE_BP, formatShare, parseSharePercent } from '@/domain/shares';
import { syncErrorMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useProfiles } from '@/features/auth/profiles';
import { useSetShares, useShares, type Target } from './api';

/** Profit shares for one car or job: defaults, "all to one person", or custom percentages. */
export function SharesDrawer({ target, open, onOpenChange }: { target: Target; open: boolean; onOpenChange: (o: boolean) => void }) {
  const profiles = useProfiles();
  const shares = useShares(target);
  const save = useSetShares();
  const partners = (profiles.data ?? []).filter((p) => p.is_active || shares.data?.some((s) => s.partner_id === p.id));
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setValues(Object.fromEntries(partners.map((p) => [p.id, String((shares.data?.find((s) => s.partner_id === p.id)?.share_bp ?? 0) / 100)])));
  }, [open, shares.data, profiles.data]);

  const parsed = partners.map((p) => ({ partnerId: p.id, bp: parseSharePercent(values[p.id] ?? '') }));
  const invalid = parsed.some((p) => p.bp === null);
  const total = parsed.reduce((s, p) => s + (p.bp ?? 0), 0);
  const complete = !invalid && total === FULL_SHARE_BP;

  const preset = (fn: (id: string) => number) => setValues(Object.fromEntries(partners.map((p) => [p.id, String(fn(p.id) / 100)])));

  const submit = async () => {
    try {
      await save.mutateAsync({ target, shares: parsed.map((p) => ({ partnerId: p.partnerId, bp: p.bp! })) });
      toast.success('Shares saved');
      onOpenChange(false);
    } catch (e) {
      toast.error(syncErrorMessage(e));
    }
  };

  return (
    <FormDrawer open={open} onOpenChange={onOpenChange} title={`Profit shares for this ${target.kind}`}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => preset((id) => profiles.data?.find((p) => p.id === id)?.default_share_bp ?? 0)}>
            Default shares
          </Button>
          {partners.map((p) => (
            <Button key={p.id} variant="outline" size="sm" onClick={() => preset((id) => (id === p.id ? FULL_SHARE_BP : 0))}>
              All to {p.display_name}
            </Button>
          ))}
        </div>
        {partners.map((p) => (
          <label key={p.id} className="flex items-center gap-3">
            <span className="flex-1 font-medium">{p.display_name}</span>
            <Input
              className="w-24 text-right"
              inputMode="decimal"
              value={values[p.id] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}
            />
            <span className="w-4 text-muted-foreground">%</span>
          </label>
        ))}
        <div className={cn('flex justify-between rounded-lg bg-muted px-3 py-2 text-sm', !complete && 'text-destructive')}>
          <span>Total</span>
          <span className="font-semibold">{invalid ? 'invalid number' : formatShare(total)}</span>
        </div>
        <Button size="lg" disabled={!complete || save.isPending} onClick={submit}>
          {save.isPending && <Loader2 className="animate-spin" />}
          Save shares
        </Button>
      </div>
    </FormDrawer>
  );
}
