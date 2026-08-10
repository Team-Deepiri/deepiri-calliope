import { useCallback, useEffect, useRef, useState } from "react";
import type { HandSignals, Landmark } from "./deriveSignals";
import { deriveHandSignals } from "./deriveSignals";
import { BatonDetector, type ConductMode } from "./batonDetect";
import {
  PatternConductDetector,
  PATTERN_4_4,
  cloneDefaultTargets,
  type CalibProgress,
  type ConductGrade,
  type PatternBeat,
  type PatternTarget,
} from "./patternConduct";
import {
  clearConductorProfile,
  emptyCalibProgress,
  loadConductorProfile,
  saveConductorProfile,
} from "./conductorProfile";
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
  sync: number;
  phrase: number;
  beatPhase: number;
  cuePhase: number;
  measurePhase: number;
  guideX: number;
  guideY: number;
  bass: number;
  mid: number;
  treble: number;
  progress: number;
  beat: boolean;
  pulse: boolean;
  tipX: number;
  tipY: number;
  wristX: number;
  wristY: number;
  nextBeat: PatternBeat;
  targets: PatternTarget[];
  pathEdges: Array<[PatternBeat, PatternBeat]>;
  grade: ConductGrade;
};

export type { ConductMode, ConductGrade, PatternBeat, PatternTarget, CalibProgress };

