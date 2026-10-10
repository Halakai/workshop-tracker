import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Link } from 'react-router';
import { Car, ChevronRight, Lock, Plus } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentProfile } from '@/features/auth/profiles';
import { useItems } from '@/features/inventory/api';
import { useBrands, useCategories, useExpenseCategories, useUnits, type Brand } from './api';
import { AddCategoryDrawer, AddExpenseCategoryDrawer, AddUnitDrawer, EditEntryDrawer, type EditTarget } from './EntryDrawers';
import { AddBrandDrawer } from './AddBrandDrawer';

/** Categories, units and brands. Everyone can add; admins can rename and delete. */
export function ListsPage() {
  const me = useCurrentProfile();
  const isAdmin = me.role === 'admin';
  const categories = useCategories();
  const units = useUnits();
  const brands = useBrands();
  const items = useItems();
  const expenseCategories = useExpenseCategories();
  const expenseUsage = useQuery({
    queryKey: ['expense-category-usage'],
    queryFn: async () => {
      const { data, error } = await supabase.from('transactions').select('expense_category_id').not('expense_category_id', 'is', null);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of data) map.set(r.expense_category_id!, (map.get(r.expense_category_id!) ?? 0) + 1);
      return map;
    },
  });
  const [adding, setAdding] = useState<'category' | 'unit' | 'brand' | 'cost' | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);

  const usage = useMemo(() => {
    const count = (key: 'category_id' | 'unit_id' | 'brand_id') => {
      const map = new Map<string, number>();
      for (const i of items.data ?? []) {
        const id = i[key];
        if (id) map.set(id, (map.get(id) ?? 0) + 1);
      }
      return map;
    };
    return { categories: count('category_id'), units: count('unit_id'), brands: count('brand_id') };
  }, [items.data]);

  return (
    <>
      <PageHeader title="Lists" back="/more" />
      <PageBody>
        {!isAdmin && (
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Lock className="size-4" /> You can add entries. Only an admin can rename or delete them.
          </p>
        )}

        <Link to="/lists/cars" className="flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 active:bg-muted">
          <Car className="size-5 text-muted-foreground" />
          <span className="flex-1">
            <span className="block font-medium">Car makes & models</span>
            <span className="block text-sm text-muted-foreground">Makes, models, generations and engines for the car forms</span>
          </span>
          <ChevronRight className="size-5 text-muted-foreground" />
        </Link>

        <Section title="Categories" onAdd={() => setAdding('category')} loading={categories.isPending}>
          {categories.data?.map((c) => (
            <Row
              key={c.id}
              title={c.name}
              badge={c.code}
              usedBy={usage.categories.get(c.id) ?? 0}
              onEdit={isAdmin ? () => setEditing({ table: 'item_categories', entry: c, usedBy: usage.categories.get(c.id) ?? 0 }) : undefined}
            />
          ))}
        </Section>

        <Section title="Units" onAdd={() => setAdding('unit')} loading={units.isPending}>
          {units.data?.map((u) => (
            <Row
              key={u.id}
              title={u.name}
              subtitle={u.whole_only ? 'whole numbers only' : 'decimals allowed'}
              usedBy={usage.units.get(u.id) ?? 0}
              onEdit={isAdmin ? () => setEditing({ table: 'units', entry: u, usedBy: usage.units.get(u.id) ?? 0 }) : undefined}
            />
          ))}
        </Section>

        <Section title="Brands" onAdd={() => setAdding('brand')} loading={brands.isPending}>
          {brands.data?.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No brands yet.</li>}
          {brands.data?.map((b: Brand) => (
            <Row
              key={b.id}
              title={b.name}
              badge={b.code}
              usedBy={usage.brands.get(b.id) ?? 0}
              onEdit={isAdmin ? () => setEditing({ table: 'brands', entry: b, usedBy: usage.brands.get(b.id) ?? 0 }) : undefined}
            />
          ))}
        </Section>

        <Section title="Cost types" onAdd={() => setAdding('cost')} loading={expenseCategories.isPending}>
          {expenseCategories.data?.map((c) => {
            const used = expenseUsage.data?.get(c.id) ?? 0;
            return (
              <Row
                key={c.id}
                title={c.name}
                usedBy={used}
                usedLabel="use"
                onEdit={isAdmin ? () => setEditing({ table: 'expense_categories', entry: c, usedBy: used }) : undefined}
              />
            );
          })}
        </Section>
      </PageBody>

      <AddExpenseCategoryDrawer open={adding === 'cost'} onOpenChange={(o) => !o && setAdding(null)} />
      <AddCategoryDrawer open={adding === 'category'} onOpenChange={(o) => !o && setAdding(null)} />
      <AddUnitDrawer open={adding === 'unit'} onOpenChange={(o) => !o && setAdding(null)} />
      <AddBrandDrawer open={adding === 'brand'} onOpenChange={(o) => !o && setAdding(null)} />
      <EditEntryDrawer target={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function Section({
  title,
  onAdd,
  loading,
  children,
}: {
  title: string;
  onAdd: () => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus /> Add
        </Button>
      </div>
      {loading ? <Skeleton className="h-24 rounded-xl" /> : <ul className="divide-y overflow-hidden rounded-xl border">{children}</ul>}
    </section>
  );
}

function Row({
  title,
  subtitle,
  badge,
  usedBy,
  usedLabel = 'item',
  onEdit,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  usedBy: number;
  usedLabel?: string;
  onEdit?: () => void;
}) {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{title}</span>
          {badge && (
            <Badge variant="outline" className="font-mono">
              {badge}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {subtitle ? `${subtitle} · ` : ''}
          {usedBy === 0 ? 'not used' : `${usedBy} ${usedLabel}${usedBy === 1 ? '' : 's'}`}
        </p>
      </div>
      {onEdit && <ChevronRight className="size-5 text-muted-foreground" />}
    </>
  );
  return (
    <li>
      {onEdit ? (
        <button type="button" onClick={onEdit} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-muted">
          {content}
        </button>
      ) : (
        <div className="flex min-h-14 items-center gap-3 px-4 py-2">{content}</div>
      )}
    </li>
  );
}
