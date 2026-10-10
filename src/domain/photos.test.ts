import { describe, expect, it } from 'vitest';
import { albumCounts, coverPhotos, orderPhotos } from './photos';

const photo = (id: string, entity: string, created: string, extra: { cover?: boolean; album?: string } = {}) => ({
  id,
  entity_id: entity,
  created_at: created,
  is_cover: extra.cover ?? false,
  album_id: extra.album ?? null,
});

describe('photos', () => {
  it('puts the cover first, then oldest to newest', () => {
    const list = [photo('c', 'car', '2026-10-03'), photo('a', 'car', '2026-10-01'), photo('b', 'car', '2026-10-02', { cover: true })];
    expect(orderPhotos(list).map((p) => p.id)).toEqual(['b', 'a', 'c']);
    expect(orderPhotos(list.map((p) => ({ ...p, is_cover: false }))).map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('finds each record’s cover, or its first photo', () => {
    const covers = coverPhotos([
      photo('t1-new', 't1', '2026-10-05'),
      photo('t1-old', 't1', '2026-10-01'),
      photo('t2-a', 't2', '2026-10-01'),
      photo('t2-chosen', 't2', '2026-10-09', { cover: true }),
    ]);
    expect(covers.get('t1')?.id).toBe('t1-old');
    expect(covers.get('t2')?.id).toBe('t2-chosen');
    expect(covers.get('t3')).toBeUndefined();
  });

  it('counts photos per album', () => {
    const counts = albumCounts([photo('a', 'c', '1', { album: 'before' }), photo('b', 'c', '2', { album: 'before' }), photo('c', 'c', '3')]);
    expect(counts.get('before')).toBe(2);
    expect(counts.get(null)).toBe(1);
    expect(counts.get('after')).toBeUndefined();
  });
});
