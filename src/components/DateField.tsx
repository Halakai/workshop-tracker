import { useEffect, useRef, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { formatDate, parseTypedDate, todayIso } from '@/domain/dates';
import { isTouchDevice } from '@/lib/overlay';
import { cn } from '@/lib/utils';

interface DateFieldProps {
  value: string;
  onChange: (iso: string) => void;
  id?: string;
  /** latest allowed date ("YYYY-MM-DD"); `null` allows future dates (e.g. a warranty end) */
  max?: string | null;
  /** optional dates: shown while empty */
  placeholder?: string;
  /** optional dates: an × to empty it again */
  onClear?: () => void;
  className?: string;
}

const box =
  'relative flex h-11 items-center gap-2 rounded-lg border border-input text-base focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30';

/**
 * A date shown as DD.MM.YYYY whatever the device's language.
 * Phone: tapping it opens the phone's own date picker.
 * Computer: type the date (12.3.2026, 12.3.26, 12032026, 12.3 …) or click 📅 for the calendar.
 */
export function DateField(props: DateFieldProps) {
  return isTouchDevice ? <TouchDateField {...props} /> : <TypedDateField {...props} />;
}

function ClearButton({ onClear }: { onClear: () => void }) {
  return (
    <button
      type="button"
      aria-label="Clear the date"
      onClick={onClear}
      className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:bg-muted"
    >
      <X className="size-4" />
    </button>
  );
}

/** Phone: the visible text, with an invisible native date input on top that opens the phone's picker. */
function TouchDateField({ value, onChange, id, max = todayIso(), placeholder, onClear, className }: DateFieldProps) {
  const isToday = value === todayIso();
  return (
    <div className={cn(box, 'px-3', className)}>
      {/* room for the date next to the × in narrow fields */}
      {!(onClear && value) && <CalendarDays className="size-5 shrink-0 text-muted-foreground" />}
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
        <span className="-mr-2">
          <ClearButton onClear={onClear} />
        </span>
      )}
    </div>
  );
}

/** Computer: a text field you type the date into, and a 📅 button that opens the browser's calendar. */
function TypedDateField({ value, onChange, id, max = todayIso(), placeholder, onClear, className }: DateFieldProps) {
  const [text, setText] = useState(formatDate(value));
  const [focused, setFocused] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // show what's saved whenever you're not typing (e.g. after picking from the calendar)
  useEffect(() => {
    if (!focused) setText(formatDate(value));
  }, [value, focused]);

  const read = (typed: string) => {
    const iso = parseTypedDate(typed);
    if (!iso) return { iso: null, why: 'not a date' };
    if (max && iso > max) return { iso: null, why: 'in the future' };
    return { iso, why: null };
  };

  const commit = (typed: string) => {
    const { iso } = read(typed);
    if (iso && iso !== value) onChange(iso);
    return iso !== null;
  };

  // taken while typing only once the year is complete ("1.2.20" on the way to "1.2.2026" must not count);
  // shorter forms ("1.2") are taken when leaving the field or pressing Enter
  const type = (typed: string) => {
    setText(typed);
    setProblem(null);
    if (/(^\d{8}$)|([.\-/, ]\d{4}\.?$)|(^\d{4}-\d{1,2}-\d{2}$)/.test(typed.trim())) commit(typed);
  };

  // leaving the field: take what was typed, or say why it wasn't taken
  const leave = () => {
    setFocused(false);
    if (!text.trim()) {
      if (onClear) {
        if (value) onClear();
        return;
      }
      setProblem(`A date is needed, so it stays ${formatDate(value)}.`);
      return;
    }
    if (commit(text)) return;
    const { why } = read(text);
    setProblem(`“${text.trim()}” is ${why}, so it stays ${value ? formatDate(value) : 'empty'}. Type it like 20.11.2026.`);
  };

  const openCalendar = () => {
    const input = picker.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  };

  const isToday = value === todayIso() && !focused;
  return (
    <div className="flex flex-col gap-1">
      <div className={cn(box, 'pl-3', problem && 'border-destructive', className)}>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder ?? 'DD.MM.YYYY'}
          value={text}
          aria-invalid={problem ? true : undefined}
          onChange={(e) => type(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={leave}
          // Enter saves the form: take the typed date first
          onKeyDown={(e) => e.key === 'Enter' && commit(text)}
          className="h-full w-0 min-w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground"
        />
        {isToday && <span className="pointer-events-none shrink-0 text-muted-foreground">today</span>}
        <div className="flex shrink-0 items-center pr-1">
          {onClear && value && <ClearButton onClear={onClear} />}
          <span className="relative flex">
            <button
              type="button"
              aria-label="Pick from the calendar"
              title="Pick from the calendar"
              onClick={openCalendar}
              className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <CalendarDays className="size-5" />
            </button>
            {/* the browser's calendar opens next to this hidden date input */}
            <input
              ref={picker}
              type="date"
              tabIndex={-1}
              aria-hidden
              value={value}
              max={max ?? undefined}
              onChange={(e) => {
                if (!e.target.value) return;
                setProblem(null);
                setText(formatDate(e.target.value));
                onChange(e.target.value);
              }}
              className="pointer-events-none absolute bottom-0 left-0 size-px opacity-0"
            />
          </span>
        </div>
      </div>
      {problem && <p className="text-sm text-destructive">{problem}</p>}
    </div>
  );
}
