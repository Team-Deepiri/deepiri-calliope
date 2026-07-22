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

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Strong contrast so meters and ears both register changes. */
function mapGroupCues(cueHand: HandSignals): Record<OrchestraGroupId, number> {
  if (!cueHand.detected) {
    // No cue hand → full balanced bed (piece still audible); raise left to sculpt.
    return { bass: 0.75, mid: 0.75, treble: 0.75 };
  }
  if (cueHand.fist) {
    return { bass: 0.08, mid: 0.08, treble: 0.08 };
  }
  const open = cueHand.openness;
  const h = cueHand.height;
  // Extreme ends: closed+low ≈ bass only; open+high ≈ treble blaze
  return {
    bass: clamp01(0.05 + (1 - h) * 0.95),
    mid: clamp01(0.05 + open * 0.95),
    treble: clamp01(0.05 + h * 0.7 + open * 0.3),
  };
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
  const [scoreId, setScoreId] = useState<string>("moonlight-1");
  const [armed, setArmed] = useState(false);
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
      groupsRef.current = { bass: 0.75, mid: 0.75, treble: 0.75 };
      engineRef.current.setGroupLevels(groupsRef.current);
      armedRef.current = true;
      setArmed(true);
      setScoreId(entry.id);
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
  }, [manifest, scoreId, disarm]);

  /** Apply baton + group cues every frame from landmarks (single source of truth for UI). */
  const onStereoHands = useCallback((left: Landmark[] | null, right: Landmark[] | null) => {
    if (!armedRef.current) return;

    const score = scoreRef.current;
    const baseBpm = score?.bpmHint ?? 54;
    const baton = batonRef.current.update(right, baseBpm);
    engineRef.current.setTempoRate(baton.tempoRate);
    engineRef.current.setDynamics(baton.active ? baton.dynamics : baton.dynamics * 0.45);

    // Cue hand = left landmarks; if missing, fall back to right palm signals so one hand still moves meters.
    const leftSig = deriveHandSignals(left, "Left");
    const rightSig = deriveHandSignals(right, "Right");
    const cueHand = leftSig.detected ? leftSig : rightSig;
    const groups = mapGroupCues(cueHand);
    groupsRef.current = groups;
    engineRef.current.setGroupLevels(groups);

    const now = performance.now();
    if (now - lastUi.current > 40 || baton.beat) {
      lastUi.current = now;
      const dur = engineRef.current.duration || 1;
      setLevels({
        tempoRate: baton.tempoRate,
        dynamics: baton.dynamics,
        bass: groups.bass,
        mid: groups.mid,
        treble: groups.treble,
        tipX: baton.tipX,
        tipY: baton.tipY,
        beat: baton.beat,
        progress: Math.min(1, engineRef.current.currentScoreTime / dur),
      });
      if (!engineRef.current.isRunning && armedRef.current) {
        armedRef.current = false;
        setArmed(false);
      }
    }
  }, []);

  // Keep signature for Gestures wiring; hands path owns control.
  const onStereoFrame = useCallback((_left: HandSignals, _right: HandSignals) => {
    /* group + baton applied in onStereoHands */
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
