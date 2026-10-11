// The before/after sliders of a car or job on the website: pairs picked by hand from all of its photos.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, X } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { Button } from '@/components/ui/button';
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field';
import type { BeforeAfter } from '@/domain/website';
import { cn } from '@/lib/utils';
import type { Attachment } from '@/features/files/api';
import type { PhotoPair } from './api';

type Links = Record<string, { thumb: string | null; full: string }> | undefined;

/** What the photo drawer is picking: a side of an existing pair, or a new pair (before first, then after). */
type Picking = { index: number; side: BeforeAfter } | { index: null; side: 'before' } | { index: null; side: 'after'; before: string };

const LABEL: Record<BeforeAfter, string> = { before: 'Before', after: 'After' };

export function PairsEditor({
  photos,
  links,
  sideOf,
  value,
  onChange,
}: {
  photos: Attachment[];
  links: Links;
  sideOf: (photo: Attachment) => BeforeAfter | null;
  value: PhotoPair[];
  onChange: (pairs: PhotoPair[]) => void;
}) {
  const [picking, setPicking] = useState<Picking | null>(null);
  const byId = new Map(photos.map((p) => [p.id, p]));

  const move = (i: number, j: number) => {
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const pick = (id: string) => {
    if (!picking) return;
    if (picking.index !== null) {
      onChange(value.map((pair, i) => (i === picking.index ? { ...pair, [picking.side]: id } : pair)));
      setPicking(null);
    } else if (picking.side === 'before') {
      setPicking({ index: null, side: 'after', before: id });
    } else {
      onChange([...value, { before: picking.before, after: id }]);
      setPicking(null);
    }
  };

  // the photo that can't be picked: the other half of the same pair
  const other =
    picking === null ? null : picking.index !== null ? value[picking.index][picking.side === 'before' ? 'after' : 'before'] : picking.side === 'after' ? picking.before : null;
  const current = picking?.index != null ? value[picking.index][picking.side] : null;
  // photos from the matching album first (Before album when picking the before photo …), then all the others
  const options = picking ? [...photos.filter((p) => sideOf(p) === picking.side), ...photos.filter((p) => sideOf(p) !== picking.side)].filter((p) => p.id !== other) : [];

  const title =
    picking === null
      ? ''
      : picking.index !== null
        ? `Pair ${picking.index + 1}: the ${LABEL[picking.side].toUpperCase()} photo`
        : picking.side === 'before'
          ? 'New pair, step 1 of 2: the BEFORE photo'
          : 'New pair, step 2 of 2: the AFTER photo';

  return (
    <FieldSet>
      <div className="flex items-center justify-between gap-2">
        <FieldLegend className="mb-0">Before / after sliders</FieldLegend>
        <Button type="button" variant="outline" size="sm" disabled={photos.length < 2} onClick={() => setPicking({ index: null, side: 'before' })}>
          <Plus /> Add a pair
        </Button>
      </div>
      <FieldDescription>
        Pick the two photos of each slider yourself, from all of the {photos.length} photos. They don’t need to be chosen above; then they show only
        in the slider. Photos from the same angle work best.
      </FieldDescription>
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sliders yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {value.map((pair, i) => (
            <li key={`${pair.before}-${pair.after}`} className="flex items-center gap-2 rounded-xl border p-2">
              <span className="w-5 shrink-0 text-center text-sm text-muted-foreground tabular-nums">{i + 1}</span>
              {(['before', 'after'] as const).map((side) => {
                const link = links?.[pair[side]];
                return (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setPicking({ index: i, side })}
                    className="relative aspect-[4/3] min-w-0 flex-1 overflow-hidden rounded-lg bg-muted active:opacity-80"
                    aria-label={`Change the ${side} photo of pair ${i + 1}`}
                  >
                    {link ? (
                      <img src={link.thumb ?? link.full} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      <Loader2 className="m-auto size-5 animate-spin text-muted-foreground" />
                    )}
                    <span className="absolute top-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white uppercase">{LABEL[side]}</span>
                  </button>
                );
              })}
              <span className="flex shrink-0 flex-col">
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>
                  <ArrowUp />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove this pair" onClick={() => onChange(value.filter((_, k) => k !== i))}>
                  <X />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="Move down" disabled={i === value.length - 1} onClick={() => move(i, i + 1)}>
                  <ArrowDown />
                </Button>
              </span>
            </li>
          ))}
        </ol>
      )}

      <FormDrawer
        open={picking !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        title={title}
        description={picking?.index === null && picking.side === 'after' ? 'Now the same view after the work.' : 'Tap a photo.'}
      >
        <div className="grid grid-cols-3 gap-1.5 pb-2">
          {options.map((p) => {
            const link = links?.[p.id];
            const side = sideOf(p);
            const on = p.id === current;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pick(p.id)}
                className={cn('relative aspect-square overflow-hidden rounded-lg bg-muted active:opacity-80', on && 'ring-3 ring-primary')}
              >
                {link ? <img src={link.thumb ?? link.full} alt="" loading="lazy" className="size-full object-cover" /> : <Loader2 className="m-auto size-5 animate-spin text-muted-foreground" />}
                {side && (
                  <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white uppercase">{LABEL[side]}</span>
                )}
              </button>
            );
          })}
        </div>
      </FormDrawer>
      {value.some((pair) => !byId.has(pair.before) || !byId.has(pair.after)) && (
        <p className="text-sm text-muted-foreground">A photo of a pair was deleted; that pair is dropped when you save.</p>
      )}
    </FieldSet>
  );
}
