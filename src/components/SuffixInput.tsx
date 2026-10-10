import type { ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Number input that opens the decimal keypad and shows a unit after the value ("L", "€"). */
export function SuffixInput({ suffix, className, ...props }: ComponentProps<typeof Input> & { suffix: string }) {
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="next"
        className={cn('pr-14 text-lg tabular-nums', className)}
        {...props}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">{suffix}</span>
    </div>
  );
}
