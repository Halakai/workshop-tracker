import { Wallet } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { PayerOption } from '@/features/money/accounts';

/** Big one-tap choice between the wallet and each partner. */
export function PayerPicker({
  options,
  value,
  onChange,
  id,
}: {
  options: PayerOption[];
  value: string | null;
  onChange: (accountId: string) => void;
  id?: string;
}) {
  return (
    <ToggleGroup
      id={id}
      type="single"
      variant="outline"
      spacing={2}
      className="flex w-full flex-wrap"
      value={value ?? ''}
      onValueChange={(v) => v && onChange(v)}
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.accountId} value={o.accountId} className="min-w-0 flex-1 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
          {o.partnerId === null && <Wallet />}
          <span className="truncate">{o.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
