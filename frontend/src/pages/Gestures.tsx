import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Hand,
  Radio,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  Video,
  Wand2,
  Music2,
  Disc3,
} from "lucide-react";
import { Link } from "react-router-dom";
import { CameraStage } from "../components/gestures/CameraStage";
import { useHandTracker } from "../gestures/useHandTracker";
import { useGestureSynth } from "../gestures/useGestureSynth";
import { useCompositionTriggers } from "../gestures/useCompositionTriggers";
import { useConduct } from "../gestures/useConduct";
import { useBatonOrchestra } from "../gestures/useBatonOrchestra";
import { POSE_VOCAB } from "../gestures/detectPoses";
import type { HandSignals, Landmark } from "../gestures/deriveSignals";
import { signalsToAmp } from "../gestures/gestureSynth";
import type { ConductSection } from "../gestures/conductMap";
import "../styles/gestures.css";

type GestureMode = "off" | "jam" | "compose" | "conduct" | "baton";

function Meter({
  label,
  value,
  accent,
  spotlight = false,
}: {
  label: string;
  value: number;
  accent: string;
  spotlight?: boolean;
}) {
  const pct = Math.round(clamp01(value) * 100);
  return (
    <div className={"gestures-meter" + (spotlight ? " gestures-meter--hot" : "")}>
      <div className="gestures-meter__row">
        <span className="gestures-meter__label">{label}</span>
        <span className="gestures-meter__value">{pct}</span>
      </div>
      <div className="gestures-meter__track">
        <div
          className="gestures-meter__fill"
          style={{ width: `${pct}%`, background: accent }}
        />
      </div>
    </div>
  );
}

