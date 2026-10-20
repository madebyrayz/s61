import { useState } from "react";
import { Camera, ChevronDown, Eraser, PanelRightClose, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import { Button } from "@/ui/button";
import { Separator } from "@/ui/separator";
import { cn, pill } from "@/lib/utils";
import {
  MAX_GENERATIONS,
  PRESETS,
  QUALITIES,
  type Background,
  type ColorBy,
  type PaletteName,
  type Params,
  type RenderMode,
  type Tool,
} from "@/params";
import { ACTIONS, CONTROLS, PANEL, PRIMER, SECTIONS } from "@/copy";
import { ButtonRow, PresetRow, Section, SelectRow, SliderRow, SwitchRow } from "./controls";
import { GenerationLadder } from "./GenerationLadder";

const TOOL_OPTIONS: { value: Tool; label: string }[] = [
  { value: "draw", label: "Draw" },
  { value: "orbit", label: "Orbit" },
];
const RENDER_OPTIONS: { value: RenderMode; label: string }[] = [
  { value: "surface", label: "Surface" },
  { value: "volume", label: "Volume" },
  { value: "fronts", label: "Wavefronts" },
];
const COLOR_OPTIONS: { value: ColorBy; label: string }[] = [
  { value: "phase", label: "Phase" },
  { value: "fringe", label: "Fringe" },
  { value: "height", label: "Height" },
];
const PALETTE_OPTIONS: { value: PaletteName; label: string }[] = [
  { value: "spectral", label: "Spectral" },
  { value: "iridescent", label: "Iridescent" },
  { value: "monet", label: "Monet" },
  { value: "ember", label: "Ember" },
  { value: "glacier", label: "Glacier" },
  { value: "ink", label: "Ink" },
];
const GROUND_OPTIONS: { value: Background; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "paper", label: "Paper" },
];
const QUALITY_OPTIONS = QUALITIES.map((q) => ({ value: String(q), label: `${q}³` }));

interface Props {
  params: Params;
  update: <K extends keyof Params>(key: K, value: Params[K]) => void;
  counts: number[];
  strokeCount: number;
  playing: boolean;
  activePreset: number | null;
  onPlay: () => void;
  onStop: () => void;
  onPreset: (i: number) => void;
  onUndo: () => void;
  onClear: () => void;
  onReset: () => void;
  onCapture: () => void;
  onHide: () => void;
}