export type BatonPlayback = "idle" | "playing" | "paused" | "ended";

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function emptyGrade(): ConductGrade {
  return {
    score: 0,
    letter: "—",
    breakdown: {
      timing: 0.5,
      accuracy: 0.5,
      continuity: 0.5,
      shape: 0.5,
      expression: 0.5,
    },
    coach: "Trace the 4/4 figure: down → left → right → up.",
    frozen: false,
  };
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
  const patternRef = useRef(new PatternConductDetector());
  const scoreRef = useRef<OrchestraScore | null>(null);
  const armedRef = useRef(false);
  const lastUi = useRef(0);
  const levelsTipRef = useRef({ x: 0.5, y: 0.5, wx: 0.5, wy: 0.62 });
  const lastPlaybackRef = useRef<BatonPlayback>("idle");
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
  const [exportBusy, setExportBusy] = useState(false);
  const [hasTake, setHasTake] = useState(false);
  const [conductMode, setConductMode] = useState<ConductMode>("pattern");
  const conductModeRef = useRef<ConductMode>("pattern");
  const lastTakeRef = useRef<Blob | null>(null);
  const [levels, setLevels] = useState<BatonLevels>({
    tempoRate: 1,
    dynamics: 0.55,
    sync: 0.55,
    phrase: 0.45,
    beatPhase: 0,
    cuePhase: 0,
    measurePhase: 0,
    guideX: 0.5,
    guideY: 0.3,
    bass: 0.75,
    mid: 0.75,
    treble: 0.75,
    progress: 0,
    beat: false,
    pulse: false,
    tipX: 0.5,
    tipY: 0.5,
    wristX: 0.5,
    wristY: 0.62,
    nextBeat: 1,
    targets: PATTERN_4_4,
    pathEdges: [
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 1],
    ],
    grade: emptyGrade(),
  });
  const [finalReport, setFinalReport] = useState<ConductGrade | null>(null);
  const [calib, setCalib] = useState<CalibProgress>(() => emptyCalibProgress(false));
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    conductModeRef.current = conductMode;
  }, [conductMode]);

  // Restore personalized figure from localStorage.
  useEffect(() => {
    if (!enabled) return;
    const profile = loadConductorProfile();
    if (profile) {
      patternRef.current.setTargets(profile.targets);
      setHasProfile(true);
      setLevels((prev) => ({ ...prev, targets: profile.targets }));
    } else {
      patternRef.current.setTargets(cloneDefaultTargets());
      setHasProfile(false);
    }
  }, [enabled]);

  const syncPlayback = useCallback(() => {
    const next = playbackFromEngine(engineRef.current);
    if (next === "ended" && lastPlaybackRef.current === "playing") {
      const frozen = patternRef.current.freezeGrade();
      setFinalReport(frozen);
      setLevels((prev) => ({ ...prev, grade: frozen }));
    }
    lastPlaybackRef.current = next;
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

  const stop = useCallback(async () => {
    const engine = engineRef.current;
    if (engine.isCapturing) {
      const blob = await engine.finishCapture();
      if (blob && blob.size > 0) {
        lastTakeRef.current = blob;
        setHasTake(true);
      }
    }
    if (lastPlaybackRef.current === "playing" || lastPlaybackRef.current === "paused") {
      const frozen = patternRef.current.freezeGrade();
      setFinalReport(frozen);
    }
    engine.stopPerformance();
    batonRef.current.reset();
    patternRef.current.reset();
    scoreRef.current = null;
    armedRef.current = false;
    lastPlaybackRef.current = "idle";
    setArmed(false);
    setPlayback("idle");
    setBusy(false);
  }, []);

  const disarm = useCallback(() => {
    void engineRef.current.finishCapture();
    engineRef.current.disarm();
    batonRef.current.reset();
    patternRef.current.reset();
    scoreRef.current = null;
    lastTakeRef.current = null;
    armedRef.current = false;
    lastPlaybackRef.current = "idle";
    setArmed(false);
    setPlayback("idle");
    setBusy(false);
    setHasTake(false);
    setFinalReport(null);
  }, []);

  useEffect(() => {
    if (!enabled) disarm();
  }, [enabled, disarm]);

  useEffect(() => () => disarm(), [disarm]);

  // Keep guide / progress / ended state fresh on every frame while playing.
  useEffect(() => {
    if (playback !== "playing") return;
    let raf = 0;
    const loop = () => {
      const engine = engineRef.current;
      const next = playbackFromEngine(engine);
      if (next !== "playing") {
        if (next === "ended" && lastPlaybackRef.current === "playing") {
          const frozen = patternRef.current.freezeGrade();
          setFinalReport(frozen);
          setLevels((prev) => ({
            ...prev,
            grade: frozen,
            progress: 1,
          }));
        }
        lastPlaybackRef.current = next;
        setPlayback(next);
        if (next === "idle") {
          armedRef.current = false;
          setArmed(false);
        }
        return;
      }

      const dur = engine.duration || 1;
      const score = scoreRef.current;
      const baseBpm = score?.bpmHint ?? 54;
      const peek = patternRef.current.peekGuide(
        engine.currentScoreTime,
        baseBpm,
        true,
      );

      setLevels((prev) => ({
        ...prev,
        progress: Math.min(1, engine.currentScoreTime / dur),
        measurePhase: peek.measurePhase,
        guideX: peek.guideX,
        guideY: peek.guideY,
        beatPhase: peek.beatPhase,
        cuePhase: peek.cuePhase,
        pulse: peek.pulse,
        nextBeat: peek.nextBeat,
        targets: peek.targets,
        pathEdges: peek.pathEdges,
      }));

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
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
        patternRef.current.beginPerformance();
        setFinalReport(null);
        groupsRef.current = { bass: 0.75, mid: 0.75, treble: 0.75 };
        engineRef.current.setGroupLevels(groupsRef.current);
        setScoreIdState(entry.id);
        armedRef.current = true;
        setArmed(true);
        const nextPlay: BatonPlayback = autoplay ? "playing" : "paused";
        lastPlaybackRef.current = nextPlay;
        setPlayback(nextPlay);
        setLevels((prev) => ({
          ...prev,
          bass: 0.75,
          mid: 0.75,
          treble: 0.75,
          progress: 0,
          nextBeat: 1,
          targets: patternRef.current.getTargets(),
          grade: emptyGrade(),
        }));
        setCalib(patternRef.current.getCalibProgress());
      } catch (e) {
        void stop();
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [manifest, stop],
  );

  const play = useCallback(async () => {
    const engine = engineRef.current;
    if (engine.isArmed) {
      if (engine.isEnded) {
        patternRef.current.beginPerformance();
        setFinalReport(null);
        engine.restart();
      } else {
        engine.resume();
      }
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

  const exportTakeToStudio = useCallback(async (): Promise<{
    sessionId: string;
    recordingId: string;
    name: string;
    durationSec: number;
    scoreLabel?: string;
  } | null> => {
    setError(null);
    setExportBusy(true);
    try {
      const engine = engineRef.current;
      if (engine.isPlaying) engine.pause();

      let blob = lastTakeRef.current;
      if (engine.isCapturing) {
        const fresh = await engine.finishCapture();
        if (fresh && fresh.size > 0) {
          blob = fresh;
          lastTakeRef.current = fresh;
          setHasTake(true);
        }
      }
      if (!blob || blob.size === 0) {
        throw new Error("No performance take yet — Play a score first, then Send to Studio.");
      }

      const { encodeBlobToWav } = await import("../audio/wavEncode");
      const { createRecordingSession, uploadRecordingFile } = await import("../api/client");
      const wav = await encodeBlobToWav(blob);
      const scoreLabel =
        manifest?.scores.find((s) => s.id === scoreId)?.label ?? scoreId;
      const name = `Baton — ${scoreLabel}.wav`;
      const session = await createRecordingSession(`Gestures ${new Date().toLocaleTimeString()}`);
      const file = new File([wav], name, { type: "audio/wav" });
      const result = await uploadRecordingFile(session.id, file, "audio");
      return {
        sessionId: session.id,
        recordingId: result.recording_id,
        name,
        durationSec: result.duration_sec,
        scoreLabel,
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setExportBusy(false);
    }
  }, [manifest, scoreId]);

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
      const mode = conductModeRef.current;

      let tempoRate = 1;
      let dynamics = 0.55;
      let sync = 0.55;
      let phrase = 0.45;
      let beat = false;
      let tipX = 0.5;
      let tipY = 0.5;
      let wristX = 0.5;
      let wristY = 0.62;
      let pulse = false;
      let beatPhase = 0;
      let cuePhase = 0;
      let measurePhase = 0;
      let guideX = 0.5;
      let guideY = 0.3;
      let active = false;
      let nextBeat: PatternBeat = 1;
      let targets = PATTERN_4_4;
      let pathEdges: Array<[PatternBeat, PatternBeat]> = [
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 1],
      ];
      let grade = emptyGrade();

      if (mode === "pattern") {
        const pat = patternRef.current.update(right, {
          baseBpm,
          scoreTime: engine.currentScoreTime,
          duration: engine.duration || 1,
          playing: engine.isPlaying,
        });
        tempoRate = pat.tempoRate;
        dynamics = pat.dynamics;
        sync = pat.sync;
        phrase = pat.phrase;
        beat = pat.beat;
        pulse = pat.pulse;
        beatPhase = pat.beatPhase;
        cuePhase = pat.cuePhase;
        measurePhase = pat.measurePhase;
        guideX = pat.guideX;
        guideY = pat.guideY;
        tipX = pat.tipX;
        tipY = pat.tipY;
        wristX = pat.wristX;
        wristY = pat.wristY;
        active = pat.active;
        nextBeat = pat.nextBeat;
        targets = pat.targets;
        pathEdges = pat.pathEdges;
        grade = pat.grade;
        setCalib(pat.calib);
        const fitted = patternRef.current.consumeFittedProfile();
        if (fitted) {
          saveConductorProfile(fitted);
          setHasProfile(true);
        }
      } else {
        const baton = batonRef.current.update(right, {
          baseBpm,
        });
        tempoRate = baton.tempoRate;
        dynamics = baton.dynamics;
        sync = baton.sync;
        phrase = baton.phrase;
        beat = baton.beat;
        tipX = baton.tipX;
        tipY = baton.tipY;
        wristX = baton.wristX;
        wristY = baton.wristY;
        active = baton.active;
      }

      if (engine.isPlaying) {
        engine.setTempoRate(tempoRate);
        engine.setDynamics(active ? dynamics : dynamics * 0.45);
      }

      const leftSig = deriveHandSignals(left, "Left");
      const rightSig = deriveHandSignals(right, "Right");
      const cueHand = leftSig.detected ? leftSig : rightSig;
      const groups = mapGroupCues(cueHand);
      groupsRef.current = groups;
      engine.setGroupLevels(groups);

      const now = performance.now();
      const tipMoved =
        Math.hypot(tipX - levelsTipRef.current.x, tipY - levelsTipRef.current.y) > 0.004 ||
        Math.hypot(wristX - levelsTipRef.current.wx, wristY - levelsTipRef.current.wy) > 0.004;
      if (now - lastUi.current > 16 || beat || pulse || tipMoved) {
        lastUi.current = now;
        levelsTipRef.current = { x: tipX, y: tipY, wx: wristX, wy: wristY };
        const dur = engine.duration || 1;
        const nextPlayback = playbackFromEngine(engine);
        if (nextPlayback === "ended" && lastPlaybackRef.current === "playing") {
          const frozen = patternRef.current.freezeGrade();
          grade = frozen;
          setFinalReport(frozen);
        }
        lastPlaybackRef.current = nextPlayback;
        setPlayback(nextPlayback);
        if (nextPlayback === "idle") {
          armedRef.current = false;
          setArmed(false);
        }
        setLevels({
          tempoRate,
          dynamics,
          sync,
          phrase,
          beatPhase,
          cuePhase,
          measurePhase,
          guideX,
          guideY,
          bass: groups.bass,
          mid: groups.mid,
          treble: groups.treble,
          tipX,
          tipY,
          wristX,
          wristY,
          beat: beat && engine.isPlaying,
          pulse: pulse && engine.isPlaying,
          progress: Math.min(1, engine.currentScoreTime / dur),
          nextBeat,
          targets,
          pathEdges,
          grade,
        });
      }
    },
    [],
  );

  const startCalibration = useCallback(async () => {
    setConductMode("pattern");
    conductModeRef.current = "pattern";
    patternRef.current.startCalibration();
    setCalib(patternRef.current.getCalibProgress());
    setLevels((prev) => ({ ...prev, targets: patternRef.current.getTargets() }));
    const engine = engineRef.current;
    if (engine.isArmed) {
      if (engine.isEnded) {
        patternRef.current.beginPerformance();
        patternRef.current.startCalibration();
        setFinalReport(null);
        engine.restart();
      } else if (!engine.isPlaying) {
        engine.resume();
      }
      syncPlayback();
      setCalib(patternRef.current.getCalibProgress());
      return;
    }
    await loadScore(scoreId, true);
    patternRef.current.startCalibration();
    setCalib(patternRef.current.getCalibProgress());
  }, [loadScore, scoreId, syncPlayback]);

  const cancelCalibration = useCallback(() => {
    patternRef.current.cancelCalibration();
    const profile = loadConductorProfile();
    if (profile) {
      patternRef.current.setTargets(profile.targets);
      setHasProfile(true);
    } else {
      patternRef.current.setTargets(cloneDefaultTargets());
      setHasProfile(false);
    }
    setCalib(emptyCalibProgress(false));
    setLevels((prev) => ({ ...prev, targets: patternRef.current.getTargets() }));
  }, []);

  const resetConductorProfile = useCallback(() => {
    clearConductorProfile();
    patternRef.current.cancelCalibration();
    patternRef.current.setTargets(cloneDefaultTargets());
    setHasProfile(false);
    setCalib(emptyCalibProgress(false));
    setLevels((prev) => ({ ...prev, targets: cloneDefaultTargets() }));
  }, []);

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
    conductMode,
    setConductMode,
    finalReport,
    calib,
    hasProfile,
    startCalibration,
    cancelCalibration,
    resetConductorProfile,
    play,
    pause,
    togglePlayPause,
    stop,
    exportTakeToStudio,
    hasTake,
    exportBusy,
    /** @deprecated prefer play() */
    arm: play,
    disarm,
    onStereoFrame,
    onStereoHands,
  };
}
