import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasControls } from "@/components/ControlPanel";
import { Engine } from "@/sim/engine";
import type { Stroke } from "@/sim/field";
import { cn } from "@/lib/utils";
import { DEFAULTS, PRESETS, THREAD_STYLES, type Params, type ViewParams } from "@/params";

/** ?still turns auto-rotate off at load, for recording or screenshots. */
const still = () => new URLSearchParams(window.location.search).has("still");
const start = (): Params => ({ ...DEFAULTS, ...PRESETS[0].values, autoRotate: false });

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const trails = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<Params>(start);
  const [strokes, setStrokes] = useState<Stroke[]>(() => PRESETS[0].strokes);
  const [threadCount, setThreadCount] = useState(0);
  const [baking, setBaking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [clean, setClean] = useState(false);
  const [presetStrokes, setPresetStrokes] = useState<Stroke[] | null>(PRESETS[0].strokes);
  const canRecord = useMemo(() => Engine.recordingType() !== null, []);

  useEffect(() => {
    try {
      const e = new Engine(canvas.current!, trails.current!, overlay.current!, {
        onStroke: (s) => {
          setStrokes((prev) => [...prev, s]);
          setPresetStrokes(null);
        },
        onThreads: setThreadCount,
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
      quality: params.quality,
    });
  }, [strokes, params.whichPath, params.spacing, params.quality]);

  const update = <K extends keyof Params>(key: K, value: Params[K]) =>
    setParams((prev) => ({ ...prev, [key]: value }));

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
      if (e.key === "h") setClean((c) => !c);
      if (e.key === "Escape") setClean(false);
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

  const download = (blob: Blob, name: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const saveImage = async () => {
    const blob = await engine.current?.capture();
    if (blob) download(blob, `interference-${params.render}.png`);
  };

  const toggleRecord = async () => {
    const e = engine.current;
    if (!e) return;
    if (e.recording) {
      const blob = await e.stopRecording();
      setRecording(false);
      if (blob) download(blob, `interference-${params.render}.${Engine.recordingType()?.ext ?? "webm"}`);
    } else {
      try {
        e.startRecording();
        setRecording(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      <canvas ref={canvas} className="absolute inset-0 size-full" />
      <canvas ref={trails} className="pointer-events-none absolute inset-0 size-full" />
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
        strokeCount={strokes.length}
        threadCount={threadCount}
        baking={baking}
        recording={recording}
        canRecord={canRecord}
        clean={clean}
        activePreset={activePreset}
        onPreset={(i) => {
          setStrokes(PRESETS[i].strokes);
          setPresetStrokes(PRESETS[i].strokes);
          setParams((prev) => ({ ...prev, ...DEFAULTS, ...PRESETS[i].values, autoRotate: prev.autoRotate, quality: prev.quality, tool: prev.tool }));
          engine.current?.clearTrails(true);
        }}
        onStyle={(i) => setParams((prev) => ({ ...prev, ...THREAD_STYLES[i].values }))}
        onUndo={undo}
        onClear={() => {
          setStrokes([]);
          setPresetStrokes(null);
        }}
        onClearThreads={() => {
          engine.current?.clearTrails(true);
          setThreadCount(0);
        }}
        onReset={() => {
          setParams(start());
          setStrokes(PRESETS[0].strokes);
          setPresetStrokes(PRESETS[0].strokes);
          engine.current?.clearTrails(true);
        }}
        onCapture={saveImage}
        onRecord={toggleRecord}
        onClean={setClean}
      />
    </div>
  );
}
