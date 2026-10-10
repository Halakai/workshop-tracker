import { CalendarDays } from 'lucide-react';
import { formatDate, todayIso } from '@/domain/dates';
import { cn } from '@/lib/utils';

/**
 * Shows the date as DD.MM.YYYY whatever the phone's language, while tapping opens the phone's own
 * date picker (an invisible native <input type="date"> on top).
 */
export function DateField({
  value,
  onChange,
  id,
  max = todayIso(),
  className,
}: {
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  max?: string;
  className?: string;
}) {
  const isToday = value === todayIso();
  return (
    <div
      className={cn(
        'relative flex h-11 items-center gap-2 rounded-lg border border-input px-3 text-base focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30',
        className,
      )}
    >
      <CalendarDays className="size-5 text-muted-foreground" />
      <span>
        {formatDate(value)}
        {isToday && <span className="text-muted-foreground"> · today</span>}
      </span>
      <input
        id={id}
        type="date"
        value={value}
        max={max}
        required
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
