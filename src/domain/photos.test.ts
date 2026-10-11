import { describe, expect, it } from 'vitest';
import { albumCounts, favoritePhotos, orderPhotos } from './photos';

const photo = (id: string, entity: string, created: string, extra: { cover?: boolean; album?: string } = {}) => ({
  id,
  entity_id: entity,
  created_at: created,
  is_cover: extra.cover ?? false,
  album_id: extra.album ?? null,
});

describe('photos', () => {
  it('puts the favorite first, then oldest to newest', () => {
    const list = [photo('c', 'car', '2026-10-03'), photo('a', 'car', '2026-10-01'), photo('b', 'car', '2026-10-02', { cover: true })];
    expect(orderPhotos(list).map((p) => p.id)).toEqual(['b', 'a', 'c']);
    expect(orderPhotos(list.map((p) => ({ ...p, is_cover: false }))).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('finds each record’s favorite; records without one have no picture', () => {
    const favorites = favoritePhotos([
      photo('t1-new', 't1', '2026-10-05'),
      photo('t1-old', 't1', '2026-10-01'),
      photo('t2-a', 't2', '2026-10-01'),
      photo('t2-chosen', 't2', '2026-10-09', { cover: true }),
    ]);
    expect(favorites.get('t1')).toBeUndefined();
    expect(favorites.get('t2')?.id).toBe('t2-chosen');
  });

  it('counts photos per album', () => {
    const counts = albumCounts([photo('a', 'c', '1', { album: 'before' }), photo('b', 'c', '2', { album: 'before' }), photo('c', 'c', '3')]);
    expect(counts.get('before')).toBe(2);
    expect(counts.get(null)).toBe(1);
    expect(counts.get('after')).toBeUndefined();
  });
});
