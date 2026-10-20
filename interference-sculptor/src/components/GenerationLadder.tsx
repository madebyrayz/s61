import { Info, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { GENERATIONS } from "@/copy";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { ToolButton, floating } from "./toolbar";

interface Props {
  /** Sources after each generation, as far as the current one. */
  counts: number[];
  value: number;
  max: number;
  playing: boolean;
  onChange: (v: number) => void;
  onPlay: () => void;
  onStop: () => void;
}

/**
 * The generations control, docked at the bottom of the canvas: play, equal
 * steps up as in week 1, and the chain of source counts beside them.
 */
export function GenerationLadder({ counts, value, max, playing, onChange, onPlay, onStop }: Props) {
  const steps = Array.from({ length: max + 1 }, (_, i) => i);
  const chain = counts.slice(0, value + 1);

  return (
    <div className={cn(floating, "flex items-center gap-2 py-1.5 pr-2 pl-1.5")} role="group" aria-label={GENERATIONS.label}>
      <ToolButton
        label={playing ? GENERATIONS.stopLabel : GENERATIONS.playLabel}
        tipSide="top"
        onClick={playing ? onStop : onPlay}
      >
        {playing ? <Pause /> : <Play />}
      </ToolButton>

      <div className="h-[24px] w-px bg-border" aria-hidden />

      <span className="pl-1 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{GENERATIONS.label}</span>

      <div className="flex items-end gap-0.5">
        {steps.map((g) => {
          const active = g === value;
          const reached = g <= value;
          return (
            <button
              key={g}
              type="button"
              onClick={() => onChange(g)}
              aria-pressed={active}
              aria-label={`Generation ${g}`}
              className="group flex w-[28px] cursor-pointer flex-col items-center gap-1 rounded-md py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                style={{ height: `${6 + (g / max) * 16}px` }}
                className={cn(
                  "w-4 rounded-[2px] transition-colors",
                  active
                    ? "bg-primary"
                    : reached
                      ? "bg-muted-foreground/45 group-hover:bg-muted-foreground/70"
                      : "bg-secondary group-hover:bg-muted-foreground/40",
                )}
              />
              <span className={cn("font-mono text-2xs leading-none transition-colors", active ? "text-foreground" : "text-muted-foreground")}>
                {g}
              </span>
            </button>
          );
        })}
      </div>

      {chain.length ? (
        <div className="hidden items-baseline gap-1.5 pl-1 font-mono text-xs whitespace-nowrap sm:flex">
          {chain.map((n, i) => (
            <span key={i} className="flex items-baseline gap-1.5">
              {i > 0 ? <span className="text-muted-foreground/50">→</span> : null}
              <span className={i === chain.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground"}>
                {n.toLocaleString()}
              </span>
            </span>
          ))}
          <span className="font-sans text-muted-foreground">sources</span>
        </div>
      ) : null}

      <Popover>
        <PopoverTrigger asChild>
          <ToolButton label={`About ${GENERATIONS.label.toLowerCase()}`} tipSide="top" className="size-[28px] [&_svg]:size-3.5">
            <Info />
          </ToolButton>
        </PopoverTrigger>
        <PopoverContent side="top" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold tracking-snug">{GENERATIONS.label}</h3>
          <p className="text-xs leading-normal text-muted-foreground">{GENERATIONS.blurb}</p>
          {value > 0 && chain.length > 1 ? (
            <p className="text-xs leading-normal">{GENERATIONS.countNote(chain[0], chain[chain.length - 1], value)}</p>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  );
}
