import { useState } from 'react';
import { Link } from 'react-router';
import { PageBody, PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/domain/dates';
import { useProfileNames } from '@/features/auth/profiles';
import { activityLink, useActivity } from './api';

const STEP = 30;

/** Who did what in the workshop, newest first. */
export function ActivityPage() {
  const [limit, setLimit] = useState(STEP);
  const activity = useActivity(limit);
  const names = useProfileNames();
  return (
    <>
      <PageHeader title="Activity" back="/more" />
      <PageBody>
        {activity.isPending && <Skeleton className="h-64 rounded-xl" />}
        {activity.isError && <p className="text-destructive">{activity.error.message}</p>}
        {activity.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border empty:hidden">
          {activity.data?.map((a) => {
            const href = activityLink(a.entity_type, a.entity_id);
            const body = (
              <>
                <p className="text-sm">{a.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {a.actor_id ? (names.get(a.actor_id) ?? 'someone') : 'system'} · {formatDateTime(a.at)}
                </p>
              </>
            );
            return (
              <li key={a.id}>
                {href ? (
                  <Link to={href} className="block px-4 py-2.5 active:bg-muted">
                    {body}
                  </Link>
                ) : (
                  <div className="px-4 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        {activity.data && activity.data.length >= limit && (
          <Button variant="ghost" size="sm" onClick={() => setLimit(limit + STEP)}>
            Show more
          </Button>
        )}
      </PageBody>
    </>
  );
}
