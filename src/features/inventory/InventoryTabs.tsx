import { Link } from 'react-router';
import { Hammer, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'stock', to: '/inventory', label: 'Parts & supplies', icon: Package },
  { id: 'tools', to: '/inventory/tools', label: 'Tools', icon: Hammer },
] as const;

/** The two halves of the inventory: things that get used up, and the tools we own. */
export function InventoryTabs({ current }: { current: 'stock' | 'tools' }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="tablist">
      {TABS.map(({ id, to, label, icon: Icon }) => (
        <Link
          key={id}
          to={to}
          // switching tabs doesn't pile up in the back history
          replace
          role="tab"
          aria-selected={current === id}
          className={cn(
            'flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors',
            current === id && 'bg-background text-foreground shadow-sm',
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </div>
  );
}
