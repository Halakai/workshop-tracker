import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormDrawer } from '@/components/FormDrawer';
import { AttachmentStrip } from './AttachmentStrip';
import { useAttachments, type EntityType } from './api';

/** A small "receipt" button for a row (e.g. a stock purchase) that opens its receipts. */
export function ReceiptButton({ entityType, entityId, label }: { entityType: EntityType; entityId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const files = useAttachments(entityType, entityId);
  const count = files.data?.length ?? 0;
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label="Receipts">
        <Paperclip /> {count > 0 ? count : 'Receipt'}
      </Button>
      <FormDrawer open={open} onOpenChange={setOpen} title="Receipt">
        <div className="pb-4">
          <AttachmentStrip entityType={entityType} entityId={entityId} kind="receipt" allowPdf label={label} />
        </div>
      </FormDrawer>
    </>
  );
}
