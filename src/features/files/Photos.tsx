// Photos of a car, job, tool or item: a swipeable gallery (like a marketplace ad), a full-screen viewer,
// and the photo section with albums (Before, After …). Files live in Google Drive (see ./api.ts).
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Camera, ChevronLeft, ChevronRight, ExternalLink, ImagePlus, Loader2, Plus, Star, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ConfirmButton } from '@/components/ConfirmButton';
import { AddedBy } from '@/components/AddedBy';
import { cn } from '@/lib/utils';
import { syncErrorMessage } from '@/lib/errors';
import { albumCounts } from '@/domain/photos';
import { usePhotoAlbums } from '@/features/catalog/api';
import { AddPhotoAlbumDrawer } from '@/features/catalog/EntryDrawers';
import { useDeleteAttachment, useMoveToAlbum, usePhotos, useSetCover, useUploadAttachment, type Attachment, type EntityType } from './api';

type Links = Record<string, { thumb: string | null; full: string }> | undefined;

// ---------------------------------------------------------------------------
// Uploading
// ---------------------------------------------------------------------------

/** Uploads photos one after another; `pending` counts the ones still on their way. */
function usePhotoUpload(entityType: EntityType, entityId: string) {
  const upload = useUploadAttachment();
  const [pending, setPending] = useState(0);
  const send = async (files: FileList | null, albumId: string | null) => {
    if (!files?.length) return;
    const list = [...files].filter((f) => f.type.startsWith('image/') || f.type === '');
    setPending((n) => n + list.length);
    for (const file of list) {
      try {
        await upload.mutateAsync({ file, entityType, entityId, kind: 'photo', albumId });
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPending((n) => n - 1);
      }
    }
  };
  return { pending, send };
}

/** "Take photo" (rear camera on a phone) and "Choose photos" (gallery, several at once). */
function UploadButtons({ onFiles, size = 'sm', className }: { onFiles: (files: FileList | null) => void; size?: 'sm' | 'default'; className?: string }) {
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  return (
    <div className={cn('flex gap-2', className)}>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (onFiles(e.target.files), (e.target.value = ''))} />
      <input ref={picker} type="file" accept="image/*" multiple className="hidden" onChange={(e) => (onFiles(e.target.files), (e.target.value = ''))} />
      <Button type="button" variant="outline" size={size} onClick={() => camera.current?.click()}>
        <Camera /> Take photo
      </Button>
      <Button type="button" variant="outline" size={size} onClick={() => picker.current?.click()}>
        <ImagePlus /> Choose photos
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swiping
// ---------------------------------------------------------------------------

/** A horizontal strip that snaps one photo at a time (native swipe on a phone); reports the photo in view. */
function useSwipe(start = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && start > 0) el.scrollLeft = start * el.clientWidth;
    // only when the strip appears
  }, []);
  const onScroll = () => {
    const el = ref.current;
    if (el && el.clientWidth > 0) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };
  const go = (i: number) => {
    const el = ref.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  return { ref, index, onScroll, go };
}

const STRIP = 'flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

