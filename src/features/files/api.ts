import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { resizeToJpeg } from '@/lib/image';
import { coverPhotos, orderPhotos } from '@/domain/photos';
import type { Tables } from '@/lib/database.types';

export type EntityType = 'car' | 'job' | 'stock_movement' | 'transaction' | 'tool' | 'item';
export type FileKind = 'photo' | 'receipt' | 'invoice' | 'document';
export type Attachment = Tables<'attachments'>;

export const fileKeys = {
  list: (entityType: EntityType, entityId: string) => ['attachments', entityType, entityId] as const,
  links: (ids: string[]) => ['file-links', ...ids] as const,
  covers: (entityType: EntityType) => ['photo-covers', entityType] as const,
};

export function useAttachments(entityType: EntityType, entityId: string | undefined) {
  return useQuery({
    queryKey: fileKeys.list(entityType, entityId ?? ''),
    enabled: Boolean(entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attachments')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Signed view links (valid until the end of tomorrow, so the phone can cache the images). */
export function useFileLinks(ids: string[]) {
  const sorted = [...ids].sort();
  return useQuery({
    queryKey: fileKeys.links(sorted),
    enabled: sorted.length > 0,
    staleTime: 6 * 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('files/sign', { body: { ids: sorted } });
      if (error) throw new Error(await errorMessage(error));
      return (data as { links: Record<string, { thumb: string | null; full: string }> }).links;
    },
  });
}

/**
 * Photos are shrunk on the phone (max 2000 px, JPEG) with a small preview, so uploads stay
 * well under the Edge Function's request limit. PDFs go as they are.
 */
export async function prepareUpload(file: File): Promise<{ file: File; thumb: Blob | null }> {
  if (!file.type.startsWith('image/')) return { file, thumb: null };
  try {
    const big = await resizeToJpeg(file, 2000, 0.8);
    const thumb = await resizeToJpeg(file, 320, 0.7);
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return { file: new File([big], name, { type: 'image/jpeg' }), thumb };
  } catch {
    // e.g. a format the phone can't draw: send it as it is, without a preview
    return { file, thumb: null };
  }
}

export function useUploadAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { file: File; entityType: EntityType; entityId: string; kind: FileKind; label?: string; albumId?: string | null }) => {
      const { file, thumb } = await prepareUpload(args.file);
      const form = new FormData();
      form.append('file', file);
      if (thumb) form.append('thumb', thumb, 'thumb.jpg');
      form.append('entity_type', args.entityType);
      form.append('entity_id', args.entityId);
      form.append('kind', args.kind);
      if (args.label) form.append('label', args.label);
      if (args.albumId) form.append('album_id', args.albumId);
      const { data, error } = await supabase.functions.invoke('files/upload', { body: form });
      if (error) throw new Error(await errorMessage(error));
      return data as Attachment;
    },
    onSuccess: (_d, args) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: fileKeys.list(args.entityType, args.entityId) }),
        queryClient.invalidateQueries({ queryKey: fileKeys.covers(args.entityType) }),
      ]),
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (attachment: Attachment) => {
      const { error } = await supabase.functions.invoke('files/delete', { body: { id: attachment.id } });
      if (error) throw new Error(await errorMessage(error));
    },
    onSuccess: (_d, a) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: fileKeys.list(a.entity_type as EntityType, a.entity_id) }),
        queryClient.invalidateQueries({ queryKey: fileKeys.covers(a.entity_type as EntityType) }),
      ]),
  });
}

/** Makes a photo the record's cover (shown first and in the lists), or takes that back. */
export function useSetCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ photo, cover }: { photo: Attachment; cover: boolean }) => {
      const { error } = await supabase.rpc('set_cover_photo', { p_attachment_id: photo.id, p_cover: cover });
      if (error) throw error;
    },
    onSuccess: (_d, { photo }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: fileKeys.list(photo.entity_type as EntityType, photo.entity_id) }),
        queryClient.invalidateQueries({ queryKey: fileKeys.covers(photo.entity_type as EntityType) }),
      ]),
  });
}

/** Puts a photo into an album (null: no album). */
export function useMoveToAlbum() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ photo, albumId }: { photo: Attachment; albumId: string | null }) => {
      const { error } = await supabase.rpc('move_photo_to_album', { p_attachment_id: photo.id, p_album_id: albumId as string });
      if (error) throw error;
    },
    onSuccess: (_d, { photo }) => queryClient.invalidateQueries({ queryKey: fileKeys.list(photo.entity_type as EntityType, photo.entity_id) }),
  });
}

/** A record's photos, cover first, with their view links. */
export function usePhotos(entityType: EntityType, entityId: string | undefined) {
  const attachments = useAttachments(entityType, entityId);
  const photos = useMemo(
    () => orderPhotos((attachments.data ?? []).filter((a) => a.kind === 'photo' && a.mime_type.startsWith('image/'))),
    [attachments.data],
  );
  const links = useFileLinks(photos.map((p) => p.id));
  return { photos, links: links.data, isPending: attachments.isPending, error: attachments.error ?? links.error };
}

/** The cover photo of every car / tool / item that has photos, as small preview links (for the lists). */
export function useCoverThumbs(entityType: EntityType) {
  const covers = useQuery({
    queryKey: fileKeys.covers(entityType),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attachments')
        .select('id, entity_id, is_cover, created_at, album_id')
        .eq('entity_type', entityType)
        .eq('kind', 'photo')
        .like('mime_type', 'image/%');
      if (error) throw error;
      return coverPhotos(data);
    },
  });
  const ids = [...(covers.data?.values() ?? [])].map((c) => c.id).slice(0, 200);
  const links = useFileLinks(ids);
  return useMemo(() => {
    const thumbs = new Map<string, string>();
    for (const [entityId, cover] of covers.data ?? []) {
      const link = links.data?.[cover.id];
      if (link) thumbs.set(entityId, link.thumb ?? link.full);
    }
    return thumbs;
  }, [covers.data, links.data]);
}

/** A link to the job's latest invoice copy that a customer can open without an account (valid for a year). */
export function useInvoiceLink() {
  return useMutation({
    mutationFn: async (jobId: string) => {
      const { data, error } = await supabase.functions.invoke('files/invoice-link', { body: { job_id: jobId } });
      if (error) throw new Error(await errorMessage(error));
      return (data as { url: string }).url;
    },
  });
}

export function useDriveHealth() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('files/health', { body: {} });
      if (error) throw new Error(await errorMessage(error));
      return data as { ok: boolean; message: string };
    },
  });
}
