import { useCallback, useEffect, useRef, useState } from "react";
import type { Landmark } from "./deriveSignals";
import { PoseTriggerEngine, type PoseId } from "./detectPoses";

const base = (import.meta.env.VITE_API_BASE ?? "").trim();

export type ComposeKind = "drums" | "melody" | "chords" | "full";

export type ComposeEvent = {
  id: string;
  at: number;
  pose: PoseId;
  kind: ComposeKind;
  status: "pending" | "ok" | "error";
  detail: string;
};

const POSE_TO_KIND: Record<PoseId, ComposeKind> = {
  thumbs_up: "drums",
  open_palm: "melody",
  swipe_right: "full",
  swipe_left: "chords",
};

const DURATION_BARS: Record<ComposeKind, number> = {
  drums: 2,
  melody: 2,
  chords: 2,
  full: 2,
};

type Layer = {
  source: AudioBufferSourceNode;
  gain: GainNode;
};

let playbackCtx: AudioContext | null = null;
/** One audible layer per composition kind — different kinds stack. */
const layers = new Map<ComposeKind, Layer>();
/** In-flight generate/play jobs, keyed by kind so other kinds keep running. */
const jobs = new Map<ComposeKind, AbortController>();
let onPlayingChange: ((playing: boolean) => void) | null = null;

function notifyPlaying(): void {
  onPlayingChange?.(layers.size > 0);
}

function ensureCtx(): AudioContext {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!playbackCtx || playbackCtx.state === "closed") {
    playbackCtx = new Ctx();
  }
  return playbackCtx;
}

function stopLayer(kind: ComposeKind): void {
  const layer = layers.get(kind);
  if (!layer) return;
  layers.delete(kind);
  try {
    layer.source.onended = null;
    layer.source.stop();
  } catch {
    /* already stopped */
  }
  try {
    layer.source.disconnect();
    layer.gain.disconnect();
  } catch {
    /* ignore */
  }
  notifyPlaying();
}

function stopAllPlayback(): void {
  for (const kind of [...layers.keys()]) {
    const layer = layers.get(kind);
    if (!layer) continue;
    layers.delete(kind);
    try {
      layer.source.onended = null;
      layer.source.stop();
    } catch {
      /* ignore */
    }
    try {
      layer.source.disconnect();
      layer.gain.disconnect();
    } catch {
      /* ignore */
    }
  }
  notifyPlaying();
}

function abortJob(kind: ComposeKind): void {
  const ac = jobs.get(kind);
  if (ac) {
    ac.abort();
    jobs.delete(kind);
  }
}

function abortAllJobs(): void {
  for (const ac of jobs.values()) ac.abort();
  jobs.clear();
}

