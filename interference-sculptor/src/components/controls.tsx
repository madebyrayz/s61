import * as React from "react";
import { HelpCircle } from "lucide-react";
import { Label } from "@/ui/label";
import { Slider } from "@/ui/slider";
import { Switch } from "@/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";
import { cn, pill } from "@/lib/utils";
import type { Explainer, SectionCopy } from "@/copy";

/**
 * A group of controls, with a short note on the idea they share. The note stays
 * on the page rather than in a tooltip, so nobody has to know to hover.
 */
export function Section({
  copy,
  children,
}: {
  copy: SectionCopy;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
          {copy.title}
        </h3>
        <p className="text-xs leading-normal text-muted-foreground">{copy.intro}</p>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** The per-control explanation. A button, so it opens on tap as well as hover. */
function Explain({ copy }: { copy: Explainer }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`What does ${copy.label} do?`}
          className="inline-flex shrink-0 rounded-full text-muted-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HelpCircle className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent variant="rich" side="top" align="start">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold tracking-snug">{copy.label}</span>
            {copy.paper ? (
              <span className="font-mono text-2xs text-muted-foreground">{copy.paper}</span>
            ) : null}
          </div>
          <p className="text-xs leading-normal">{copy.what}</p>
          <p className="text-xs leading-normal text-muted-foreground">{copy.see}</p>
          {copy.hint ? (
            <p className="mt-0.5 border-t border-border pt-2 text-xs leading-normal">
              {copy.hint}
            </p>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function RowLabel({
  copy,
  htmlFor,
  id,
}: {
  copy: Explainer;
  htmlFor?: string;
  id?: string;
}) {
  return (
    <Label htmlFor={htmlFor} id={id} className="gap-1.5 text-sm text-foreground">
      {copy.label}
      {copy.what ? <Explain copy={copy} /> : null}
    </Label>
  );
}

export function SliderRow({
  copy,
  value,
  min,
  max,
  step = 0.01,
  onChange,
  format = (v) => v.toFixed(2),
  /** Words for the two ends, when the axis has a direction worth naming. */
  ends,
  /** True while the animator is driving this value. */
  animated = false,
}: {
  copy: Explainer;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  ends?: [string, string];
  animated?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <RowLabel copy={copy} />
        <span className={cn("font-mono text-xs", animated ? "text-foreground" : "text-muted-foreground")}>
          {animated ? <span className="mr-1.5 inline-block size-1.5 rounded-full bg-foreground align-middle" aria-hidden /> : null}
          {format(value)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        aria-label={copy.label}
      />
      {ends ? (
        <div className="flex justify-between text-2xs text-muted-foreground">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      ) : null}
    </div>
  );
}

export function SwitchRow({
  id,
  copy,
  checked,
  onChange,
}: {
  id: string;
  copy: Explainer;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <RowLabel copy={copy} htmlFor={id} />
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function SelectRow<T extends string>({
  id,
  copy,
  value,
  options,
  onChange,
}: {
  id: string;
  copy: Explainer;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <RowLabel copy={copy} id={`${id}-label`} />
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id} aria-labelledby={`${id}-label`} size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** One-of-many as a row of pills, for short lists where a dropdown would hide the options. */
export function ButtonRow<T extends string>({
  id,
  copy,
  value,
  options,
  onChange,
}: {
  id: string;
  copy: Explainer;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <RowLabel copy={copy} id={`${id}-label`} />
      <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`${id}-label`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={pill(value === o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A row of one-tap starting points. */
export function PresetRow({
  names,
  notes,
  active,
  onPick,
  nowrap = false,
}: {
  names: string[];
  notes: string[];
  active: number | null;
  onPick: (i: number) => void;
  /** One line, for a toolbar. */
  nowrap?: boolean;
}) {
  return (
    <div className={cn("flex gap-1.5", nowrap ? "flex-nowrap whitespace-nowrap" : "flex-wrap")}>
      {names.map((name, i) => (
        <Tooltip key={name}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onPick(i)}
              aria-pressed={active === i}
              className={pill(active === i)}
            >
              {name}
            </button>
          </TooltipTrigger>
          <TooltipContent variant="rich" side="bottom" align="start">
            <p className="text-xs leading-normal">{notes[i]}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
