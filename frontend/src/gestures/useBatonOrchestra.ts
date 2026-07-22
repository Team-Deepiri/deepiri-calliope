import { useCallback, useEffect, useRef, useState } from "react";
import type { HandSignals, Landmark } from "./deriveSignals";
import { deriveHandSignals } from "./deriveSignals";
import { BatonDetector } from "./batonDetect";
import { OrchestraEngine } from "./orchestraEngine";
import {
  loadOrchestraManifest,
  loadOrchestraScore,
  type OrchestraGroupId,
  type OrchestraManifest,
  type OrchestraScore,
} from "./midiScore";

export type BatonLevels = {
  tempoRate: number;
  dynamics: number;
  bass: number;
  mid: number;
  treble: number;
  progress: number;
  beat: boolean;
  tipX: number;
  tipY: number;
};

export type BatonPlayback = "idle" | "playing" | "paused" | "ended";

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Strong contrast so meters and ears both register changes. */
function mapGroupCues(cueHand: HandSignals): Record<OrchestraGroupId, number> {
  if (!cueHand.detected) {
    return { bass: 0.75, mid: 0.75, treble: 0.75 };
  }
  if (cueHand.fist) {
    return { bass: 0.08, mid: 0.08, treble: 0.08 };
  }
  const open = cueHand.openness;
  const h = cueHand.height;
  return {
    bass: clamp01(0.05 + (1 - h) * 0.95),
    mid: clamp01(0.05 + open * 0.95),
    treble: clamp01(0.05 + h * 0.7 + open * 0.3),
  };
}

function playbackFromEngine(engine: OrchestraEngine): BatonPlayback {
  if (!engine.isArmed) return "idle";
  if (engine.isEnded) return "ended";
  if (engine.isPaused) return "paused";
  if (engine.isPlaying) return "playing";
  return "paused";
}

