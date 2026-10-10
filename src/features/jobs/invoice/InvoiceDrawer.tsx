// After making an invoice (or later, from the job page): send the customer a link to it, or the PDF file itself.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, Download, FileText, Link2, Loader2, Share2, TriangleAlert } from 'lucide-react';
import { FormDrawer } from '@/components/FormDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useInvoiceLink } from '@/features/files/api';
import { downloadPdf, shareOrDownload } from './makeInvoice';

/** The invoice just made: its PDF and whether its copy in Google Drive (which the link shows) is saved. */
export interface MadeInvoice {
  number: string;
  name: string;
  blob: Blob;
  drive: 'saving' | 'saved' | { error: string };
}

export function InvoiceDrawer({
  jobId,
  open,
  invoice,
  title,
  onClose,
}: {
  jobId: string;
  open: boolean;
  /** null: only the link (the invoice was made earlier) */
  invoice: MadeInvoice | null;
  title: string;
  onClose: () => void;
}) {
  return (
    <FormDrawer open={open} onOpenChange={(o) => !o && onClose()} title={title}>
      {open && <InvoiceActions jobId={jobId} invoice={invoice} />}
    </FormDrawer>
  );
}

function InvoiceActions({ jobId, invoice }: { jobId: string; invoice: MadeInvoice | null }) {
  const link = useInvoiceLink();
  const [copied, setCopied] = useState(false);
  const saved = invoice === null || invoice.drive === 'saved';
  const driveError = invoice && typeof invoice.drive === 'object' ? invoice.drive.error : null;

  // fetch the link as soon as the copy is in Drive, so tapping Send / Copy works straight away
  // (phones only allow sharing and copying right after a tap, not after waiting for the server)
  useEffect(() => {
    if (saved && link.isIdle) link.mutate(jobId);
  }, [saved, jobId, link]);
  const url = link.data;

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied. Paste it into WhatsApp, Viber or an email.');
    } catch {
      toast.error('Couldn’t copy here. Press and hold the link above to copy it.');
    }
  };

  const send = async () => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: invoice?.name ?? 'Invoice', url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    await copy();
  };

  return (
    <div className="flex flex-col gap-3 pb-2">
      {invoice && (
        <p className="flex items-center gap-2 text-sm">
          {invoice.drive === 'saving' && (
            <>
              <Loader2 className="size-4 animate-spin" /> Saving the copy in Google Drive…
            </>
          )}
          {invoice.drive === 'saved' && (
            <>
              <Check className="size-4 text-success" /> Saved in Google Drive.
            </>
          )}
          {driveError && (
            <span className="flex items-start gap-2 text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              Not saved in Google Drive ({driveError}), so there is no link. You can still send the PDF file.
            </span>
          )}
        </p>
      )}

      {!driveError && (
        <section className="flex flex-col gap-2 rounded-xl border p-3">
          <h3 className="flex items-center gap-2 font-medium">
            <Link2 className="size-4" /> Link for the customer
          </h3>
          {link.isError ? (
            <p className="text-sm text-destructive">{link.error.message}</p>
          ) : url ? (
            <Input readOnly value={url} onFocus={(e) => e.target.select()} className="font-mono text-xs" aria-label="Invoice link" />
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Getting the link…
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" disabled={!url} onClick={send}>
              <Share2 /> Send link
            </Button>
            <Button size="lg" variant="outline" disabled={!url} onClick={copy}>
              {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Opens the PDF for whoever has the link, no account needed, for a year. If you change the job and make the invoice again, the same
            link shows the new version.
          </p>
        </section>
      )}

      {invoice && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => shareOrDownload(invoice.blob, invoice.name)}>
            <FileText /> Send PDF file
          </Button>
          <Button variant="outline" onClick={() => downloadPdf(invoice.blob, invoice.name)}>
            <Download /> Download
          </Button>
        </div>
      )}
    </div>
  );
}
