// Photos of a record: the favorite comes first, then the rest in the order they were taken (uploaded).
// Only a favorite is shown as the record's picture in the lists.

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

/** Favorite first, then oldest to newest. */
export function orderPhotos<T extends PhotoLike>(photos: readonly T[]): T[] {
  return [...photos].sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || byAge(a, b));
}

/** Each record's favorite photo (records without one aren't in the map). */
export function favoritePhotos<T extends PhotoLike>(photos: readonly T[]): Map<string, T> {
  const favorites = new Map<string, T>();
  for (const p of photos) if (p.is_cover) favorites.set(p.entity_id, p);
  return favorites;
}

/** How many photos each album holds (key null: photos in no album). */
export function albumCounts(photos: readonly PhotoLike[]): Map<string | null, number> {
  const counts = new Map<string | null, number>();
  for (const p of photos) counts.set(p.album_id, (counts.get(p.album_id) ?? 0) + 1);
  return counts;
}
