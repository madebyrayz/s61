import {
  Atom,
  Blend,
  Box,
  Camera,
  Cloud,
  Eye,
  Info,
  Palette,
  Pencil,
  Rotate3d,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Waves,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  MAX_GENERATIONS,
  PRESETS,
  QUALITIES,
  type Background,
  type ColorBy,
  type PaletteName,
  type Params,
  type RenderMode,
} from "@/params";
import { ACTIONS, BAKING, CONTROLS, FOOTER_HINT, PANEL, PRIMER, SECTIONS } from "@/copy";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { ButtonRow, PresetRow, SelectRow, SliderRow, SwitchRow } from "./controls";
import { GenerationLadder } from "./GenerationLadder";
import { Flyout, Rail, RailDivider, ToolButton, floating } from "./toolbar";

const RENDER_OPTIONS: { value: RenderMode; label: string; icon: ReactNode }[] = [
  { value: "surface", label: "Surface", icon: <Box /> },
  { value: "volume", label: "Volume", icon: <Cloud /> },
  { value: "fronts", label: "Wavefronts", icon: <Waves /> },
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
  baking: boolean;
  activePreset: number | null;
  onPlay: () => void;
  onStop: () => void;
  onPreset: (i: number) => void;
  onUndo: () => void;
  onClear: () => void;
  onReset: () => void;
  onCapture: () => void;
}

/**
 * Every control, laid out like a canvas app around the edges of the screen:
 * the pen and the edits on the left, how the field is drawn on the right,
 * generations along the bottom, presets along the top.
 */
