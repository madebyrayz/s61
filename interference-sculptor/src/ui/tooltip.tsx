import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/** Tooltip — a small label revealed on hover or focus. */
function TooltipProvider({
  delayDuration = 200,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  );
}

function TooltipTrigger(
  props: React.ComponentProps<typeof TooltipPrimitive.Trigger>,
) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

/**
 * `variant="rich"` is a popover-surface tooltip sized for a short explanation
 * rather than a label. The design system styles [data-tip] the same way — popover
 * background, border, shadow — so this is that rule expressed as a component.
 */
function TooltipContent({
  className,
  sideOffset = 10,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  variant?: "default" | "rich";
}) {
  const rich = variant === "rich";
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "z-50 origin-(--radix-tooltip-content-transform-origin)",
          "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          rich
            ? "w-[19rem] max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-popover p-3.5 text-popover-foreground shadow-panel"
            : "w-fit max-w-64 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background text-balance",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow
          className={cn(
            "z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]",
            rich
              ? "border-r border-b border-border bg-popover fill-popover"
              : "bg-foreground fill-foreground",
          )}
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
