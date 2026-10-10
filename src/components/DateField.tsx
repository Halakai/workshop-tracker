import { CalendarDays, X } from 'lucide-react';
import { formatDate, todayIso } from '@/domain/dates';
import { cn } from '@/lib/utils';

/**
 * Shows the date as DD.MM.YYYY whatever the phone's language, while tapping opens the phone's own
 * date picker (an invisible native <input type="date"> on top).
 *
 * Optional dates: pass `placeholder` (shown while empty) and `onClear` (an × to empty it again).
 * `max={null}` allows future dates (e.g. a warranty end).
 */
export function DateField({
  value,
  onChange,
  id,
  max = todayIso(),
  placeholder,
  onClear,
  className,
}: {
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  max?: string | null;
  placeholder?: string;
  onClear?: () => void;
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
      <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        {value ? (
          <>
            {formatDate(value)}
            {isToday && <span className="text-muted-foreground"> · today</span>}
          </>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </span>
      <input
        id={id}
        type="date"
        value={value}
        max={max ?? undefined}
        required={!onClear}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      {onClear && value && (
        <button
          type="button"
          aria-label="Clear the date"
          onClick={onClear}
          className="relative z-10 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground active:bg-muted"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
