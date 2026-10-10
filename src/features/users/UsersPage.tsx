import { useMemo, useState } from 'react';
import { ChevronRight, UserPlus } from 'lucide-react';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { AddedBy } from '@/components/AddedBy';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/domain/dates';
import { FULL_SHARE_BP, formatShare } from '@/domain/shares';
import { useAdminUsers, type AdminUser } from './api';
import { CreateUserDrawer } from './CreateUserDrawer';
import { UserActionsDrawer } from './UserActionsDrawer';
import { SharesDrawer } from './SharesDrawer';

export function UsersPage() {
  const users = useAdminUsers();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [editingShares, setEditingShares] = useState(false);

  const activePartners = useMemo(() => (users.data ?? []).filter((u) => u.is_active), [users.data]);
  const shareTotal = activePartners.reduce((sum, u) => sum + u.default_share_bp, 0);

  return (
    <>
      <PageHeader
        title="Users & partners"
        back="/more"
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <UserPlus /> Add
          </Button>
        }
      />
      <PageBody>
        {users.isPending && (
          <>
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </>
        )}
        {users.isError && <p className="text-destructive">{users.error.message}</p>}
        {users.data && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Default profit shares</CardTitle>
                <CardAction>
                  <Button variant="outline" size="sm" onClick={() => setEditingShares(true)}>
                    Edit
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {activePartners.map((u) => (
                  <div key={u.id} className="flex justify-between">
                    <span>{u.display_name}</span>
                    <span className="font-medium tabular-nums">{formatShare(u.default_share_bp)}</span>
                  </div>
                ))}
                {shareTotal !== FULL_SHARE_BP && (
                  <p className="mt-2 text-sm text-destructive">
                    Shares add up to {formatShare(shareTotal)}, not 100 %. Tap Edit to fix.
                  </p>
                )}
              </CardContent>
            </Card>

            <ul className="flex flex-col gap-2">
              {users.data.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(u)}
                    className="flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left active:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{u.display_name}</span>
                        {u.role === 'admin' && <Badge>admin</Badge>}
                        {!u.is_active && <Badge variant="destructive">disabled</Badge>}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.last_sign_in_at ? `Last sign-in ${formatDateTime(u.last_sign_in_at)}` : 'Never signed in'}
                      </p>
                      <AddedBy by={u.created_by} at={u.created_at} />
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </PageBody>

      <CreateUserDrawer open={creating} onOpenChange={setCreating} />
      <UserActionsDrawer user={selected} onClose={() => setSelected(null)} />
      <SharesDrawer open={editingShares} onOpenChange={setEditingShares} partners={activePartners} />
    </>
  );
}
