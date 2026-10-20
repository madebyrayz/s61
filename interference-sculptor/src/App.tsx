import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasControls } from "@/components/ControlPanel";
import { Engine } from "@/sim/engine";
import type { Stroke } from "@/sim/field";
import { cn } from "@/lib/utils";
import { DEFAULTS, MAX_GENERATIONS, PRESETS, type Params, type ViewParams } from "@/params";

/** Pause between generations while play is running. */
const STEP_MS = 900;

/** ?still turns auto-rotate off at load, for recording or screenshots. */
const still = () => new URLSearchParams(window.location.search).has("still");
const start = (): Params => ({ ...DEFAULTS, ...PRESETS[0].values, autoRotate: false });

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<Params>(start);
  const [strokes, setStrokes] = useState<Stroke[]>(() => PRESETS[0].strokes);
  const [counts, setCounts] = useState<number[]>([]);
  const [baking, setBaking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [presetStrokes, setPresetStrokes] = useState<Stroke[] | null>(PRESETS[0].strokes);
  const playTarget = useRef(0);

  useEffect(() => {
    try {
      const e = new Engine(canvas.current!, overlay.current!, {
        onStroke: (s) => {
          setStrokes((prev) => [...prev, s]);
          setPresetStrokes(null);
        },
        onCounts: setCounts,
        onBaking: setBaking,
      });
      engine.current = e;
      if (still()) (window as unknown as { engine: Engine }).engine = e;
      return () => {
        e.dispose();
        engine.current = null;
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const view: ViewParams = params;
  useEffect(() => {
    engine.current?.setView(view);
  }, [view]);

  useEffect(() => {
    engine.current?.setField({
      strokes,
      whichPath: params.whichPath,
      spacing: params.spacing,
      generations: params.generations,
      quality: params.quality,
    });
  }, [strokes, params.whichPath, params.spacing, params.generations, params.quality]);

  const update = <K extends keyof Params>(key: K, value: Params[K]) =>
    setParams((prev) => ({ ...prev, [key]: value }));

  /* -- Play: drop to zero, then climb one generation at a time. -- */
  const play = () => {
    playTarget.current = Math.max(1, params.generations || MAX_GENERATIONS);
    setParams((prev) => ({ ...prev, generations: 0 }));
    setPlaying(true);
  };
  useEffect(() => {
    if (!playing) return;
    if (params.generations >= playTarget.current) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setParams((prev) => ({ ...prev, generations: prev.generations + 1 })), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, params.generations]);
  const stop = () => setPlaying(false);

  const undo = () => {
    setStrokes((prev) => prev.slice(0, -1));
    setPresetStrokes(null);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]");
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "d") setParams((prev) => ({ ...prev, tool: "draw" }));
      if (e.key === "o") setParams((prev) => ({ ...prev, tool: "orbit" }));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  /** A preset counts as active while its strokes are untouched and its settings unchanged. */
  const activePreset = useMemo(() => {
    const i = PRESETS.findIndex(
      (preset) =>
        preset.strokes === presetStrokes &&
        (Object.keys(preset.values) as (keyof Params)[]).every((k) => params[k] === preset.values[k]),
    );
    return i === -1 ? null : i;
  }, [params, presetStrokes]);

  const saveImage = async () => {
    const blob = await engine.current?.capture();
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `interference-${params.render}-g${params.generations}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <canvas ref={canvas} className="absolute inset-0 size-full" />
      <canvas
        ref={overlay}
        className={cn("absolute inset-0 size-full", params.tool === "draw" ? "cursor-crosshair" : "cursor-grab")}
      />

      {error ? (
        <p className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-muted-foreground">{error}</p>
      ) : null}

      <CanvasControls
        params={params}
        update={update}
        counts={counts}
        strokeCount={strokes.length}
        playing={playing}
        baking={baking}
        activePreset={activePreset}
        onPlay={play}
        onStop={stop}
        onPreset={(i) => {
          stop();
          setStrokes(PRESETS[i].strokes);
          setPresetStrokes(PRESETS[i].strokes);
          setParams((prev) => ({ ...prev, ...DEFAULTS, ...PRESETS[i].values, autoRotate: prev.autoRotate, quality: prev.quality, tool: prev.tool }));
        }}
        onUndo={undo}
        onClear={() => {
          setStrokes([]);
          setPresetStrokes(null);
        }}
        onReset={() => {
          stop();
          setParams(start());
          setStrokes(PRESETS[0].strokes);
          setPresetStrokes(PRESETS[0].strokes);
        }}
        onCapture={saveImage}
      />
    </div>
  );
}
