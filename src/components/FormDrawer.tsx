import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBackToClose, useKeyboardInset } from '@/lib/overlay';

interface FormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

/** How far the top bar has to be pulled down to close the pop-up. */
const CLOSE_DISTANCE = 90;

/**
 * The pop-up used for every form.
 * Phone: a sheet from the bottom that sits right above the keyboard; close it with ✕, back, a tap outside,
 * or by pulling the top bar down (only the top bar: touching the fields never moves the sheet).
 * Computer: a window in the middle of the screen; Esc closes it.
 */
export function FormDrawer({ open, onOpenChange, title, description, children }: FormDrawerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const keyboard = useKeyboardInset(open, contentRef);
  useBackToClose(open, () => onOpenChange(false));

  // pull the top bar down to close (when it closes that way it slides out from where it was let go)
  const [pull, setPull] = useState<number | null>(null);
  const pullStart = useRef<{ y: number; at: number } | null>(null);
  useEffect(() => {
    if (open) setPull(null);
  }, [open]);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('button')) return;
    pullStart.current = { y: e.clientY, at: e.timeStamp };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (pullStart.current) setPull(Math.max(0, e.clientY - pullStart.current.y));
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const start = pullStart.current;
    pullStart.current = null;
    if (!start) return;
    const distance = e.clientY - start.y;
    const speed = distance / Math.max(1, e.timeStamp - start.at); // px per ms: a quick flick also closes
    if (distance > CLOSE_DISTANCE || (distance > 30 && speed > 0.5)) onOpenChange(false);
    else setPull(null);
  };

  const style = {
    '--kb': `${keyboard.inset}px`,
    '--vvh': keyboard.height ? `${keyboard.height}px` : '100dvh',
    ...(pull ? { translate: `0 ${pull}px`, transition: 'none' } : {}),
  } as CSSProperties;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          ref={contentRef}
          style={style}
          // fields with autoFocus get the focus; otherwise the pop-up itself (not the ✕ button)
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            if (!contentRef.current?.contains(document.activeElement)) contentRef.current?.focus({ preventScroll: true });
          }}
          className={[
            'fixed inset-x-0 bottom-(--kb) z-50 mx-auto flex max-h-[min(92dvh,calc(var(--vvh)-0.75rem))] w-full max-w-lg flex-col rounded-t-2xl border-t bg-popover text-sm text-popover-foreground shadow-xl outline-none',
            'transition-[translate] duration-300 pc:duration-150 data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom',
            'pc:top-1/2 pc:bottom-auto pc:max-h-[85dvh] pc:-translate-y-1/2 pc:rounded-2xl pc:border pc:data-open:fade-in-0 pc:data-open:zoom-in-95 pc:data-open:slide-in-from-bottom-4 pc:data-closed:fade-out-0 pc:data-closed:zoom-out-95 pc:data-closed:slide-out-to-bottom-4',
          ].join(' ')}
        >
          <div
            className="flex shrink-0 touch-none flex-col px-4 pt-2 pb-3 select-none pc:pt-4"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-muted-foreground/30 pc:hidden" />
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="text-lg font-medium text-foreground">{title}</DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className="text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
                ) : (
                  <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
                )}
              </div>
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" className="-mt-1 -mr-2 shrink-0 text-muted-foreground" aria-label="Close">
                  <XIcon className="size-5" />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-py-4 px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