export function ControlPanel({
  params: p,
  update,
  counts,
  strokeCount,
  playing,
  activePreset,
  onPlay,
  onStop,
  onPreset,
  onUndo,
  onClear,
  onReset,
  onCapture,
  onHide,
}: Props) {
  const [primerOpen, setPrimerOpen] = useState(true);
  const slider = (
    key: "lambda" | "spacing" | "depth" | "threshold" | "reach" | "density" | "exposure",
    min: number,
    max: number,
    ends?: [string, string],
    format?: (v: number) => string,
  ) => (
    <SliderRow
      copy={CONTROLS[key]}
      value={p[key]}
      min={min}
      max={max}
      step={(max - min) / 200}
      onChange={(v) => update(key, v)}
      ends={ends}
      format={format}
    />
  );

  return (
    <aside
      aria-label="Sculptor controls"
      className={cn(
        "flex h-full w-full flex-col overflow-hidden border-border bg-[var(--panel-bg)] text-card-foreground",
        "lg:border-l lg:[backdrop-filter:var(--panel-blur)]",
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-base font-semibold tracking-snug">{PANEL.title}</h1>
          <p className="text-xs text-muted-foreground">{PANEL.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onHide}
          aria-label={PANEL.hide}
          className={cn(pill(), "inline-flex shrink-0 items-center gap-1.5")}
        >
          <PanelRightClose className="size-3" />
          {PANEL.hide}
        </button>
      </div>

      <div className="scroll flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 pb-6">
        <div className="rounded-lg border border-border bg-muted/40">
          <button
            type="button"
            onClick={() => setPrimerOpen((v) => !v)}
            aria-expanded={primerOpen}
            className="flex w-full items-center gap-2 px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">{PRIMER.title}</span>
            <ChevronDown
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", !primerOpen && "-rotate-90")}
            />
          </button>
          {primerOpen ? (
            <div className="flex flex-col gap-2 px-3.5 pb-3.5">
              {PRIMER.body.map((line, i) => (
                <p key={i} className="text-xs leading-relaxed text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        <Section copy={SECTIONS.presets}>
          <PresetRow
            names={PRESETS.map((x) => x.name)}
            notes={PRESETS.map((x) => x.note)}
            active={activePreset}
            onPick={onPreset}
          />
        </Section>

        <Separator />

        <GenerationLadder
          counts={counts}
          value={p.generations}
          max={MAX_GENERATIONS}
          playing={playing}
          onChange={(v) => update("generations", v)}
          onPlay={onPlay}
          onStop={onStop}
        />

        <Separator />

        <Section copy={SECTIONS.pen}>
          <ButtonRow<Tool> id="tool" copy={CONTROLS.tool} value={p.tool} options={TOOL_OPTIONS} onChange={(v) => update("tool", v)} />
          <SwitchRow
            id="hand-lambda"
            copy={CONTROLS.handSetsLambda}
            checked={p.handSetsLambda}
            onChange={(v) => update("handSetsLambda", v)}
          />
          {p.handSetsLambda ? null : slider("lambda", 0.1, 0.28, ["fine", "broad"], (v) => `λ ${v.toFixed(2)}`)}
          {slider("depth", -0.8, 0.8, ["near", "far"], (v) => (v >= 0 ? "+" : "") + v.toFixed(2))}
        </Section>

        <Separator />

        <Section copy={SECTIONS.physics}>
          {slider("spacing", 0.3, 2.5, ["one slit", "a row of pinholes"], (v) => `${v.toFixed(2)} λ`)}
          <SwitchRow id="which-path" copy={CONTROLS.whichPath} checked={p.whichPath} onChange={(v) => update("whichPath", v)} />
          <ButtonRow
            id="quality"
            copy={CONTROLS.quality}
            value={String(p.quality)}
            options={QUALITY_OPTIONS}
            onChange={(v) => update("quality", Number(v))}
          />
        </Section>

        <Separator />

        <Section copy={SECTIONS.shape}>
          <ButtonRow<RenderMode> id="render" copy={CONTROLS.render} value={p.render} options={RENDER_OPTIONS} onChange={(v) => update("render", v)} />
          {slider("threshold", 0.05, 0.95, ["thick", "thin"])}
          {slider("reach", 0.01, 0.4, ["to the edges", "near the strokes"])}
          {p.render === "surface" ? null : slider("density", 0.05, 1.5)}
          {slider("exposure", 0.2, 4, undefined, (v) => `×${v.toFixed(2)}`)}
        </Section>

        <Separator />

        <Section copy={SECTIONS.colour}>
          <ButtonRow<ColorBy> id="colour-by" copy={CONTROLS.colorBy} value={p.colorBy} options={COLOR_OPTIONS} onChange={(v) => update("colorBy", v)} />
          <SelectRow<PaletteName> id="palette" copy={CONTROLS.palette} value={p.palette} options={PALETTE_OPTIONS} onChange={(v) => update("palette", v)} />
          <ButtonRow<Background> id="ground" copy={CONTROLS.background} value={p.background} options={GROUND_OPTIONS} onChange={(v) => update("background", v)} />
        </Section>

        <Separator />

        <Section copy={SECTIONS.view}>
          <SwitchRow id="strokes" copy={CONTROLS.showStrokes} checked={p.showStrokes} onChange={(v) => update("showStrokes", v)} />
          <SwitchRow id="box" copy={CONTROLS.showBox} checked={p.showBox} onChange={(v) => update("showBox", v)} />
          <SwitchRow id="rotate" copy={CONTROLS.autoRotate} checked={p.autoRotate} onChange={(v) => update("autoRotate", v)} />
        </Section>
      </div>

      <div className="shrink-0 border-t border-border bg-background/40 px-5 py-4">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" size="sm" onClick={onUndo} disabled={!strokeCount} title={ACTIONS.undo.hint}>
              <Undo2 />
              {ACTIONS.undo.label}
            </Button>
            <Button variant="outline" size="sm" onClick={onClear} disabled={!strokeCount} title={ACTIONS.clear.hint}>
              <Eraser />
              {ACTIONS.clear.label}
            </Button>
            <Button variant="outline" size="sm" onClick={onReset} title={ACTIONS.reset.hint}>
              <RotateCcw />
              {ACTIONS.reset.label}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={onCapture} title={ACTIONS.capture.hint}>
            <Camera />
            {ACTIONS.capture.label}
          </Button>
        </div>
      </div>
    </aside>
  );
}
