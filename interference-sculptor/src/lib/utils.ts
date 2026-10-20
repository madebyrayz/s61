import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, de-conflicting Tailwind utilities (the later class wins).
 * The one utility every component in src/ui depends on.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** The pill used for every small button in the panel: choices, Play, Hide. */
export const pill = (active = false) =>
  cn(
    "rounded-pill border px-2.5 py-1 text-xs transition-colors outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring",
    active
      ? "border-transparent bg-primary text-primary-foreground"
      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
  );
