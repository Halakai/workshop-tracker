import { Link } from 'react-router';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'entries', to: '/money', label: 'Wallet' },
  { id: 'overview', to: '/money/overview', label: 'Overview' },
  { id: 'partners', to: '/partners', label: 'Partners' },
] as const;

/** Everything about money in one place: the wallet's entries, the figures and charts, and the partners. */
export function MoneyTabs({ current }: { current: (typeof TABS)[number]['id'] }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="tablist">
      {TABS.map(({ id, to, label }) => (
        <Link
          key={id}
          to={to}
          // switching tabs doesn't pile up in the back history
          replace
          role="tab"
          aria-selected={current === id}
          className={cn(
            'flex h-10 items-center justify-center rounded-lg text-sm font-medium text-muted-foreground transition-colors',
            current === id && 'bg-background text-foreground shadow-sm',
          )}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