function HandVoiceCard({
  title,
  accent,
  hand,
  timbre,
  panHint,
  instrumentLive,
}: {
  title: string;
  accent: string;
  hand: HandSignals;
  timbre: string;
  panHint: string;
  instrumentLive: boolean;
}) {
  const amp = signalsToAmp(hand);
  const sounding = instrumentLive && amp > 0.05;
  return (
    <div
      className={
        "gestures-hand-col" +
        (hand.detected ? " gestures-hand-col--live" : "") +
        (sounding ? " gestures-hand-col--sounding" : "")
      }
    >
      <div className="gestures-hand-col__head">
        <div className="gestures-hand-col__title">
          <span style={{ color: accent }}>{title}</span>
          <span
            className={"gestures-voice-dot" + (sounding ? " gestures-voice-dot--on" : "")}
            style={sounding ? { background: accent, boxShadow: `0 0 8px ${accent}` } : undefined}
            title={sounding ? "Voice active" : "Silent"}
          />
        </div>
        <small>
          {!hand.detected && "not in frame"}
          {hand.detected && hand.fist && "fist mute"}
          {hand.detected &&
            !hand.fist &&
            (sounding ? `${timbre} · ${panHint}` : `${timbre} · open hand to hear`)}
        </small>
      </div>
      <Meter label="Pitch" value={hand.height} accent={accent} />
      <Meter label="Level" value={amp} accent={accent} />
      <Meter label="Filter" value={hand.openness} accent={accent} />
    </div>
  );
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

function sectionLabel(section: ConductSection): string {
  if (section === "chorus") return "CHORUS";
  if (section === "break") return "BREAK";
  return "VERSE";
}

export function Gestures() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<GestureMode>("off");

  const composeArmed = mode === "compose";
  const jamArmed = mode === "jam";
  const conductArmed = mode === "conduct";
  const batonArmed = mode === "baton";

  const {
    onStereoHands: onComposeHands,
    events,
    lastPose,
    busy: composeBusy,
    playing: composePlaying,
    activeLayers,
    error: composeError,
    stop: stopComposition,
  } = useCompositionTriggers(composeArmed);

  const instrumentMuted = composeBusy || composePlaying || conductArmed || batonArmed;
  const {
    armed: jamSoundArmed,
    error: audioError,
    arm: armJam,
    disarm: disarmJam,
    onFrame: onJamFrame,
  } = useGestureSynth(instrumentMuted || !jamArmed);

  const {
    presets,
    presetId,
    setPresetId,
    preset,
    armed: conductIsArmed,
    busy: conductBusy,
    progress: conductProgress,
    section,
    levels,
    driven,
    beatPulse,
    sectionFlash,
    error: conductError,
    arm: armConduct,
    reload: reloadConduct,
    disarm: disarmConduct,
    onStereoFrame: onConductFrame,
    onStereoHands: onConductHands,
  } = useConduct(conductArmed);

  const {
    manifest,
    scoreId,
    setScoreId,
    armed: batonIsArmed,
    busy: batonBusy,
    error: batonError,
    levels: batonLevels,
    arm: armBaton,
    disarm: disarmBaton,
    onStereoFrame: onBatonFrame,
    onStereoHands: onBatonHands,
  } = useBatonOrchestra(batonArmed);

  const onStereoHands = useCallback(
    (leftLm: Landmark[] | null, rightLm: Landmark[] | null) => {
      if (mode === "compose") onComposeHands(leftLm, rightLm);
      else if (mode === "conduct") onConductHands(leftLm, rightLm);
      else if (mode === "baton") onBatonHands(leftLm, rightLm);
    },
    [mode, onComposeHands, onConductHands, onBatonHands],
  );

  const onStereoFrame = useCallback(
    (leftSig: HandSignals, rightSig: HandSignals) => {
      if (mode === "jam") onJamFrame(leftSig, rightSig);
      else if (mode === "conduct") onConductFrame(leftSig, rightSig);
      else if (mode === "baton") onBatonFrame(leftSig, rightSig);
    },
    [mode, onJamFrame, onConductFrame, onBatonFrame],
  );

  const { status, error, left, right, fps, start, stop } = useHandTracker({
    videoRef,
    canvasRef,
    onStereoHands,
    onStereoFrame,
  });

  const live = status === "running" || status === "starting";
  const handCount = (left.detected ? 1 : 0) + (right.detected ? 1 : 0);
  const instrumentLive = jamArmed && jamSoundArmed && !instrumentMuted;
  const leftAmp = signalsToAmp(left);
  const rightAmp = signalsToAmp(right);
  const bothSounding = instrumentLive && leftAmp > 0.05 && rightAmp > 0.05;

  useEffect(() => {
    if (status !== "running" && mode !== "off") {
      disarmJam();
      stopComposition();
      disarmConduct();
      disarmBaton();
      setMode("off");
    }
  }, [status, mode, disarmJam, stopComposition, disarmConduct, disarmBaton]);

  function enterMode(next: GestureMode) {
    if (next === mode) return;
    disarmJam();
    stopComposition();
    disarmConduct();
    disarmBaton();
    setMode(next);
  }

  function handleStopCamera() {
    disarmJam();
    stopComposition();
    disarmConduct();
    disarmBaton();
    setMode("off");
    stop();
  }

  async function handleArmJam() {
    enterMode("jam");
    await armJam();
  }

  function handleArmCompose() {
    enterMode("compose");
  }

  async function handleArmConduct() {
    if (mode !== "conduct") {
      enterMode("conduct");
    }
    await armConduct();
  }

  async function handleArmBaton() {
    if (mode !== "baton") {
      enterMode("baton");
    }
    await armBaton();
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="gradient-strip" style={{ maxWidth: 200, marginBottom: "1rem" }} />
      <h1 className="section-title">Gestures</h1>
      <p className="lead mt-sm">
        Two-hand performance surface: <strong>Jam</strong>, <strong>Compose</strong>,{" "}
        <strong>Conduct</strong>, or <strong>Baton</strong> (conduct Moonlight with a fingertip / pencil).
      </p>

      <div className="gestures-layout mt-lg">
        <div className="glass-panel gestures-panel" style={{ padding: "1rem" }}>
          <CameraStage videoRef={videoRef} canvasRef={canvasRef} active={live} />
          <div className="gestures-controls">
            {status !== "running" ? (
              <button
                type="button"
                className="btn-modern btn-primary"
                onClick={() => void start()}
                disabled={status === "starting"}
              >
                <Video size={18} />
                {status === "starting" ? "Starting…" : "Start camera"}
              </button>
            ) : (
              <button type="button" className="btn-modern btn-ghost" onClick={handleStopCamera}>
                <Square size={18} />
                Stop
              </button>
            )}
            <span className="gestures-status">
              <Radio size={14} />
              {status === "idle" && "Idle"}
              {status === "starting" && "Loading MediaPipe…"}
              {status === "running" && (
                <>
                  {fps} fps · {handCount}/2 hands
                  {mode === "jam" && bothSounding && " · both voices"}
                  {mode === "compose" && composeBusy && " · generating…"}
                  {mode === "compose" && composePlaying && !composeBusy && " · playing…"}
                  {mode === "conduct" && conductBusy && " · loading stems…"}
                  {mode === "conduct" && conductIsArmed && !conductBusy && ` · ${sectionLabel(section)}`}
                  {mode === "baton" && batonBusy && " · loading score…"}
                  {mode === "baton" && batonIsArmed && !batonBusy && ` · ${Math.round(batonLevels.tempoRate * 100)}% tempo`}
                </>
              )}
              {status === "error" && "Error"}
            </span>
            <Link to="/studio" className="btn-modern btn-ghost" style={{ textDecoration: "none", marginLeft: "auto" }}>
              Open Studio
            </Link>
          </div>

          <div className="gestures-mode-tabs" role="tablist" aria-label="Gesture mode">
            {(
              [
                { id: "jam" as const, label: "Jam", icon: Volume2 },
                { id: "compose" as const, label: "Compose", icon: Sparkles },
                { id: "conduct" as const, label: "Conduct", icon: Music2 },
                { id: "baton" as const, label: "Baton", icon: Disc3 },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={"gestures-mode-tab" + (active ? " gestures-mode-tab--on" : "")}
                  disabled={status !== "running"}
                  onClick={() => {
                    if (active) return;
                    if (tab.id === "jam") void handleArmJam();
                    else if (tab.id === "compose") handleArmCompose();
                    else if (tab.id === "conduct") void handleArmConduct();
                    else void handleArmBaton();
                  }}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
            {mode !== "off" && (
              <button
                type="button"
                className="gestures-mode-tab gestures-mode-tab--ghost"
                onClick={() => enterMode("off")}
              >
                Off
              </button>
            )}
          </div>

          {error && <p className="gestures-error">{error}</p>}

          {mode === "compose" && (
            <div className="gestures-vocab mt-lg">
              <div className="gestures-signals-head">
                <Wand2 size={18} />
                <div>
                  <div className="field-label" style={{ marginBottom: 0 }}>
                    Composition vocabulary
                  </div>
                  <small className="gestures-muted">
                    Each hand can fire a different pose — layers stack. Same pose replaces that layer only.
                  </small>
                </div>
              </div>
              <ul className="gestures-vocab__list">
                {POSE_VOCAB.map((row) => (
                  <li
                    key={row.id}
                    className={
                      "gestures-vocab__item" + (lastPose === row.id ? " gestures-vocab__item--flash" : "")
                    }
                  >
                    <strong>{row.label}</strong>
                    <span>{row.action}</span>
                    <small>{row.hint}</small>
                  </li>
                ))}
              </ul>
              {activeLayers.length > 0 && (
                <span className="gestures-layers-badge" style={{ display: "inline-block", marginTop: "0.75rem" }}>
                  layers: {activeLayers.join(" + ")}
                </span>
              )}
              {composeError && <p className="gestures-error">{composeError}</p>}
              {events.length > 0 && (
                <ul className="gestures-events">
                  {events.map((ev) => (
                    <li key={ev.id} className={`gestures-events__item gestures-events__item--${ev.status}`}>
                      <span>{ev.pose.replace("_", " ")}</span>
                      <span>{ev.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {mode === "conduct" && (
            <div className="gestures-vocab mt-lg">
              <div className="gestures-signals-head">
                <Music2 size={18} />
                <div>
                  <div className="field-label" style={{ marginBottom: 0 }}>
                    Conduct vocabulary
                  </div>
                  <small className="gestures-muted">
                    Stems loop while you ride the faders. Swipes flip section energy.
                  </small>
                </div>
              </div>
              <ul className="gestures-vocab__list">
                <li className="gestures-vocab__item">
                  <strong>Left height</strong>
                  <span>Master intensity</span>
                  <small>Raise for louder bed</small>
                </li>
                <li className="gestures-vocab__item">
                  <strong>Left openness</strong>
                  <span>Drums</span>
                  <small>Spread fingers to bring drums in</small>
                </li>
                <li className="gestures-vocab__item">
                  <strong>Right openness</strong>
                  <span>Chords</span>
                  <small>Spread for harmony</small>
                </li>
                <li className="gestures-vocab__item">
                  <strong>Right height</strong>
                  <span>Melody</span>
                  <small>Raise for lead</small>
                </li>
                <li className="gestures-vocab__item">
                  <strong>Swipe right</strong>
                  <span>Chorus toggle</span>
                  <small>Verse ↔ chorus / DROP + energy</small>
                </li>
                <li className="gestures-vocab__item">
                  <strong>Swipe left</strong>
                  <span>Break toggle</span>
                  <small>Verse ↔ break (drums out)</small>
                </li>
              </ul>
            </div>
          )}
          {mode === "baton" && (
            <div className="gestures-vocab mt-lg">
              <div className="gestures-signals-head">
                <Disc3 size={18} />
                <div>
                  <div className="field-label" style={{ marginBottom: 0 }}>
                    Baton vocabulary
                  </div>
                  <small className="gestures-muted">
                    Wave a fingertip or pencil as the stick. Left hand balances the orchestra bands.
                  </small>
                </div>
              </div>
              <ul className="gestures-vocab__list">
                <li className="gestures-vocab__item">
                  <strong>Right tip beats</strong>
                  <span>Tempo</span>
                  <small>Faster strokes → faster score</small>
                </li>
                <li className="gestures-vocab__item">
                  <strong>Stroke size</strong>
                  <span>Dynamics</span>
                  <small>Bigger gestures → louder</small>
                </li>
                <li className="gestures-vocab__item">
                  <strong>Left openness</strong>
                  <span>Mid / treble</span>
                  <small>Open to bring upper voices in</small>
                </li>
                <li className="gestures-vocab__item">
                  <strong>Left height</strong>
                  <span>Bass ↔ treble</span>
                  <small>Low hand favors bass</small>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="glass-panel gestures-panel stack" style={{ padding: "1.25rem" }}>
          {mode === "baton" ? (
            <>
              <div className="gestures-signals-head">
                <Disc3 size={18} />
                <div>
                  <div className="field-label" style={{ marginBottom: 0 }}>
                    Baton orchestra
                  </div>
                  <small className="gestures-muted">
                    {manifest
                      ? `${manifest.piece.title} — ${manifest.piece.composer}`
                      : "Loading repertoire…"}
                  </small>
                </div>
              </div>

              <div
                className={
                  "gestures-section-badge" +
                  (batonIsArmed ? " gestures-section-badge--live" : "") +
                  (batonLevels.beat ? " gestures-section-badge--flash" : "")
                }
                style={
                  batonIsArmed
                    ? { ["--beat-pulse" as string]: String(0.7 + (batonLevels.beat ? 0.35 : 0)) }
                    : undefined
                }
              >
                BATON
                {batonIsArmed && (
                  <span
                    className="gestures-beat-dot"
                    style={{ opacity: batonLevels.beat ? 1 : 0.35 }}
                  />
                )}
              </div>

              <p className="gestures-coach">
                Right hand = baton tempo/dynamics. Left hand height/openness =
                bass / mid / treble (one hand still moves the meters).
              </p>

              <div className="gestures-preset-row">
                {(manifest?.scores ?? []).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={
                      "gestures-preset-chip" + (scoreId === s.id ? " gestures-preset-chip--on" : "")
                    }
                    disabled={batonBusy || batonIsArmed}
                    onClick={() => setScoreId(s.id)}
                  >
                    <strong>{s.label}</strong>
                    <small>{s.bpmHint} BPM hint</small>
                  </button>
                ))}
              </div>

              <Meter label="Tempo rate" value={(batonLevels.tempoRate - 0.55) / 0.9} accent="#f472b6" />
              <Meter label="Dynamics" value={batonLevels.dynamics} accent="var(--primary-500)" />
              <Meter
                label="Bass"
                value={batonLevels.bass}
                accent="#f97316"
                spotlight={batonLevels.bass > 0.55}
              />
              <Meter
                label="Mid"
                value={batonLevels.mid}
                accent="#34d399"
                spotlight={batonLevels.mid > 0.55}
              />
              <Meter
                label="Treble"
                value={batonLevels.treble}
                accent="#818cf8"
                spotlight={batonLevels.treble > 0.55}
              />
              <Meter label="Progress" value={batonLevels.progress} accent="#94a3b8" />

              <div className="gestures-baton-trail" aria-hidden>
                <span
                  className={"gestures-baton-tip" + (batonLevels.beat ? " gestures-baton-tip--beat" : "")}
                  style={{
                    left: `${(1 - batonLevels.tipX) * 100}%`,
                    top: `${batonLevels.tipY * 100}%`,
                  }}
                />
              </div>

              <div className="gestures-audio" style={{ marginTop: "0.75rem" }}>
                <div className="gestures-audio__head">
                  <span className="field-label" style={{ marginBottom: 0 }}>
                    Performance
                  </span>
                  <span
                    className={
                      "gestures-audio__badge" + (batonIsArmed ? " gestures-audio__badge--on" : "")
                    }
                  >
                    {batonBusy ? "loading" : batonIsArmed ? "playing" : "idle"}
                  </span>
                </div>
                <div className="gestures-audio__actions">
                  {!batonIsArmed ? (
                    <button
                      type="button"
                      className="btn-modern btn-primary"
                      onClick={() => void handleArmBaton()}
                      disabled={status !== "running" || batonBusy || !manifest}
                    >
                      <Disc3 size={18} />
                      {batonBusy ? "Loading score…" : "Start"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-modern btn-ghost"
                      onClick={() => {
                        disarmBaton();
                        setMode("off");
                      }}
                    >
                      <VolumeX size={18} />
                      Stop
                    </button>
                  )}
                </div>
                {batonError && <p className="gestures-error">{batonError}</p>}
                <p className="gestures-muted" style={{ marginTop: "0.35rem" }}>
                  MIDI from Mutopia (CC BY-SA 2.5). Hold a pencil if you like — we track the index tip.
                </p>
              </div>
            </>
          ) : mode === "conduct" ? (
            <>
              <div className="gestures-signals-head">
                <Music2 size={18} />
                <div>
                  <div className="field-label" style={{ marginBottom: 0 }}>
                    Conductor
                  </div>
                  <small className="gestures-muted">
                    Pick a preset, load stems, then shape the mix with both hands.
                  </small>
                </div>
              </div>

              <div
                className={
                  "gestures-section-badge" +
                  (section === "chorus" ? " gestures-section-badge--chorus" : "") +
                  (section === "break" ? " gestures-section-badge--break" : "") +
                  (conductIsArmed ? " gestures-section-badge--live" : "") +
                  (sectionFlash ? " gestures-section-badge--flash" : "")
                }
                style={
                  conductIsArmed
                    ? { ["--beat-pulse" as string]: String(0.55 + beatPulse * 0.45) }
                    : undefined
                }
              >
                {sectionLabel(section)}
                {conductIsArmed && (
                  <span className="gestures-beat-dot" style={{ opacity: 0.35 + beatPulse * 0.65 }} />
                )}
              </div>

              <p className="gestures-coach">
                Swipe R chorus · Swipe L break · fists duck · raise / open to ride faders
              </p>

              <div className="gestures-preset-row">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={
                      "gestures-preset-chip" + (presetId === p.id ? " gestures-preset-chip--on" : "")
                    }
                    disabled={conductBusy}
                    onClick={() => setPresetId(p.id)}
                  >
                    <strong>{p.label}</strong>
                    <small>{p.blurb}</small>
                  </button>
                ))}
              </div>

              <Meter label="Master" value={levels.master} accent="var(--primary-500)" />
              <Meter
                label="Drums"
                value={levels.drums}
                accent="#f97316"
                spotlight={driven.drums}
              />
              <Meter
                label="Chords"
                value={levels.chords}
                accent="#34d399"
                spotlight={driven.chords}
              />
              <Meter
                label="Melody"
                value={levels.melody}
                accent="#818cf8"
                spotlight={driven.melody}
              />
              <Meter
                label="Energy"
                value={levels.energy}
                accent="#f472b6"
                spotlight={driven.energy}
              />

              <div className="gestures-audio" style={{ marginTop: "0.75rem" }}>
                <div className="gestures-audio__head">
                  <span className="field-label" style={{ marginBottom: 0 }}>
                    {preset.label} · {preset.bpm} BPM
                  </span>
                  <span
                    className={
                      "gestures-audio__badge" + (conductIsArmed ? " gestures-audio__badge--on" : "")
                    }
                  >
                    {conductBusy ? "loading" : conductIsArmed ? "conducting" : "idle"}
                  </span>
                </div>
                {conductBusy && (
                  <div className="gestures-conduct-progress">
                    {(["drums", "chords", "melody"] as const).map((k) => (
                      <span key={k} data-state={conductProgress[k] ?? "pending"}>
                        {k}: {conductProgress[k] ?? "…"}
                      </span>
                    ))}
                  </div>
                )}
                <div className="gestures-audio__actions">
                  {!conductIsArmed ? (
                    <button
                      type="button"
                      className="btn-modern btn-primary"
                      onClick={() => void handleArmConduct()}
                      disabled={status !== "running" || conductBusy}
                    >
                      <Music2 size={18} />
                      {conductBusy ? "Loading stems…" : "Load & arm"}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn-modern btn-primary"
                        onClick={() => void reloadConduct()}
                        disabled={conductBusy || status !== "running"}
                      >
                        <Music2 size={18} />
                        {conductBusy ? "Reloading…" : "Reload stems"}
                      </button>
                      <button
                        type="button"
                        className="btn-modern btn-ghost"
                        onClick={() => {
                          disarmConduct();
                          setMode("off");
                        }}
                      >
                        <VolumeX size={18} />
                        Disarm
                      </button>
                    </>
                  )}
                </div>
                {conductError && <p className="gestures-error">{conductError}</p>}
                <p className="gestures-muted" style={{ marginTop: "0.35rem" }}>
                  4-bar loops. Chorus lifts an energy layer; break pulls drums. Reload regenerates the
                  current preset without leaving Conduct.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="gestures-signals-head">
                <Hand size={18} />
                <div>
                  <div className="field-label" style={{ marginBottom: 0 }}>
                    Dual-hand instrument
                  </div>
                  <small className="gestures-muted">
                    {mode === "jam"
                      ? "Both voices mix in stereo. Green dots = sounding."
                      : "Switch to Jam to arm the live synth, or Conduct for stem faders."}
                  </small>
                </div>
              </div>

              <div className="gestures-hand-grid">
                <HandVoiceCard
                  title="Left"
                  accent="#34d399"
                  hand={left}
                  timbre="saw"
                  panHint="ear L"
                  instrumentLive={instrumentLive}
                />
                <HandVoiceCard
                  title="Right"
                  accent="#818cf8"
                  hand={right}
                  timbre="tri"
                  panHint="ear R"
                  instrumentLive={instrumentLive}
                />
              </div>

              <div className="gestures-duo-hint">
                <span className={left.detected ? "is-on" : ""}>L {left.detected ? "tracked" : "—"}</span>
                <span className={bothSounding ? "is-on" : ""}>
                  {bothSounding
                    ? "playing together"
                    : handCount < 2
                      ? "show both hands"
                      : mode === "jam"
                        ? "spread / open fingers"
                        : "pick a mode"}
                </span>
                <span className={right.detected ? "is-on" : ""}>R {right.detected ? "tracked" : "—"}</span>
              </div>

              <div className="gestures-audio">
                <div className="gestures-audio__head">
                  <span className="field-label" style={{ marginBottom: 0 }}>
                    Audible preview
                  </span>
                  <span
                    className={
                      "gestures-audio__badge" + (jamSoundArmed && jamArmed ? " gestures-audio__badge--on" : "")
                    }
                  >
                    {jamArmed && jamSoundArmed ? "armed" : "disarmed"}
                  </span>
                </div>
                <div className="gestures-audio__actions">
                  {!(jamArmed && jamSoundArmed) ? (
                    <button
                      type="button"
                      className="btn-modern btn-primary"
                      onClick={() => void handleArmJam()}
                      disabled={status !== "running"}
                    >
                      <Volume2 size={18} />
                      Arm Jam
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-modern btn-ghost"
                      onClick={() => {
                        disarmJam();
                        setMode("off");
                      }}
                    >
                      <VolumeX size={18} />
                      Disarm
                    </button>
                  )}
                </div>
                {audioError && <p className="gestures-error">{audioError}</p>}
                <p className="gestures-muted" style={{ marginTop: "0.35rem" }}>
                  Raise a hand for pitch, open the hand for level.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
