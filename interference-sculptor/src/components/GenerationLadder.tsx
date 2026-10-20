import { Pause, Play } from "lucide-react";
import { cn, pill } from "@/lib/utils";
import { GENERATIONS } from "@/copy";

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

/** The generations control, as in week 1: equal steps up, and the chain of source counts below. */
export function GenerationLadder({ counts, value, max, playing, onChange, onPlay, onStop }: Props) {
  const steps = Array.from({ length: max + 1 }, (_, i) => i);
  const chain = counts.slice(0, value + 1);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
          {GENERATIONS.label}
        </h3>
        <button
          type="button"
          onClick={playing ? onStop : onPlay}
          className={cn(pill(), "inline-flex items-center gap-1.5")}
        >
          {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
          {playing ? GENERATIONS.stopLabel : GENERATIONS.playLabel}
        </button>
      </div>

      <p className="text-xs leading-normal text-muted-foreground">{GENERATIONS.blurb}</p>

      <div className="flex items-end gap-1" role="group" aria-label={GENERATIONS.label}>
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
              className="group flex flex-1 cursor-pointer flex-col items-center gap-1.5 rounded-md py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                style={{ height: `${12 + (g / max) * 56}px` }}
                className={cn(
                  "w-full max-w-6 rounded-[3px] transition-colors",
                  active
                    ? "bg-primary"
                    : reached
                      ? "bg-muted-foreground/45 group-hover:bg-muted-foreground/70"
                      : "bg-secondary group-hover:bg-muted-foreground/40",
                )}
              />
              <span className={cn("font-mono text-2xs transition-colors", active ? "text-foreground" : "text-muted-foreground")}>
                {g}
              </span>
            </button>
          );
        })}
      </div>

      {chain.length ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 font-mono text-xs">
            {chain.map((n, i) => (
              <span key={i} className="flex items-baseline gap-1.5">
                {i > 0 ? <span className="text-muted-foreground/50">→</span> : null}
                <span className={i === chain.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground"}>
                  {n.toLocaleString()}
                </span>
              </span>
            ))}
            <span className="text-muted-foreground">sources</span>
          </div>
          {value > 0 && chain.length > 1 ? (
            <p className="text-2xs leading-normal text-muted-foreground">
              {GENERATIONS.countNote(chain[0], chain[chain.length - 1], value)}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