async function generateKind(kind: ComposeKind, signal: AbortSignal): Promise<void> {
  const body = {
    prompt: "gesture composition trigger",
    bpm: 132,
    key: "C",
    genre: "minor",
    duration: DURATION_BARS[kind],
  };
  const r = await fetch(`${base}/v1/ai-generate/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok) throw new Error(await r.text());
}

async function playLayer(
  kind: ComposeKind,
  signal: AbortSignal,
): Promise<void> {
  const url = `${base}/v1/ai-generate/download/${kind}?t=${Date.now()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const data = await res.arrayBuffer();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  const ctx = ensureCtx();
  if (ctx.state === "suspended") await ctx.resume();

  // Replace only this kind — other layers keep playing.
  stopLayer(kind);

  const buffer = await ctx.decodeAudioData(data.slice(0));
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  const gain = ctx.createGain();
  // Duck a bit when stacking so combined layers don't clip as hard
  gain.gain.value = 0.7;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(ctx.destination);

  layers.set(kind, { source, gain });
  notifyPlaying();

  await new Promise<void>((resolve) => {
    source.onended = () => {
      if (layers.get(kind)?.source === source) {
        layers.delete(kind);
        notifyPlaying();
      }
      resolve();
    };
    try {
      source.start();
    } catch {
      layers.delete(kind);
      notifyPlaying();
      resolve();
    }
  });
}

export function useCompositionTriggers(enabled: boolean) {
  const engineRef = useRef(new PoseTriggerEngine(260, 700, 240, 0.16));
  const pendingRef = useRef(0);
  const [events, setEvents] = useState<ComposeEvent[]>([]);
  const [lastPose, setLastPose] = useState<PoseId | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLayers, setActiveLayers] = useState<ComposeKind[]>([]);

  const syncLayers = useCallback(() => {
    setActiveLayers([...layers.keys()]);
  }, []);

  useEffect(() => {
    onPlayingChange = (isPlaying) => {
      setPlaying(isPlaying);
      syncLayers();
    };
    return () => {
      onPlayingChange = null;
    };
  }, [syncLayers]);

  const stop = useCallback(() => {
    abortAllJobs();
    stopAllPlayback();
    pendingRef.current = 0;
    setBusy(false);
    setPlaying(false);
    setActiveLayers([]);
  }, []);

  useEffect(() => {
    if (!enabled) {
      engineRef.current.reset();
      stop();
    }
  }, [enabled, stop]);

  useEffect(() => () => stop(), [stop]);

  const pushEvent = useCallback((ev: ComposeEvent) => {
    setEvents((prev) => [ev, ...prev].slice(0, 10));
  }, []);

  const runPose = useCallback(
    (pose: PoseId) => {
      const kind = POSE_TO_KIND[pose];
      // Only cancel/replace the same kind — other hands' layers keep going.
      abortJob(kind);
      stopLayer(kind);
      syncLayers();

      const ac = new AbortController();
      jobs.set(kind, ac);

      const id = `${Date.now()}-${pose}-${kind}`;
      setLastPose(pose);
      setError(null);
      pendingRef.current += 1;
      setBusy(true);
      pushEvent({
        id,
        at: Date.now(),
        pose,
        kind,
        status: "pending",
        detail: `Generating ${kind}…`,
      });

      void (async () => {
        try {
          await generateKind(kind, ac.signal);
          if (ac.signal.aborted) return;
          setEvents((prev) =>
            prev.map((e) =>
              e.id === id ? { ...e, status: "pending", detail: `Playing ${kind}…` } : e,
            ),
          );
          await playLayer(kind, ac.signal);
          if (ac.signal.aborted) return;
          setEvents((prev) =>
            prev.map((e) =>
              e.id === id ? { ...e, status: "ok", detail: `Layered ${kind}` } : e,
            ),
          );
          syncLayers();
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") {
            setEvents((prev) =>
              prev.map((ev) =>
                ev.id === id ? { ...ev, status: "ok", detail: "Replaced" } : ev,
              ),
            );
            return;
          }
          const detail = e instanceof Error ? e.message : String(e);
          setError(detail);
          setEvents((prev) =>
            prev.map((ev) => (ev.id === id ? { ...ev, status: "error", detail } : ev)),
          );
        } finally {
          if (jobs.get(kind) === ac) jobs.delete(kind);
          pendingRef.current = Math.max(0, pendingRef.current - 1);
          setBusy(pendingRef.current > 0 || jobs.size > 0);
          syncLayers();
        }
      })();
    },
    [pushEvent, syncLayers],
  );

  /** Stable Left/Right landmark slots from the tracker. */
  const onStereoHands = useCallback(
    (left: Landmark[] | null, right: Landmark[] | null) => {
      if (!enabled) return;
      const poses = engineRef.current.updateHands([left, right]);
      for (const pose of poses) {
        runPose(pose);
      }
    },
    [enabled, runPose],
  );

  /** Back-compat: unordered hands list (less stable). */
  const onHands = useCallback(
    (hands: Landmark[][]) => {
      if (!enabled) return;
      const poses = engineRef.current.updateHands(hands.slice(0, 2));
      for (const pose of poses) {
        runPose(pose);
      }
    },
    [enabled, runPose],
  );

  return {
    onHands,
    onStereoHands,
    events,
    lastPose,
    busy,
    playing,
    activeLayers,
    error,
    stop,
  };
}
