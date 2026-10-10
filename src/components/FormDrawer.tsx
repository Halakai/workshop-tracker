import type { ReactNode } from 'react';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

interface FormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

/** Bottom sheet used for every form: thumb-reachable on a phone, swipe down to close. */
export function FormDrawer({ open, onOpenChange, title, description, children }: FormDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[92dvh]">
        <div className="mx-auto w-full max-w-lg overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="text-lg">{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
