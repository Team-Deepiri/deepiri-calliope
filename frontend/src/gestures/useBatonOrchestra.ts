import { useCallback, useEffect, useRef, useState } from "react";
import type { HandSignals, Landmark } from "./deriveSignals";
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

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function mapLeftCues(left: HandSignals): Record<OrchestraGroupId, number> {
  if (!left.detected || left.fist) {
    return { bass: 0.35, mid: 0.35, treble: 0.35 };
  }
  const open = left.openness;
  const h = left.height;
  return {
    bass: clamp01(0.25 + (1 - h) * 0.75),
    mid: clamp01(0.2 + open * 0.8),
    treble: clamp01(0.15 + h * 0.55 + open * 0.35),
  };
}

export function useBatonOrchestra(enabled: boolean) {
  const engineRef = useRef(new OrchestraEngine());
  const batonRef = useRef(new BatonDetector());
  const scoreRef = useRef<OrchestraScore | null>(null);
  const armedRef = useRef(false);
  const lastUi = useRef(0);

  const [manifest, setManifest] = useState<OrchestraManifest | null>(null);
  const [scoreId, setScoreId] = useState<string>("moonlight-1");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState<BatonLevels>({
    tempoRate: 1,
    dynamics: 0.55,
    bass: 0.7,
    mid: 0.7,
    treble: 0.7,
    progress: 0,
    beat: false,
    tipX: 0.5,
    tipY: 0.5,
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const m = await loadOrchestraManifest();
        if (cancelled) return;
        setManifest(m);
        setScoreId(m.defaultId || m.scores[0]?.id || "moonlight-1");
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
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!enabled) disarm();
  }, [enabled, disarm]);

  useEffect(() => () => disarm(), [disarm]);

  const arm = useCallback(async () => {
    setError(null);
    setBusy(true);
    disarm();

    try {
      let m = manifest;
      if (!m) {
        m = await loadOrchestraManifest();
        setManifest(m);
      }
      const entry =
        m.scores.find((s) => s.id === scoreId) ??
        m.scores.find((s) => s.id === m.defaultId) ??
        m.scores[0];
      if (!entry) throw new Error("No scores in manifest");

      const score = await loadOrchestraScore(entry);
      scoreRef.current = score;
      await engineRef.current.arm(score);
      batonRef.current.reset();
      armedRef.current = true;
      setArmed(true);
      setScoreId(entry.id);
    } catch (e) {
      disarm();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [manifest, scoreId, disarm]);

  const onStereoFrame = useCallback((left: HandSignals, _right: HandSignals) => {
    if (!armedRef.current) return;
    // Right landmarks come via onStereoHands for tip tracking; here apply left cues + progress UI
    const groups = mapLeftCues(left);
    engineRef.current.setGroupLevels(groups);

    const now = performance.now();
    if (now - lastUi.current > 50) {
      lastUi.current = now;
      const dur = engineRef.current.duration || 1;
      setLevels((prev) => ({
        ...prev,
        bass: groups.bass,
        mid: groups.mid,
        treble: groups.treble,
        progress: Math.min(1, engineRef.current.currentScoreTime / dur),
        beat: false,
      }));
      if (!engineRef.current.isRunning && armedRef.current) {
        // Piece finished
        armedRef.current = false;
        setArmed(false);
      }
    }
  }, []);

  const onStereoHands = useCallback((left: Landmark[] | null, right: Landmark[] | null) => {
    if (!armedRef.current) return;
    const score = scoreRef.current;
    const baseBpm = score?.bpmHint ?? 54;
    const baton = batonRef.current.update(right, baseBpm);
    engineRef.current.setTempoRate(baton.tempoRate);
    engineRef.current.setDynamics(baton.active ? baton.dynamics : baton.dynamics * 0.5);

    // Also apply left cues from landmarks-derived path if frame signals lag
    void left;

    const now = performance.now();
    if (now - lastUi.current > 40 || baton.beat) {
      lastUi.current = now;
      setLevels((prev) => ({
        ...prev,
        tempoRate: baton.tempoRate,
        dynamics: baton.dynamics,
        tipX: baton.tipX,
        tipY: baton.tipY,
        beat: baton.beat,
        progress: Math.min(1, engineRef.current.currentScoreTime / (engineRef.current.duration || 1)),
      }));
    }
  }, []);

  return {
    manifest,
    scoreId,
    setScoreId,
    armed,
    busy,
    error,
    levels,
    arm,
    disarm,
    onStereoFrame,
    onStereoHands,
  };
}
