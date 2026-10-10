import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FULL_SHARE_BP, formatShare, parseSharePercent } from '@/domain/shares';
import { cn } from '@/lib/utils';
import { useAdminAction, type AdminUser } from './api';

function bpToInput(bp: number): string {
  return (bp / 100).toString();
}

/** Default profit shares for active partners. They must add up to exactly 100 %. */
export function SharesDrawer({
  open,
  onOpenChange,
  partners,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partners: AdminUser[];
}) {
  const action = useAdminAction();
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setValues(Object.fromEntries(partners.map((p) => [p.id, bpToInput(p.default_share_bp)])));
  }, [open, partners]);

  const parsed = partners.map((p) => ({ id: p.id, bp: parseSharePercent(values[p.id] ?? '') }));
  const invalid = parsed.some((p) => p.bp === null);
  const total = parsed.reduce((sum, p) => sum + (p.bp ?? 0), 0);
  const complete = !invalid && total === FULL_SHARE_BP;

  const splitEvenly = () => {
    const base = Math.floor(FULL_SHARE_BP / partners.length);
    const rest = FULL_SHARE_BP - base * partners.length;
    setValues(Object.fromEntries(partners.map((p, i) => [p.id, bpToInput(base + (i < rest ? 1 : 0))])));
  };

  const save = async () => {
    try {
      await action.mutateAsync({
        action: 'set_shares',
        shares: parsed.map((p) => ({ user_id: p.id, share_bp: p.bp! })),
      });
      toast.success('Profit shares saved');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Default profit shares"
      description="Used for new cars and jobs and for general overhead. Each car or job can override them."
    >
      <div className="flex flex-col gap-3">
        {partners.map((p) => (
          <label key={p.id} className="flex items-center gap-3">
            <span className="flex-1 font-medium">{p.display_name}</span>
            <Input
              className="w-24 text-right"
              inputMode="decimal"
              value={values[p.id] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [p.id]: e.target.value }))}
              aria-invalid={parseSharePercent(values[p.id] ?? '') === null}
            />
            <span className="w-4 text-muted-foreground">%</span>
          </label>
        ))}
        <div className={cn('flex justify-between rounded-lg bg-muted px-3 py-2 text-sm', !complete && 'text-destructive')}>
          <span>Total</span>
          <span className="font-semibold">{invalid ? 'invalid number' : formatShare(total)}</span>
        </div>
        <Button variant="outline" onClick={splitEvenly}>
          Split evenly
        </Button>
        <Button size="lg" disabled={!complete || action.isPending} onClick={save}>
          {action.isPending && <Loader2 className="animate-spin" />}
          Save shares
        </Button>
      </div>
    </FormDrawer>
  );
}
