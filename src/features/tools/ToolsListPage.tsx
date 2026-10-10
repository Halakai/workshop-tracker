import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Plus, Search } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/domain/money';
import { fold } from '@/domain/search';
import { toolTotals } from '@/domain/tools';
import { useProfileNames } from '@/features/auth/profiles';
import { useToolCategories } from '@/features/catalog/api';
import { InventoryTabs } from '@/features/inventory/InventoryTabs';
import { useTools, type Tool } from './api';
import { ToolBadges } from './ToolBadges';

/** 'all' | 'lent' | 'repair' | 'gone' | 'owner:<id or workshop>' | 'cat:<id>' */
type Filter = string;

function matches(tool: Tool, words: string[], ownerName: string): boolean {
  if (words.length === 0) return true;
  const haystack = fold(
    [tool.name, tool.code, tool.brand?.name, tool.model, tool.serial_number, tool.location, tool.category?.name, tool.lent_to, ownerName, tool.notes]
      .filter(Boolean)
      .join(' '),
  );
  return words.every((w) => haystack.includes(w));
}

function ownerName(tool: Tool, names: Map<string, string>): string {
  return tool.owner_id ? (names.get(tool.owner_id) ?? 'partner') : 'workshop';
}

export function ToolsListPage() {
  const tools = useTools();
  const categories = useToolCategories();
  const names = useProfileNames();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const all = tools.data ?? [];
  const owned = useMemo(() => all.filter((t) => !t.gone_on), [all]);


  const visible = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return all.filter((t) => {
      if (filter === 'gone') return t.gone_on && matches(t, words, ownerName(t, names));
      if (t.gone_on) return false;
      if (filter === 'lent' && !t.lent_to) return false;
      if (filter === 'repair' && t.condition === 'good') return false;
      if (filter.startsWith('owner:') && (t.owner_id ?? 'workshop') !== filter.slice(6)) return false;
      if (filter.startsWith('cat:') && t.category_id !== filter.slice(4)) return false;
      return matches(t, words, ownerName(t, names));
    });
  }, [all, filter, query, names]);

  const totals = toolTotals(owned);
  const shown = toolTotals(visible);
  const partnerOwners = [...new Set(owned.map((t) => t.owner_id).filter((id): id is string => Boolean(id)))];
  const usedCategories = (categories.data ?? []).filter((c) => owned.some((t) => t.category_id === c.id));
  const goneCount = all.length - owned.length;

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    ...(totals.lent ? [{ value: 'lent', label: `Lent out (${totals.lent})` }] : []),
    ...(totals.needsWork ? [{ value: 'repair', label: `Needs repair (${totals.needsWork})` }] : []),
    ...(partnerOwners.length
      ? [{ value: 'owner:workshop', label: 'Workshop’s' }, ...partnerOwners.map((id) => ({ value: `owner:${id}`, label: `${names.get(id) ?? 'Partner'}’s` }))]
      : []),
    ...usedCategories.map((c) => ({ value: `cat:${c.id}`, label: c.name })),
    ...(goneCount ? [{ value: 'gone', label: `No longer have (${goneCount})` }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        actions={
          <Button size="sm" asChild>
            <Link to="/inventory/tools/new">
              <Plus /> Tool
            </Link>
          </Button>
        }
      />
      <PageBody>
        <InventoryTabs current="tools" />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search name, brand, ID, place"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        {filters.length > 1 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {filters.map((f) => (
              <Button
                key={f.value}
                variant={filter === f.value ? 'default' : 'outline'}
                size="sm"
                className="shrink-0 rounded-full"
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        )}

        {tools.isPending && Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        {tools.isError && <p className="text-destructive">{tools.error.message}</p>}
        {tools.data && visible.length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
            {all.length === 0 ? (
              <>
                No tools yet: keep track of what you own, where it is and who borrowed it.{' '}
                <Link to="/inventory/tools/new" className="text-primary underline">
                  Add the first one
                </Link>
                .
              </>
            ) : (
              'Nothing matches.'
            )}
          </div>
        )}
        {filter !== 'gone' && visible.length > 0 && (
          <p className="-mb-2 text-sm text-muted-foreground">
            {shown.count} {shown.count === 1 ? 'tool' : 'tools'}
            {shown.value > 0 && ` · bought for ${formatMoney(shown.value)}`}
          </p>
        )}

        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border empty:hidden">
          {visible.map((t) => {
            const details = [
              t.code,
              [t.brand?.name, t.model].filter(Boolean).join(' '),
              t.owner_id && `${names.get(t.owner_id) ?? 'partner'}’s`,
              t.location && `📍 ${t.location}`,
            ].filter(Boolean);
            return (
              <li key={t.id}>
                <Link to={`/inventory/tools/${t.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 active:bg-muted">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {t.name}
                      {t.qty > 1 && <span className="text-muted-foreground"> ×{t.qty}</span>}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{details.join(' · ')}</p>
                  </div>
                  <ToolBadges tool={t} className="max-w-[45%] shrink-0" />
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      </PageBody>
    </>
  );
}
