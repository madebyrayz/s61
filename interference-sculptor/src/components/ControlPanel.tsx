import {
  Atom,
  Blend,
  Box,
  Camera,
  Circle,
  Cloud,
  Eraser,
  Eye,
  EyeOff,
  Image,
  Palette,
  Pause,
  Pencil,
  Play,
  Rotate3d,
  RotateCcw,
  SlidersHorizontal,
  Sprout,
  Trash2,
  Undo2,
  Waves,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn, pill } from "@/lib/utils";
import {
  PRESETS,
  QUALITIES,
  QUALITY_LABELS,
  THREAD_STYLES,
  type Background,
  type ColorBy,
  type Mark,
  type PaletteName,
  type Params,
  type RenderMode,
} from "@/params";
import { ACTIONS, BAKING, CONTROLS, FOOTER_HINT, PANEL, PRIMER, SECTIONS, THREADS } from "@/copy";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { ButtonRow, PresetRow, SelectRow, SliderRow, SwitchRow } from "./controls";
import { Flyout, Rail, RailDivider, ToolButton, floating } from "./toolbar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip";

const RENDER_OPTIONS: { value: RenderMode; label: string; icon: ReactNode }[] = [
  { value: "threads", label: "Threads", icon: <Sprout /> },
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
const MARK_OPTIONS: { value: Mark; label: string }[] = [
  { value: "dots", label: "Dots" },
  { value: "dashes", label: "Dashes" },
  { value: "line", label: "Line" },
];
const GROUND_OPTIONS: { value: Background; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "paper", label: "Paper" },
];
const QUALITY_OPTIONS = QUALITIES.map((q, i) => ({ value: String(q), label: QUALITY_LABELS[i] }));

interface Props {
  params: Params;
  update: <K extends keyof Params>(key: K, value: Params[K]) => void;
  strokeCount: number;
  threadCount: number;
  baking: boolean;
  recording: boolean;
  /** Whether this browser can record at all. */
  canRecord: boolean;
  clean: boolean;
  activePreset: number | null;
  onPreset: (i: number) => void;
  onStyle: (i: number) => void;
  onUndo: () => void;
  onClear: () => void;
  onClearThreads: () => void;
  onReset: () => void;
  onCapture: () => void;
  onRecord: () => void;
  onClean: (v: boolean) => void;
}

