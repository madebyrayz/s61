import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";

/**
 * The pieces of a canvas-app toolbar: a floating strip of icon buttons on an
 * edge of the screen, and flyouts that open beside it for a tool's settings.
 */

export const floating =
  "pointer-events-auto rounded-xl border border-border bg-[var(--panel-bg)] shadow-panel [backdrop-filter:var(--panel-blur)]";

type Side = "left" | "right" | "top" | "bottom";

/** A vertical strip of tools, floating over the canvas. */
export function Rail({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="toolbar" aria-label={label} aria-orientation="vertical" className={cn(floating, "flex flex-col items-center gap-1 p-1.5", className)}>
      {children}
    </div>
  );
}

export function RailDivider() {
  return <div className="my-0.5 h-px w-[24px] bg-border" aria-hidden />;
}

const iconButton = (active = false) =>
  cn(
    "inline-flex size-9 shrink-0 items-center justify-center rounded-lg outline-none transition-colors",
    "focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-[18px]",
    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
  );

interface ToolProps extends React.ComponentProps<"button"> {
  label: string;
  /** A key that does the same thing, shown in the tooltip. */
  shortcut?: string;
  active?: boolean;
  /** Which way the tooltip points: away from the screen edge the rail sits on. */
  tipSide?: Side;
}

/** An icon button with its name in a tooltip. */
export const ToolButton = React.forwardRef<HTMLButtonElement, ToolProps>(function ToolButton(
  { label, shortcut, active, tipSide = "right", className, children, ...props },
  ref,
) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          aria-label={label}
          aria-pressed={active}
          className={cn(iconButton(active), className)}
          {...props}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side={tipSide}>
        {label}
        {shortcut ? <span className="ml-2 opacity-60">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
});

/** A tool whose settings open in a card beside the rail. */
export function Flyout({
  icon,
  label,
  intro,
  side,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  intro?: string;
  /** Where the card opens, relative to the button. */
  side: Side;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ToolButton label={label} tipSide={side} active={open}>
          {icon}
        </ToolButton>
      </PopoverTrigger>
      <PopoverContent side={side} align="center" aria-label={label}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold tracking-snug">{label}</h3>
            {intro ? <p className="text-xs leading-normal text-muted-foreground">{intro}</p> : null}
          </div>
          <div className="flex flex-col gap-4">{children}</div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
