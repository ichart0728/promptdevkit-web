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
import type { IntegerPlanLimitEvaluation } from '@/lib/limits';

type UpgradeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evaluation?: IntegerPlanLimitEvaluation | null;
};

export const UpgradeDialog: React.FC<UpgradeDialogProps> = ({ open, onOpenChange, evaluation }) => {
  const limitLabel = React.useMemo(() => {
    if (!evaluation) {
      return 'your current plan';
    }

    const baseLabel = evaluation.key.replace(/_/g, ' ');
    if (evaluation.limitValue === null) {
      return `${baseLabel} (unlimited)`;
    }

    return `${baseLabel} (${evaluation.limitValue.toLocaleString()} max)`;
  }, [evaluation]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade to unlock more capacity</DialogTitle>
          <DialogDescription>
            {evaluation?.status === 'limit-exceeded'
              ? 'You have reached the current limit. Upgrade your plan to continue creating prompts.'
              : 'You are approaching the current limit. Consider upgrading to avoid interruptions.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Evaluated limit:&nbsp;
            <span className="font-medium text-foreground">{limitLabel}</span>
          </p>
          {evaluation ? (
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Current usage: <span className="font-medium text-foreground">{evaluation.currentUsage}</span>
              </li>
              <li>
                Attempted change: <span className="font-medium text-foreground">+{evaluation.delta}</span>
              </li>
              <li>
                Usage after change: <span className="font-medium text-foreground">{evaluation.nextUsage}</span>
              </li>
            </ul>
          ) : (
            <p>No evaluation data. Limits will be checked before any write operations.</p>
          )}
          <p className="pt-2 text-xs uppercase tracking-wide text-muted-foreground">
            This is a placeholder modal. Connect billing information and upgrade flows later.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" disabled>
            View upgrade options
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
