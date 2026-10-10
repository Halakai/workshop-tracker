import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { resizeToJpeg } from '@/lib/image';
import type { Tables } from '@/lib/database.types';

export type EntityType = 'car' | 'job' | 'stock_movement' | 'transaction';
export type FileKind = 'photo' | 'receipt' | 'invoice' | 'document';
export type Attachment = Tables<'attachments'>;

export const fileKeys = {
  list: (entityType: EntityType, entityId: string) => ['attachments', entityType, entityId] as const,
  links: (ids: string[]) => ['file-links', ...ids] as const,
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
    mutationFn: async (args: { file: File; entityType: EntityType; entityId: string; kind: FileKind; label?: string }) => {
      const { file, thumb } = await prepareUpload(args.file);
      const form = new FormData();
      form.append('file', file);
      if (thumb) form.append('thumb', thumb, 'thumb.jpg');
      form.append('entity_type', args.entityType);
      form.append('entity_id', args.entityId);
      form.append('kind', args.kind);
      if (args.label) form.append('label', args.label);
      const { data, error } = await supabase.functions.invoke('files/upload', { body: form });
      if (error) throw new Error(await errorMessage(error));
      return data as Attachment;
    },
    onSuccess: (_d, args) => queryClient.invalidateQueries({ queryKey: fileKeys.list(args.entityType, args.entityId) }),
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (attachment: Attachment) => {
      const { error } = await supabase.functions.invoke('files/delete', { body: { id: attachment.id } });
      if (error) throw new Error(await errorMessage(error));
    },
    onSuccess: (_d, a) => queryClient.invalidateQueries({ queryKey: fileKeys.list(a.entity_type as EntityType, a.entity_id) }),
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