function Arrows({ index, count, go, className }: { index: number; count: number; go: (i: number) => void; className?: string }) {
  if (count < 2) return null;
  const arrow = 'absolute top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white sm:flex';
  return (
    <>
      {index > 0 && (
        <button type="button" aria-label="Previous photo" onClick={() => go(index - 1)} className={cn(arrow, 'left-2', className)}>
          <ChevronLeft className="size-5" />
        </button>
      )}
      {index < count - 1 && (
        <button type="button" aria-label="Next photo" onClick={() => go(index + 1)} className={cn(arrow, 'right-2', className)}>
          <ChevronRight className="size-5" />
        </button>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The gallery at the top of a page
// ---------------------------------------------------------------------------

/**
 * Photos first, like a marketplace ad: swipe through them, tap one to see it full screen.
 * Without photos it shows `empty` (or nothing).
 */
export function PhotoGallery({
  entityType,
  entityId,
  albums = false,
  empty,
  className,
}: {
  entityType: EntityType;
  entityId: string;
  albums?: boolean;
  empty?: (upload: ReactNode, pending: number) => ReactNode;
  className?: string;
}) {
  const { photos, links, isPending } = usePhotos(entityType, entityId);
  const { pending, send } = usePhotoUpload(entityType, entityId);
  const [open, setOpen] = useState<number | null>(null);
  if (isPending) return <div className={cn('aspect-[4/3] animate-pulse bg-muted', className)} />;
  if (photos.length === 0) return empty ? <>{empty(<UploadButtons onFiles={(f) => send(f, null)} />, pending)}</> : null;
  return (
    <>
      <Carousel key={photos.map((p) => p.id).join()} photos={photos} links={links} onOpen={setOpen} className={className} />
      <PhotoViewer photos={photos} links={links} start={open} albums={albums} onClose={() => setOpen(null)} />
    </>
  );
}

function Carousel({ photos, links, onOpen, className }: { photos: Attachment[]; links: Links; onOpen: (i: number) => void; className?: string }) {
  const { ref, index, onScroll, go } = useSwipe();
  const albumName = useAlbumName();
  const current = photos[Math.min(index, photos.length - 1)];
  const album = albumName(current?.album_id ?? null);
  return (
    <div className={cn('relative overflow-hidden bg-muted', className)}>
      <div ref={ref} onScroll={onScroll} className={cn(STRIP, 'aspect-[4/3]')}>
        {photos.map((p, i) => {
          const link = links?.[p.id];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(i)}
              aria-label={`Photo ${i + 1} of ${photos.length}`}
              className="flex h-full w-full shrink-0 snap-center snap-always items-center justify-center"
            >
              {link ? (
                <img src={link.full} alt="" draggable={false} loading={i < 2 ? 'eager' : 'lazy'} className="size-full object-cover" />
              ) : (
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              )}
            </button>
          );
        })}
      </div>
      {album && <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/55 px-2.5 py-0.5 text-xs font-medium text-white">{album}</span>}
      {photos.length > 1 && (
        <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/55 px-2.5 py-0.5 text-xs font-medium text-white tabular-nums">
          {index + 1} / {photos.length}
        </span>
      )}
      {photos.length > 1 && photos.length <= 10 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
          {photos.map((p, i) => (
            <span key={p.id} className={cn('size-1.5 rounded-full bg-white/60 shadow', i === index && 'bg-white')} />
          ))}
        </div>
      )}
      <Arrows index={index} count={photos.length} go={go} />
    </div>
  );
}

function useAlbumName() {
  const albums = usePhotoAlbums();
  return (id: string | null) => (id ? albums.data?.find((a) => a.id === id)?.name : undefined);
}

// ---------------------------------------------------------------------------
// Full-screen viewer
// ---------------------------------------------------------------------------

export function PhotoViewer({
  photos,
  links,
  start,
  albums,
  onClose,
}: {
  photos: Attachment[];
  links: Links;
  start: number | null;
  albums: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={start !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 flex h-full max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-black p-0 text-white ring-0 sm:max-w-none"
      >
        {start !== null && <ViewerBody photos={photos} links={links} start={start} albums={albums} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ViewerBody({ photos, links, start, albums, onClose }: { photos: Attachment[]; links: Links; start: number; albums: boolean; onClose: () => void }) {
  // keep the order the viewer opened with (choosing a cover reorders the page, not what you're looking at)
  const [order] = useState(() => photos.map((p) => p.id));
  const shown = useMemo(() => {
    const byId = new Map(photos.map((p) => [p.id, p]));
    return order.map((id) => byId.get(id)).filter((p): p is Attachment => Boolean(p));
  }, [order, photos]);
  const { ref, index, onScroll, go } = useSwipe(start);
  const current = shown[Math.min(index, shown.length - 1)];
  const albumList = usePhotoAlbums();
  const setCover = useSetCover();
  const move = useMoveToAlbum();
  const remove = useDeleteAttachment();
  // the last photo was deleted
  useEffect(() => {
    if (!current) onClose();
  }, [current, onClose]);

  if (!current) return null;
  const full = links?.[current.id]?.full;

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-3 px-3 pt-[env(safe-area-inset-top)]">
        <DialogTitle className="flex-1 text-sm font-medium text-white tabular-nums">
          {index + 1} / {shown.length}
          {current.is_cover && <span className="ml-2 text-white/70">· favorite</span>}
        </DialogTitle>
        <DialogDescription className="sr-only">Swipe to see the other photos.</DialogDescription>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Close">
          <X className="size-6" />
        </Button>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={ref} onScroll={onScroll} className={cn(STRIP, 'h-full')}>
          {shown.map((p) => {
            const link = links?.[p.id];
            return (
              <div key={p.id} className="flex h-full w-full shrink-0 snap-center snap-always items-center justify-center">
                {link ? (
                  <img src={link.full} alt="" draggable={false} loading="lazy" className="max-h-full max-w-full object-contain" />
                ) : (
                  <Loader2 className="size-6 animate-spin text-white/60" />
                )}
              </div>
            );
          })}
        </div>
        <Arrows index={index} count={shown.length} go={go} />
      </div>

      <div className="flex shrink-0 flex-col gap-2 px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="text-white/70 [&_p]:text-white/70">
          <AddedBy by={current.created_by} at={current.created_at} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={setCover.isPending}
            onClick={async () => {
              try {
                await setCover.mutateAsync({ photo: current, cover: !current.is_cover });
                toast.success(current.is_cover ? 'No longer the favorite' : 'Favorite: shown first, and as the picture in the list');
              } catch (e) {
                toast.error(syncErrorMessage(e));
              }
            }}
          >
            <Star className={cn(current.is_cover && 'fill-current text-amber-500')} />
            {current.is_cover ? 'Favorite' : 'Make favorite'}
          </Button>
          {albums && (
            <select
              aria-label="Album"
              value={current.album_id ?? ''}
              disabled={move.isPending}
              onChange={async (e) => {
                try {
                  await move.mutateAsync({ photo: current, albumId: e.target.value || null });
                } catch (err) {
                  toast.error(syncErrorMessage(err));
                }
              }}
              className="h-8 max-w-40 rounded-lg border border-white/20 bg-white/10 px-2 text-sm text-white"
            >
              <option value="" className="text-black">
                No album
              </option>
              {(albumList.data ?? []).map((a) => (
                <option key={a.id} value={a.id} className="text-black">
                  {a.name}
                </option>
              ))}
            </select>
          )}
          <div className="ml-auto flex gap-1">
            {full && (
              <Button variant="ghost" size="icon-sm" className="text-white hover:bg-white/10 hover:text-white" asChild aria-label="Open the original">
                <a href={full} target="_blank" rel="noreferrer">
                  <ExternalLink />
                </a>
              </Button>
            )}
            <ConfirmButton
              variant="ghost"
              size="icon-sm"
              className="text-white hover:bg-white/10 hover:text-white"
              aria-label="Delete photo"
              title="Delete this photo?"
              description="It goes to the Google Drive trash (recoverable there for 30 days)."
              confirmLabel="Delete"
              onConfirm={async () => {
                try {
                  await remove.mutateAsync(current);
                  toast.success('Deleted');
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <Trash2 />
            </ConfirmButton>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// The photo section (with albums)
// ---------------------------------------------------------------------------

/** All photos as a grid. With albums: pick an album to see its photos; new photos go into the album picked. */
export function PhotoSection({
  entityType,
  entityId,
  albums: withAlbums = false,
  title = 'Photos',
}: {
  entityType: EntityType;
  entityId: string;
  albums?: boolean;
  title?: string;
}) {
  const { photos, links, error } = usePhotos(entityType, entityId);
  const { pending, send } = usePhotoUpload(entityType, entityId);
  const albumList = usePhotoAlbums();
  const [album, setAlbum] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const counts = albumCounts(photos);
  const visible = album ? photos.filter((p) => p.album_id === album) : photos;
  const albumName = albumList.data?.find((a) => a.id === album)?.name;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">{title}</h2>
      {withAlbums && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          <Chip active={album === null} onClick={() => setAlbum(null)}>
            All <span className="opacity-70">{photos.length}</span>
          </Chip>
          {(albumList.data ?? []).map((a) => (
            <Chip key={a.id} active={album === a.id} onClick={() => setAlbum(a.id)}>
              {a.name} <span className="opacity-70">{counts.get(a.id) ?? 0}</span>
            </Chip>
          ))}
          <Button variant="ghost" size="sm" className="shrink-0 rounded-full" onClick={() => setAdding(true)}>
            <Plus /> Album
          </Button>
        </div>
      )}

      {(visible.length > 0 || pending > 0) && (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {visible.map((p, i) => {
            const link = links?.[p.id];
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setOpen(i)}
                className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-muted active:opacity-80"
                aria-label={`Photo ${i + 1}`}
              >
                {link ? (
                  <img src={link.thumb ?? link.full} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                )}
                {p.is_cover && (
                  <span className="absolute top-1 left-1 flex size-6 items-center justify-center rounded-full bg-black/55" title="Favorite photo">
                    <Star className="size-3.5 fill-amber-400 text-amber-400" />
                  </span>
                )}
              </button>
            );
          })}
          {Array.from({ length: pending }, (_, i) => (
            <div key={`p${i}`} className="flex aspect-square items-center justify-center rounded-lg border border-dashed">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ))}
        </div>
      )}
      {visible.length === 0 && pending === 0 && (
        <p className="text-sm text-muted-foreground">{albumName ? `No photos in ${albumName} yet.` : 'No photos yet.'}</p>
      )}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
      <UploadButtons onFiles={(f) => send(f, album)} />
      {albumName && <p className="-mt-1 text-xs text-muted-foreground">New photos go into {albumName}.</p>}

      <PhotoViewer photos={visible} links={links} start={open} albums={withAlbums} onClose={() => setOpen(null)} />
      {withAlbums && <AddPhotoAlbumDrawer open={adding} onOpenChange={setAdding} onAdded={(a) => setAlbum(a.id)} />}
    </section>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button variant={active ? 'default' : 'outline'} size="sm" className="shrink-0 rounded-full" onClick={onClick}>
      {children}
    </Button>
  );
}

/** A small square cover photo for list rows; the icon when there is none. */
export function Thumb({ url, icon: Icon, className }: { url: string | undefined; icon: typeof Camera; className?: string }) {
  return (
    <span className={cn('flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted', className)}>
      {url ? <img src={url} alt="" loading="lazy" className="size-full object-cover" /> : <Icon className="size-5 text-muted-foreground" />}
    </span>
  );
}
