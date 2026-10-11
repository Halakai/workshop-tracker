// Photos of a record: the cover comes first, then the rest in the order they were taken (uploaded).
// Without a chosen cover, the first photo is the cover (in lists and at the top of a page).

export interface PhotoLike {
  id: string;
  entity_id: string;
  is_cover: boolean;
  created_at: string;
  album_id: string | null;
}

function byAge(a: PhotoLike, b: PhotoLike): number {
  return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

/** Cover first, then oldest to newest. */
export function orderPhotos<T extends PhotoLike>(photos: readonly T[]): T[] {
  return [...photos].sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || byAge(a, b));
}

/** Each record's cover: the chosen one, or else its first photo. */
export function coverPhotos<T extends PhotoLike>(photos: readonly T[]): Map<string, T> {
  const covers = new Map<string, T>();
  for (const p of [...photos].sort(byAge)) {
    const current = covers.get(p.entity_id);
    if (!current || (p.is_cover && !current.is_cover)) covers.set(p.entity_id, p);
  }
  return covers;
}

/** How many photos each album holds (key null: photos in no album). */
export function albumCounts(photos: readonly PhotoLike[]): Map<string | null, number> {
  const counts = new Map<string | null, number>();
  for (const p of photos) counts.set(p.album_id, (counts.get(p.album_id) ?? 0) + 1);
  return counts;
}