export function useBatonOrchestra(enabled: boolean) {
  const engineRef = useRef(new OrchestraEngine());
  const batonRef = useRef(new BatonDetector());
  const scoreRef = useRef<OrchestraScore | null>(null);
  const armedRef = useRef(false);
  const lastUi = useRef(0);
  const groupsRef = useRef<Record<OrchestraGroupId, number>>({
    bass: 0.75,
    mid: 0.75,
    treble: 0.75,
  });

  const [manifest, setManifest] = useState<OrchestraManifest | null>(null);
  const [scoreId, setScoreIdState] = useState<string>("moonlight-1");
  const [armed, setArmed] = useState(false);
  const [playback, setPlayback] = useState<BatonPlayback>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<BatonLevels>({
    tempoRate: 1,
    dynamics: 0.55,
    bass: 0.75,
    mid: 0.75,
    treble: 0.75,
    progress: 0,
    beat: false,
    tipX: 0.5,
    tipY: 0.5,
  });

  const syncPlayback = useCallback(() => {
    const next = playbackFromEngine(engineRef.current);
    setPlayback(next);
    armedRef.current = next !== "idle";
    setArmed(next !== "idle");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const m = await loadOrchestraManifest();
        if (cancelled) return;
        setManifest(m);
        setScoreIdState(m.defaultId || m.scores[0]?.id || "moonlight-1");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const disarm = useCallback(() => {
    engineRef.current.disarm();
    batonRef.current.reset();
    scoreRef.current = null;
    armedRef.current = false;
    setArmed(false);
    setPlayback("idle");
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!enabled) disarm();
  }, [enabled, disarm]);

  useEffect(() => () => disarm(), [disarm]);

  // Keep progress / ended state fresh even if hands aren't updating the UI path.
  useEffect(() => {
    if (playback !== "playing") return;
    const id = window.setInterval(() => {
      const engine = engineRef.current;
      const next = playbackFromEngine(engine);
      if (next !== "playing") {
        setPlayback(next);
        if (next === "idle") {
          armedRef.current = false;
          setArmed(false);
        }
      }
      const dur = engine.duration || 1;
      setLevels((prev) => ({
        ...prev,
        progress: Math.min(1, engine.currentScoreTime / dur),
      }));
    }, 200);
    return () => window.clearInterval(id);
  }, [playback]);

  const loadScore = useCallback(
    async (id: string, autoplay: boolean) => {
      setError(null);
      setBusy(true);
      try {
        let m = manifest;
        if (!m) {
          m = await loadOrchestraManifest();
          setManifest(m);
        }
        const entry =
          m.scores.find((s) => s.id === id) ??
          m.scores.find((s) => s.id === m.defaultId) ??
          m.scores[0];
        if (!entry) throw new Error("No scores in manifest");

        const score = await loadOrchestraScore(entry);
        scoreRef.current = score;
        await engineRef.current.arm(score, autoplay);
        batonRef.current.reset();
        groupsRef.current = { bass: 0.75, mid: 0.75, treble: 0.75 };
        engineRef.current.setGroupLevels(groupsRef.current);
        setScoreIdState(entry.id);
        armedRef.current = true;
        setArmed(true);
        setPlayback(autoplay ? "playing" : "paused");
        setLevels((prev) => ({
          ...prev,
          bass: 0.75,
          mid: 0.75,
          treble: 0.75,
          progress: 0,
        }));
      } catch (e) {
        disarm();
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [manifest, disarm],
  );

  const play = useCallback(async () => {
    const engine = engineRef.current;
    if (engine.isArmed) {
      if (engine.isEnded) engine.restart();
      else engine.resume();
      syncPlayback();
      return;
    }
    await loadScore(scoreId, true);
  }, [loadScore, scoreId, syncPlayback]);

  const pause = useCallback(() => {
    engineRef.current.pause();
    syncPlayback();
  }, [syncPlayback]);

  const togglePlayPause = useCallback(async () => {
    if (engineRef.current.isPlaying) pause();
    else await play();
  }, [pause, play]);

  /** Select a track; if already in a session, load it and keep playing / start paused matching prior state. */
  const selectScore = useCallback(
    async (id: string) => {
      if (id === scoreId && armedRef.current) return;
      setScoreIdState(id);
      if (!armedRef.current) return;
      const wasPlaying = engineRef.current.isPlaying || engineRef.current.isEnded;
      await loadScore(id, wasPlaying);
    },
    [scoreId, loadScore],
  );

  const setScoreId = useCallback(
    (id: string) => {
      void selectScore(id);
    },
    [selectScore],
  );

  /** Apply baton + group cues every frame from landmarks. */
  const onStereoHands = useCallback(
    (left: Landmark[] | null, right: Landmark[] | null) => {
      if (!armedRef.current) return;

      const engine = engineRef.current;
      const score = scoreRef.current;
      const baseBpm = score?.bpmHint ?? 54;
      const baton = batonRef.current.update(right, baseBpm);

      if (engine.isPlaying) {
        engine.setTempoRate(baton.tempoRate);
        engine.setDynamics(baton.active ? baton.dynamics : baton.dynamics * 0.45);
      }

      const leftSig = deriveHandSignals(left, "Left");
      const rightSig = deriveHandSignals(right, "Right");
      const cueHand = leftSig.detected ? leftSig : rightSig;
      const groups = mapGroupCues(cueHand);
      groupsRef.current = groups;
      engine.setGroupLevels(groups);

      const now = performance.now();
      if (now - lastUi.current > 40 || baton.beat) {
        lastUi.current = now;
        const dur = engine.duration || 1;
        const nextPlayback = playbackFromEngine(engine);
        setPlayback(nextPlayback);
        if (nextPlayback === "idle") {
          armedRef.current = false;
          setArmed(false);
        }
        setLevels({
          tempoRate: baton.tempoRate,
          dynamics: baton.dynamics,
          bass: groups.bass,
          mid: groups.mid,
          treble: groups.treble,
          tipX: baton.tipX,
          tipY: baton.tipY,
          beat: baton.beat && engine.isPlaying,
          progress: Math.min(1, engine.currentScoreTime / dur),
        });
      }
    },
    [],
  );

  const onStereoFrame = useCallback((_left: HandSignals, _right: HandSignals) => {
    /* group + baton applied in onStereoHands */
  }, []);

  return {
    manifest,
    scoreId,
    setScoreId,
    selectScore,
    armed,
    playback,
    busy,
    error,
    levels,
    play,
    pause,
    togglePlayPause,
    /** @deprecated prefer play() */
    arm: play,
    disarm,
    onStereoFrame,
    onStereoHands,
  };
}