export function CanvasControls({
  params: p,
  update,
  counts,
  strokeCount,
  playing,
  baking,
  activePreset,
  onPlay,
  onStop,
  onPreset,
  onUndo,
  onClear,
  onReset,
  onCapture,
}: Props) {
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
  const paper = p.background === "paper";

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Top: name and intro on the left, presets in the middle. */}
      <div className="absolute inset-x-4 top-4 flex flex-col items-start gap-3 lg:flex-row lg:items-center">
        <div className={cn(floating, "flex items-center gap-1 py-1 pr-1 pl-3.5")}>
          <h1 className="text-sm font-semibold tracking-snug whitespace-nowrap">{PANEL.title}</h1>
          <Popover>
            <PopoverTrigger asChild>
              <ToolButton label={PRIMER.title} tipSide="bottom" className="size-[32px] [&_svg]:size-4">
                <Info />
              </ToolButton>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="flex w-80 flex-col gap-2">
              <h3 className="text-sm font-semibold tracking-snug">{PANEL.subtitle}</h3>
              {PRIMER.body.map((line, i) => (
                <p key={i} className="text-xs leading-relaxed text-muted-foreground">
                  {line}
                </p>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        <div
          className={cn(
            floating,
            "scroll max-w-full overflow-x-auto p-1.5 lg:absolute lg:left-1/2 lg:max-w-[calc(100%-36rem)] lg:-translate-x-1/2",
          )}
          aria-label={SECTIONS.presets.title}
        >
          <PresetRow
            names={PRESETS.map((x) => x.name)}
            notes={PRESETS.map((x) => x.note)}
            active={activePreset}
            onPick={onPreset}
            nowrap
          />
        </div>
      </div>

      {/* Left: the pen, and edits to what has been drawn. */}
      <Rail label="Pen" className="absolute top-1/2 left-4 -translate-y-1/2">
        <ToolButton label="Draw" shortcut="D" active={p.tool === "draw"} onClick={() => update("tool", "draw")}>
          <Pencil />
        </ToolButton>
        <ToolButton label="Orbit" shortcut="O" active={p.tool === "orbit"} onClick={() => update("tool", "orbit")}>
          <Rotate3d />
        </ToolButton>
        <RailDivider />
        <Flyout icon={<SlidersHorizontal />} label={SECTIONS.pen.title} intro={SECTIONS.pen.intro} side="right">
          <SwitchRow id="hand-lambda" copy={CONTROLS.handSetsLambda} checked={p.handSetsLambda} onChange={(v) => update("handSetsLambda", v)} />
          {p.handSetsLambda ? null : slider("lambda", 0.1, 0.28, ["fine", "broad"], (v) => `λ ${v.toFixed(2)}`)}
          {slider("depth", -0.8, 0.8, ["near", "far"], (v) => (v >= 0 ? "+" : "") + v.toFixed(2))}
        </Flyout>
        <Flyout icon={<Atom />} label={SECTIONS.physics.title} intro={SECTIONS.physics.intro} side="right">
          {slider("spacing", 0.3, 2.5, ["one slit", "a row of pinholes"], (v) => `${v.toFixed(2)} λ`)}
          <SwitchRow id="which-path" copy={CONTROLS.whichPath} checked={p.whichPath} onChange={(v) => update("whichPath", v)} />
          <ButtonRow
            id="quality"
            copy={CONTROLS.quality}
            value={String(p.quality)}
            options={QUALITY_OPTIONS}
            onChange={(v) => update("quality", Number(v))}
          />
        </Flyout>
        <RailDivider />
        <ToolButton label={ACTIONS.undo.label} shortcut="⌘Z" onClick={onUndo} disabled={!strokeCount}>
          <Undo2 />
        </ToolButton>
        <ToolButton label={ACTIONS.clear.hint} onClick={onClear} disabled={!strokeCount}>
          <Trash2 />
        </ToolButton>
        <ToolButton label={ACTIONS.reset.hint} onClick={onReset}>
          <RotateCcw />
        </ToolButton>
      </Rail>

      {/* Right: how the field becomes a picture. */}
      <Rail label="Render" className="absolute top-1/2 right-4 -translate-y-1/2">
        {RENDER_OPTIONS.map((o) => (
          <ToolButton key={o.value} label={o.label} tipSide="left" active={p.render === o.value} onClick={() => update("render", o.value)}>
            {o.icon}
          </ToolButton>
        ))}
        <RailDivider />
        <Flyout icon={<Blend />} label={SECTIONS.shape.title} intro={SECTIONS.shape.intro} side="left">
          {slider("threshold", 0.05, 0.95, ["thick", "thin"])}
          {slider("reach", 0.01, 0.4, ["far out", "near the strokes"])}
          {p.render === "surface" ? null : slider("density", 0.05, 1.5)}
          {slider("exposure", 0.2, 4, undefined, (v) => `×${v.toFixed(2)}`)}
        </Flyout>
        <Flyout icon={<Palette />} label={SECTIONS.colour.title} intro={SECTIONS.colour.intro} side="left">
          <ButtonRow<ColorBy> id="colour-by" copy={CONTROLS.colorBy} value={p.colorBy} options={COLOR_OPTIONS} onChange={(v) => update("colorBy", v)} />
          <SelectRow<PaletteName> id="palette" copy={CONTROLS.palette} value={p.palette} options={PALETTE_OPTIONS} onChange={(v) => update("palette", v)} />
          <ButtonRow<Background> id="ground" copy={CONTROLS.background} value={p.background} options={GROUND_OPTIONS} onChange={(v) => update("background", v)} />
        </Flyout>
        <Flyout icon={<Eye />} label={SECTIONS.view.title} side="left">
          <SwitchRow id="strokes" copy={CONTROLS.showStrokes} checked={p.showStrokes} onChange={(v) => update("showStrokes", v)} />
          <SwitchRow id="grid" copy={CONTROLS.showGrid} checked={p.showGrid} onChange={(v) => update("showGrid", v)} />
          <SwitchRow id="rotate" copy={CONTROLS.autoRotate} checked={p.autoRotate} onChange={(v) => update("autoRotate", v)} />
        </Flyout>
        <RailDivider />
        <ToolButton label={ACTIONS.capture.hint} tipSide="left" onClick={onCapture}>
          <Camera />
        </ToolButton>
      </Rail>

      {/* Bottom: generations, and how to drive the canvas, centred. */}
      <div className="absolute inset-x-4 bottom-4 flex flex-col items-center gap-2">
        <GenerationLadder
          counts={counts}
          value={p.generations}
          max={MAX_GENERATIONS}
          playing={playing}
          onChange={(v) => update("generations", v)}
          onPlay={onPlay}
          onStop={onStop}
        />
        <p className={cn("text-center text-2xs", paper ? "text-neutral-500" : "text-muted-foreground")}>
          {baking ? BAKING : FOOTER_HINT}
        </p>
      </div>
    </div>
  );
}

