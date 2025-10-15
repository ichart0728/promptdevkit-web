import { Command as CommandPrimitive } from 'cmdk';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn(
      'flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg',
      className,
    )}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

type CommandDialogProps = React.ComponentProps<typeof Dialog> & {
  label: string;
  description?: string;
  contentProps?: React.ComponentPropsWithoutRef<typeof DialogContent>;
};

const CommandDialog = ({ children, label, description = 'Use the search field to filter results.', contentProps, ...props }: CommandDialogProps) => {
  const titleId = React.useId();
  const descriptionId = React.useId();
  const { className, ...restContentProps } = contentProps ?? {};

  return (
    <Dialog {...props}>
      <DialogContent
        {...restContentProps}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'overflow-hidden p-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out [&>button:last-child]:hidden',
          className,
        )}
      >
        <DialogTitle id={titleId} className="px-4 pt-4 text-sm font-medium text-muted-foreground">
          {label}
        </DialogTitle>
        {description ? (
          <DialogDescription id={descriptionId} className="px-4 text-xs text-muted-foreground">
            {description}
          </DialogDescription>
        ) : null}
        <Command>{children}</Command>
      </DialogContent>
    </Dialog>
  );
};
CommandDialog.displayName = 'CommandDialog';

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div className="flex items-center border-b border-border px-3" cmdk-input-wrapper="">
    <CommandPrimitive.Input
      ref={ref}
      className={cn(
        'flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn('max-h-[60vh] overflow-y-auto overflow-x-hidden', className)}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Empty ref={ref} className={cn('py-6 text-center text-sm', className)} {...props} />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn(
      'overflow-hidden p-2 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground',
      className,
    )}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-sm px-2 py-2 text-sm outline-none transition-colors data-[disabled=true]:pointer-events-none data-[selected=true]:bg-muted data-[disabled=true]:opacity-50',
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator ref={ref} className={cn('-mx-1 h-px bg-border', className)} {...props} />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ml-auto text-xs tracking-widest text-muted-foreground', className)} {...props} />
);
CommandShortcut.displayName = 'CommandShortcut';

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
