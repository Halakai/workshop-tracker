import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, ExternalLink, FileText, Loader2, Paperclip, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmButton } from '@/components/ConfirmButton';
import { AddedBy } from '@/components/AddedBy';
import { cn } from '@/lib/utils';
import { useAttachments, useDeleteAttachment, useFileLinks, useUploadAttachment, type Attachment, type EntityType, type FileKind } from './api';

/**
 * Photos / receipts of a record, stored in Google Drive. "Take photo" opens the rear camera on a phone,
 * "Choose file" the gallery or files (PDF too, if allowed).
 */
export function AttachmentStrip({
  entityType,
  entityId,
  kind,
  title,
  allowPdf = false,
  label,
  className,
}: {
  entityType: EntityType;
  entityId: string;
  kind: FileKind;
  title?: string;
  allowPdf?: boolean;
  label?: string;
  className?: string;
}) {
  const attachments = useAttachments(entityType, entityId);
  const rows = (attachments.data ?? []).filter((a) => a.kind === kind || (kind === 'receipt' && a.kind === 'document'));
  const links = useFileLinks(rows.map((r) => r.id));
  const upload = useUploadAttachment();
  const [pending, setPending] = useState(0);
  const [open, setOpen] = useState<Attachment | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files];
    setPending((n) => n + list.length);
    for (const file of list) {
      try {
        await upload.mutateAsync({ file, entityType, entityId, kind: file.type === 'application/pdf' && kind === 'photo' ? 'document' : kind, label });
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setPending((n) => n - 1);
      }
    }
  };

  return (
    <section className={cn('flex flex-col gap-2', className)}>
      {title && <h2 className="font-semibold">{title}</h2>}
      <div className="flex flex-wrap gap-2">
        {rows.map((a) => {
          const link = links.data?.[a.id];
          const isPdf = a.mime_type === 'application/pdf';
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => (isPdf && link ? window.open(link.full, '_blank') : setOpen(a))}
              className="flex size-20 items-center justify-center overflow-hidden rounded-lg border bg-muted active:opacity-80"
              aria-label={a.file_name}
            >
              {isPdf ? (
                <FileText className="size-8 text-muted-foreground" />
              ) : link?.thumb ? (
                <img src={link.thumb} alt="" loading="lazy" className="size-full object-cover" />
              ) : link ? (
                <img src={link.full} alt="" loading="lazy" className="size-full object-cover" />
              ) : (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              )}
            </button>
          );
        })}
        {Array.from({ length: pending }, (_, i) => (
          <div key={`p${i}`} className="flex size-20 items-center justify-center rounded-lg border border-dashed">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ))}
      </div>
      {links.isError && <p className="text-sm text-destructive">{links.error.message}</p>}
      <div className="flex gap-2">
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (onFiles(e.target.files), (e.target.value = ''))} />
        <input
          ref={picker}
          type="file"
          multiple
          accept={allowPdf ? 'image/*,application/pdf' : 'image/*'}
          className="hidden"
          onChange={(e) => (onFiles(e.target.files), (e.target.value = ''))}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => camera.current?.click()}>
          <Camera /> Take photo
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => picker.current?.click()}>
          <Paperclip /> Choose file
        </Button>
      </div>
      <FileViewer attachment={open} url={open ? links.data?.[open.id]?.full : undefined} onClose={() => setOpen(null)} />
    </section>
  );
}

function FileViewer({ attachment, url, onClose }: { attachment: Attachment | null; url?: string; onClose: () => void }) {
  const remove = useDeleteAttachment();
  return (
    <Dialog open={!!attachment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] p-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate text-sm">{attachment?.file_name}</DialogTitle>
          <DialogDescription asChild>
            <div>{attachment && <AddedBy by={attachment.created_by} at={attachment.created_at} />}</div>
          </DialogDescription>
        </DialogHeader>
        {url ? (
          <img src={url} alt={attachment?.file_name ?? ''} className="max-h-[70dvh] w-full rounded-md object-contain" />
        ) : (
          <Loader2 className="mx-auto size-6 animate-spin" />
        )}
        <div className="flex justify-between gap-2">
          {url && (
            <Button variant="outline" size="sm" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink /> Open
              </a>
            </Button>
          )}
          {attachment && (
            <ConfirmButton
              variant="ghost"
              size="sm"
              className="text-destructive"
              title="Delete this file?"
              description="It goes to the Google Drive trash (recoverable there for 30 days)."
              confirmLabel="Delete"
              onConfirm={async () => {
                try {
                  await remove.mutateAsync(attachment);
                  toast.success('Deleted');
                  onClose();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              <Trash2 /> Delete
            </ConfirmButton>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
