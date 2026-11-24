import { useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, Search } from 'lucide-react';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ManualCar, ManualFit } from '@/domain/manuals';
import { webQuery, youtubeUrl } from '@/domain/manualSearch';
import { useCarManual } from './api';
import { ChooseManualDrawer } from './ChooseManualDrawer';
import { JOBS } from './jobs';

/** What to say about a manual that isn't exactly this car's. */
export const FIT_NOTES: Record<ManualFit, string | null> = {
  exact: null,
  close: 'Closest one found: check that it’s the right version.',
  related: 'Another car with the same technology: most of it applies.',
};

const SHOWN_JOBS = 6;

/** On a car's or job's page: its repair manual, by job. `to` is the manual's page for this car. */
export function ManualCard({ car, to }: { car: ManualCar; to: string }) {
  const found = useCarManual(car);
  const [choosing, setChoosing] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="size-5 text-primary" /> Repair manual
        </CardTitle>
        {found.named && !found.loading && (
          <CardAction>
            <Button variant="ghost" size="sm" className="-mt-2 -mr-2 text-primary" onClick={() => setChoosing(true)}>
              {found.slug ? 'Change' : 'Choose'}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!found.named ? (
          <p className="text-sm text-muted-foreground">Fill in the car’s make and model to get its repair manual.</p>
        ) : found.loading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : found.slug ? (
          <>
            <div className="-mt-2">
              <p className="text-sm text-muted-foreground">{found.title}</p>
              {found.fit && found.fit !== 'chosen' && FIT_NOTES[found.fit] && <p className="text-xs text-warning">{FIT_NOTES[found.fit]}</p>}
            </div>
            <Link to={to} className="flex h-11 items-center gap-3 rounded-lg border px-3 text-muted-foreground active:bg-muted">
              <Search className="size-5 shrink-0" />
              <span className="truncate">Search: timing belt, remen, kočnice…</span>
            </Link>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {JOBS.slice(0, SHOWN_JOBS).map(({ id, label, icon: Icon }) => (
                <Button key={id} variant="outline" className="h-12 justify-start gap-1.5 px-2.5 text-sm" asChild>
                  <Link to={`${to}?job=${id}`}>
                    <Icon className="size-5 text-primary" />
                    <span className="truncate">{label}</span>
                  </Link>
                </Button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {found.error ? found.error.message : 'There is no manual for this car. You can choose one yourself, or look for videos.'}
            </p>
            <Button variant="outline" size="sm" className="self-start" asChild>
              <a href={youtubeUrl(webQuery(car, 'repair'))} target="_blank" rel="noreferrer">
                Videos on YouTube
              </a>
            </Button>
          </>
        )}
      </CardContent>
      <ChooseManualDrawer car={car} found={found} open={choosing} onOpenChange={setChoosing} />
    </Card>
  );
}