/** The title, top left: no frame, and a click opens the intro under it. */
function Title({ paper }: { paper: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pointer-events-auto flex max-w-80 flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "self-start rounded-md text-sm font-semibold tracking-snug outline-none focus-visible:ring-2 focus-visible:ring-ring",
          paper ? "text-neutral-800" : "text-foreground",
        )}
      >
        {PANEL.title}
      </button>
      {open ? (
        <div className="flex flex-col gap-2">
          <h3 className={cn("text-xs font-medium", paper ? "text-neutral-700" : "text-foreground")}>{PANEL.subtitle}</h3>
          {PRIMER.body.map((line, i) => (
            <p key={i} className={cn("text-xs leading-relaxed", paper ? "text-neutral-600" : "text-muted-foreground")}>
              {line}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Every control, laid out like a canvas app around the edges of the screen:
 * the pen and the edits on the left, how the field is drawn on the right,
 * how the threads grow along the bottom, presets along the top. Clean view
 * hides everything but the title.
 */
export function CanvasControls({
  params: p,
  update,
  strokeCount,
  threadCount,
  baking,
  recording,
  canRecord,
  clean,
  activePreset,
  onPreset,
  onStyle,
  onUndo,
  onClear,
  onClearThreads,
  onReset,
  onCapture,
  onRecord,
  onClean,
}: Props) {
  const slider = (
    key: "lambda" | "spacing" | "depth" | "threshold" | "reach" | "density" | "exposure" | "flow" | "coupling" | "spawn" | "life" | "trail" | "spread" | "wander" | "glide" | "loop",
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
  const threads = p.render === "threads";
  const activeStyle = THREAD_STYLES.findIndex((s) =>
    (Object.keys(s.values) as (keyof typeof s.values)[]).every((k) => Math.abs(p[k] - s.values[k]) < 1e-6),
  );
  const hintColor = paper ? "text-neutral-500" : "text-muted-foreground";

  if (clean) {
    return (
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-4 left-4">
          <Title paper={paper} />
        </div>
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {recording ? <span className="text-2xs text-red-500">● {ACTIONS.record.on}</span> : null}
          <button
            type="button"
            onClick={() => onClean(false)}
            aria-label={ACTIONS.clean.off}
            className={cn("pointer-events-auto rounded-md text-2xs outline-none focus-visible:ring-2 focus-visible:ring-ring", hintColor)}
          >
            {ACTIONS.clean.off} <span className="opacity-60">esc</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* Top: name and intro on the left, presets in the middle, resolution on the right. */}
      <div className="absolute inset-x-4 top-4 flex flex-col items-start gap-3 lg:flex-row lg:items-start">
        <div className="py-1.5">
          <Title paper={paper} />
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

        {/* Preview resolution, for the field modes. Save image ignores it and always renders at full quality. */}
        {threads ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                role="group"
                aria-label={CONTROLS.quality.label}
                className={cn(floating, "flex items-center gap-1 p-1.5 lg:ml-auto")}
              >
                {QUALITY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => update("quality", Number(o.value))}
                    aria-pressed={String(p.quality) === o.value}
                    className={pill(String(p.quality) === o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </TooltipTrigger>
            <TooltipContent variant="rich" side="bottom" align="end">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold tracking-snug">{CONTROLS.quality.label}</span>
                <p className="text-xs leading-normal">{CONTROLS.quality.what}</p>
                <p className="text-xs leading-normal text-muted-foreground">{CONTROLS.quality.see}</p>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Left: the pen, and edits to what has been drawn. */}
      <Rail label="Pen" className="absolute top-1/2 left-4 -translate-y-1/2">
        <ToolButton label="Draw" shortcut="P" active={p.tool === "draw"} onClick={() => update("tool", "draw")}>
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
        </Flyout>
        {threads ? (
          <Flyout icon={<Sprout />} label={SECTIONS.threads.title} intro={SECTIONS.threads.intro} side="right">
            {slider("flow", 0.2, 3, ["still", "fast"], (v) => `${v.toFixed(2)} λ/s`)}
            {slider("coupling", 0, 3, ["free", "locked"], (v) => `K ${v.toFixed(2)}`)}
            {slider("spawn", 1, 30, ["sparse", "dense"], (v) => `${Math.round(v)}`)}
            {slider("life", 2, 20, ["brief", "long"], (v) => `${v.toFixed(1)} s`)}
            {slider("trail", 0.02, 0.3, ["wash", "wire"], (v) => v.toFixed(2))}
            {slider("spread", 0.1, 3, ["close", "far"], (v) => v.toFixed(2))}
            {slider("glide", 0, 1, ["rays", "orbits"], (v) => v.toFixed(2))}
            {slider("loop", 0, 0.6, ["none", "curls"], (v) => `${v.toFixed(2)} λ`)}
            {slider("wander", 0, 1, ["exact", "chance"], (v) => v.toFixed(2))}
            <ButtonRow<Mark> id="mark" copy={CONTROLS.mark} value={p.mark} options={MARK_OPTIONS} onChange={(v) => update("mark", v)} />
          </Flyout>
        ) : null}
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

      {/* Right: how the field becomes a picture, and ways out. */}
      <Rail label="Render" className="absolute top-1/2 right-4 -translate-y-1/2">
        {RENDER_OPTIONS.map((o) => (
          <ToolButton key={o.value} label={o.label} tipSide="left" active={p.render === o.value} onClick={() => update("render", o.value)}>
            {o.icon}
          </ToolButton>
        ))}
        <RailDivider />
        {threads ? null : (
          <Flyout icon={<Blend />} label={SECTIONS.shape.title} intro={SECTIONS.shape.intro} side="left">
            {slider("threshold", 0.05, 0.95, ["thick", "thin"])}
            {slider("reach", 0.01, 0.4, ["far out", "near the strokes"])}
            {p.render === "surface" ? null : slider("density", 0.05, 1.5)}
            {slider("exposure", 0.2, 4, undefined, (v) => `×${v.toFixed(2)}`)}
          </Flyout>
        )}
        <Flyout icon={<Palette />} label={SECTIONS.colour.title} intro={SECTIONS.colour.intro} side="left">
          {threads ? null : (
            <ButtonRow<ColorBy> id="colour-by" copy={CONTROLS.colorBy} value={p.colorBy} options={COLOR_OPTIONS} onChange={(v) => update("colorBy", v)} />
          )}
          <SelectRow<PaletteName> id="palette" copy={CONTROLS.palette} value={p.palette} options={PALETTE_OPTIONS} onChange={(v) => update("palette", v)} />
          <ButtonRow<Background> id="ground" copy={CONTROLS.background} value={p.background} options={GROUND_OPTIONS} onChange={(v) => update("background", v)} />
        </Flyout>
        <Flyout icon={<Eye />} label={SECTIONS.view.title} side="left">
          <SwitchRow id="strokes" copy={CONTROLS.showStrokes} checked={p.showStrokes} onChange={(v) => update("showStrokes", v)} />
          <SwitchRow id="grid" copy={CONTROLS.showGrid} checked={p.showGrid} onChange={(v) => update("showGrid", v)} />
          <SwitchRow id="rotate" copy={CONTROLS.autoRotate} checked={p.autoRotate} onChange={(v) => update("autoRotate", v)} />
        </Flyout>
        <RailDivider />
        <Popover>
          <PopoverTrigger asChild>
            <ToolButton label={ACTIONS.capture.label} tipSide="left" active={recording} className={recording ? "bg-red-600 text-white hover:bg-red-600" : undefined}>
              {recording ? <Circle className="fill-current" /> : <Camera />}
            </ToolButton>
          </PopoverTrigger>
          <PopoverContent side="left" align="center" className="flex w-64 flex-col gap-3" aria-label={ACTIONS.capture.label}>
            <h3 className="text-sm font-semibold tracking-snug">{ACTIONS.capture.label}</h3>
            <button type="button" onClick={onCapture} className={cn(pill(), "flex items-center gap-2 self-start")}>
              <Image className="size-3.5" /> {ACTIONS.capture.hint}
            </button>
            <button
              type="button"
              onClick={onRecord}
              disabled={!canRecord}
              className={cn(pill(recording), "flex items-center gap-2 self-start", recording && "border-transparent bg-red-600 text-white")}
            >
              <Circle className={cn("size-3.5", recording && "fill-current")} /> {recording ? ACTIONS.record.stop : ACTIONS.record.start}
            </button>
            <p className="text-xs leading-normal text-muted-foreground">{canRecord ? ACTIONS.record.note : ACTIONS.record.unsupported}</p>
          </PopoverContent>
        </Popover>
        <ToolButton label={ACTIONS.clean.on} shortcut="H" tipSide="left" onClick={() => onClean(true)}>
          <EyeOff />
        </ToolButton>
      </Rail>

      {/* Bottom: how the threads grow, centred, and how to drive the canvas. */}
      <div className="absolute inset-x-4 bottom-4 flex flex-col items-center gap-2">
        {threads ? (
          <div className={cn(floating, "flex items-center gap-1 p-1.5")} role="toolbar" aria-label={SECTIONS.threads.title}>
            <ToolButton
              label={p.grow ? THREADS.growOn : THREADS.growOff}
              tipSide="top"
              active={p.grow}
              onClick={() => update("grow", !p.grow)}
              className="size-[32px]"
            >
              {p.grow ? <Pause /> : <Play />}
            </ToolButton>
            <div className="mx-0.5 h-5 w-px bg-border" aria-hidden />
            <PresetRow names={THREAD_STYLES.map((s) => s.name)} notes={THREAD_STYLES.map((s) => s.note)} active={activeStyle === -1 ? null : activeStyle} onPick={onStyle} nowrap />
            <div className="mx-0.5 h-5 w-px bg-border" aria-hidden />
            <ToolButton label={ACTIONS.clearTrails.hint} tipSide="top" onClick={onClearThreads} disabled={!threadCount} className="size-[32px]">
              <Eraser />
            </ToolButton>
          </div>
        ) : null}
        <p className={cn("text-center text-2xs", hintColor)}>
          {baking ? BAKING : recording ? ACTIONS.record.on : threads && threadCount ? `${THREADS.count(threadCount)} · ${FOOTER_HINT}` : FOOTER_HINT}
        </p>
      </div>
    </div>
  );
}
