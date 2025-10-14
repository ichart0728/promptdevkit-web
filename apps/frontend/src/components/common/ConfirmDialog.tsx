import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isConfirming = false,
  onConfirm,
  onOpenChange,
}) => {
  const fallbackDescriptionId = React.useId();
  const handleCancel = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={description ? undefined : fallbackDescriptionId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription id={fallbackDescriptionId}>
              This action requires your confirmation.
            </DialogDescription>
          )}
        </DialogHeader>
        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={handleCancel} disabled={isConfirming}>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm} disabled={isConfirming} autoFocus>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
