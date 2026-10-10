import { useMemo, useState, type ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { suggest } from '@/domain/codes';

/**
 * Text input with tappable suggestions underneath (works well with a phone keyboard open):
 * matches that start with what you typed come first, then ones that contain it.
 */
export function SuggestionInput({
  value,
  onChange,
  options,
  newHint,
  limit = 6,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  /** e.g. (v) => `“${v}” will be added as a new brand`, shown when the text matches no option exactly */
  newHint?: (value: string) => string;
  limit?: number;
}) {
  const [focused, setFocused] = useState(false);
  const matches = useMemo(() => suggest(value, options, limit), [value, options, limit]);
  const trimmed = value.trim();
  const isNew = trimmed !== '' && !options.includes(trimmed);

  return (
    <div className="flex flex-col gap-2">
      <Input
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        {...props}
      />
      {focused && matches.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {matches.map((m) => (
            <Button
              key={m}
              type="button"
              variant="secondary"
              size="sm"
              // keep the keyboard open: don't move focus away from the input
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(m)}
            >
              {m}
            </Button>
          ))}
        </div>
      )}
      {newHint && isNew && <p className="text-xs text-muted-foreground">{newHint(trimmed)}</p>}
    </div>
  );
}
