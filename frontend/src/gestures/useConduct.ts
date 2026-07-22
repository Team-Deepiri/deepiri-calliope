import { useCallback, useEffect, useRef, useState } from "react";
import type { HandSignals, Landmark } from "./deriveSignals";
import { EMPTY_SIGNALS } from "./deriveSignals";
import { PoseTriggerEngine } from "./detectPoses";
import {
  CONDUCT_PRESETS,
  GENERATED_STEMS,
  drivenStemsFromLevels,
  mapConductControls,
  sectionFromSwipe,
  type ConductDriven,
  type ConductLevels,
  type ConductPreset,
  type ConductSection,
} from "./conductMap";
import { ConductEngine, createDecodeContext, decodeStemBuffer } from "./conductEngine";

const base = (import.meta.env.VITE_API_BASE ?? "").trim();

export type ConductProgress = Partial<
  Record<"drums" | "chords" | "melody", "pending" | "ok" | "error">
>;

const EMPTY_LEVELS: ConductLevels = {
  master: 0,
  drums: 0,
  chords: 0,
  melody: 0,
  energy: 0,
  brightness: 0.45,
};

const EMPTY_DRIVEN: ConductDriven = {
  drums: false,
  chords: false,
  melody: false,
  energy: false,
};

async function generateStem(
  preset: ConductPreset,
  kind: "drums" | "chords" | "melody",
  signal: AbortSignal,
): Promise<void> {
  const body = {
    prompt: preset.prompt,
    bpm: preset.bpm,
    key: preset.key,
    genre: preset.genre,
    duration: preset.duration,
  };
  const r = await fetch(`${base}/v1/ai-generate/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok) throw new Error(await r.text());
}

async function downloadStem(
  kind: "drums" | "chords" | "melody",
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  const url = `${base}/v1/ai-generate/download/${kind}?t=${Date.now()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Download ${kind} failed (${res.status})`);
  return res.arrayBuffer();
}

export function useConduct(enabled: boolean) {
  const engineRef = useRef(new ConductEngine());
  const swipeEngineRef = useRef(new PoseTriggerEngine(9999, 800, 240, 0.16));
  const abortRef = useRef<AbortController | null>(null);
  const armedRef = useRef(false);
  const sectionRef = useRef<ConductSection>("verse");
  const levelsRef = useRef<ConductLevels>({ ...EMPTY_LEVELS });
  const lastUiRef = useRef(0);

  const [presetId, setPresetId] = useState(CONDUCT_PRESETS[0].id);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ConductProgress>({});
  const [section, setSection] = useState<ConductSection>("verse");
  const [levels, setLevels] = useState<ConductLevels>({ ...EMPTY_LEVELS });
  const [driven, setDriven] = useState<ConductDriven>({ ...EMPTY_DRIVEN });
  const [beatPulse, setBeatPulse] = useState(0);
  const [sectionFlash, setSectionFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = CONDUCT_PRESETS.find((p) => p.id === presetId) ?? CONDUCT_PRESETS[0];

  const disarm = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    engineRef.current.disarm();
    swipeEngineRef.current.reset();
    armedRef.current = false;
    setArmed(false);
    setBusy(false);
    setProgress({});
    sectionRef.current = "verse";
    setSection("verse");
    levelsRef.current = { ...EMPTY_LEVELS };
    setLevels(levelsRef.current);
    setDriven({ ...EMPTY_DRIVEN });
    setBeatPulse(0);
    setSectionFlash(false);
  }, []);

  useEffect(() => {
    if (!enabled) disarm();
  }, [enabled, disarm]);

  useEffect(() => () => disarm(), [disarm]);

  const arm = useCallback(async () => {
    setError(null);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    engineRef.current.disarm();
    armedRef.current = false;
    setArmed(false);
    setBusy(true);
    setProgress({ drums: "pending", chords: "pending", melody: "pending" });
    sectionRef.current = "verse";
    setSection("verse");
    setSectionFlash(false);

    try {
      await Promise.all(
        GENERATED_STEMS.map(async (kind) => {
          try {
            await generateStem(preset, kind, ac.signal);
            if (ac.signal.aborted) return;
            setProgress((p) => ({ ...p, [kind]: "ok" }));
          } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") throw e;
            setProgress((p) => ({ ...p, [kind]: "error" }));
            throw e;
          }
        }),
      );
      if (ac.signal.aborted) return;

      const decodeCtx = createDecodeContext();
      const buffers = {} as Record<"drums" | "chords" | "melody", AudioBuffer>;
      for (const kind of GENERATED_STEMS) {
        const data = await downloadStem(kind, ac.signal);
        buffers[kind] = await decodeStemBuffer(decodeCtx, data);
      }
      try {
        void decodeCtx.close();
      } catch {
        /* ignore */
      }

      if (ac.signal.aborted) return;

      await engineRef.current.arm(buffers, preset.bpm);
      armedRef.current = true;
      setArmed(true);
      const initial = mapConductControls(
        { ...EMPTY_SIGNALS, label: "Left" },
        { ...EMPTY_SIGNALS, label: "Right" },
        sectionRef.current,
      );
      levelsRef.current = initial;
      setLevels(initial);
      setDriven(drivenStemsFromLevels(initial));
      engineRef.current.apply(initial);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      engineRef.current.disarm();
      armedRef.current = false;
      setArmed(false);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abortRef.current === ac) {
        setBusy(false);
      }
    }
  }, [preset]);

  const onStereoFrame = useCallback((left: HandSignals, right: HandSignals) => {
    if (!armedRef.current) return;
    const next = mapConductControls(left, right, sectionRef.current);
    levelsRef.current = next;
    engineRef.current.apply(next);
    const now = performance.now();
    if (now - lastUiRef.current > 50) {
      lastUiRef.current = now;
      setLevels(next);
      setDriven(drivenStemsFromLevels(next));
      setBeatPulse(engineRef.current.beatPulse(now));
    }
  }, []);

  const onStereoHands = useCallback((left: Landmark[] | null, right: Landmark[] | null) => {
    if (!armedRef.current) return;
    const poses = swipeEngineRef.current.updateHands([left, right]);
    for (const pose of poses) {
      if (pose !== "swipe_left" && pose !== "swipe_right") continue;
      const next = sectionFromSwipe(sectionRef.current, pose);
      if (next === sectionRef.current) continue;
      sectionRef.current = next;
      setSection(next);
      setSectionFlash(true);
      window.setTimeout(() => setSectionFlash(false), 420);
    }
  }, []);

  return {
    presets: CONDUCT_PRESETS,
    presetId,
    setPresetId,
    preset,
    armed,
    busy,
    progress,
    section,
    levels,
    driven,
    beatPulse,
    sectionFlash,
    error,
    arm,
    reload: arm,
    disarm,
    onStereoFrame,
    onStereoHands,
  };
}
