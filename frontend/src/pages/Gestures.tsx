import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Hand, Radio, Sparkles, Square, Volume2, VolumeX, Video, Wand2 } from "lucide-react";
import { Link } from "react-router-dom";
import { CameraStage } from "../components/gestures/CameraStage";
import { useHandTracker } from "../gestures/useHandTracker";
import { useGestureSynth } from "../gestures/useGestureSynth";
import { useCompositionTriggers } from "../gestures/useCompositionTriggers";
import { POSE_VOCAB } from "../gestures/detectPoses";
import type { HandSignals } from "../gestures/deriveSignals";
import { signalsToAmp } from "../gestures/gestureSynth";
import "../styles/gestures.css";

function Meter({ label, value, accent }: { label: string; value: number; accent: string }) {
  const pct = Math.round(clamp01(value) * 100);
  return (
    <div className="gestures-meter">
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
            className={
              "gestures-voice-dot" + (sounding ? " gestures-voice-dot--on" : "")
            }
            style={sounding ? { background: accent, boxShadow: `0 0 8px ${accent}` } : undefined}
            title={sounding ? "Voice active" : "Silent"}
          />
        </div>
        <small>
          {!hand.detected && "not in frame"}
          {hand.detected && hand.fist && "fist mute"}
          {hand.detected && !hand.fist && (sounding ? `${timbre} · ${panHint}` : `${timbre} · open hand to hear`)}
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

export function Gestures() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [composeArmed, setComposeArmed] = useState(false);
  const {
    onStereoHands,
    events,
    lastPose,
    busy: composeBusy,
    playing: composePlaying,
    activeLayers,
    error: composeError,
    stop: stopComposition,
  } = useCompositionTriggers(composeArmed);

  const instrumentMuted = composeBusy || composePlaying;
  const { armed, error: audioError, arm, disarm, onFrame } = useGestureSynth(instrumentMuted);

  const { status, error, left, right, fps, start, stop } = useHandTracker({
    videoRef,
    canvasRef,
    onStereoHands,
    onStereoFrame: onFrame,
  });

  const live = status === "running" || status === "starting";
  const handCount = (left.detected ? 1 : 0) + (right.detected ? 1 : 0);
  const instrumentLive = armed && !instrumentMuted;
  const leftAmp = signalsToAmp(left);
  const rightAmp = signalsToAmp(right);
  const bothSounding = instrumentLive && leftAmp > 0.05 && rightAmp > 0.05;

  useEffect(() => {
    if (status !== "running" && armed) {
      disarm();
    }
    if (status !== "running" && composeArmed) {
      setComposeArmed(false);
    }
  }, [status, armed, disarm, composeArmed]);

  function handleStopCamera() {
    disarm();
    setComposeArmed(false);
    stopComposition();
    stop();
  }

  function handleArmSound() {
    setComposeArmed(false);
    stopComposition();
    void arm();
  }

  function handleArmComposition() {
    disarm();
    setComposeArmed(true);
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="gradient-strip" style={{ maxWidth: 200, marginBottom: "1rem" }} />
      <h1 className="section-title">Gestures</h1>
      <p className="lead mt-sm">
        Two-hand performance surface: <strong>left + right voices play together</strong> (stereo).
        Switch to composition mode for pose-triggered clips — modes never overlap.
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
                  {bothSounding && " · both voices"}
                  {instrumentLive && !bothSounding && handCount === 2 && " · open both hands"}
                </>
              )}
              {status === "error" && "Error"}
              {composeBusy && " · generating…"}
              {composePlaying && !composeBusy && " · playing…"}
            </span>
            <Link to="/studio" className="btn-modern btn-ghost" style={{ textDecoration: "none", marginLeft: "auto" }}>
              Open Studio
            </Link>
          </div>
          {error && <p className="gestures-error">{error}</p>}

          <div className="gestures-vocab mt-lg">
            <div className="gestures-signals-head">
              <Wand2 size={18} />
              <div>
                <div className="field-label" style={{ marginBottom: 0 }}>
                  Composition vocabulary
                </div>
                <small className="gestures-muted">
                  Each hand can fire a different pose at the same time — layers stack (drums + melody, etc.).
                  Repeating the same pose replaces that layer only.
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
            <div className="gestures-audio__actions" style={{ marginTop: "0.75rem" }}>
              {!composeArmed ? (
                <button
                  type="button"
                  className="btn-modern btn-primary"
                  onClick={handleArmComposition}
                  disabled={status !== "running"}
                >
                  <Sparkles size={18} />
                  Arm composition
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-modern btn-ghost"
                  onClick={() => {
                    setComposeArmed(false);
                    stopComposition();
                  }}
                >
                  Disarm composition
                </button>
              )}
              <span className={"gestures-audio__badge" + (composeArmed ? " gestures-audio__badge--on" : "")}>
                {composeArmed ? "listening" : "off"}
              </span>
              {activeLayers.length > 0 && (
                <span className="gestures-layers-badge">
                  layers: {activeLayers.join(" + ")}
                </span>
              )}
            </div>
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
        </div>

        <div className="glass-panel gestures-panel stack" style={{ padding: "1.25rem" }}>
          <div className="gestures-signals-head">
            <Hand size={18} />
            <div>
              <div className="field-label" style={{ marginBottom: 0 }}>
                Dual-hand instrument
              </div>
              <small className="gestures-muted">
                Both voices are independent and mix in stereo. Green dots = that voice is sounding.
                {instrumentMuted && armed ? " Muted while composition plays." : ""}
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
              {bothSounding ? "playing together" : handCount < 2 ? "show both hands" : "spread / open fingers"}
            </span>
            <span className={right.detected ? "is-on" : ""}>R {right.detected ? "tracked" : "—"}</span>
          </div>

          <div className="gestures-audio">
            <div className="gestures-audio__head">
              <span className="field-label" style={{ marginBottom: 0 }}>
                Audible preview
              </span>
              <span className={"gestures-audio__badge" + (armed ? " gestures-audio__badge--on" : "")}>
                {armed ? (instrumentMuted ? "muted" : "armed") : "disarmed"}
              </span>
            </div>
            <div className="gestures-audio__actions">
              {!armed ? (
                <button
                  type="button"
                  className="btn-modern btn-primary"
                  onClick={handleArmSound}
                  disabled={status !== "running"}
                  title={status !== "running" ? "Start the camera first" : "Arm dual-hand synth (disarms composition)"}
                >
                  <Volume2 size={18} />
                  Arm sound
                </button>
              ) : (
                <button type="button" className="btn-modern btn-ghost" onClick={disarm}>
                  <VolumeX size={18} />
                  Disarm
                </button>
              )}
            </div>
            {audioError && <p className="gestures-error">{audioError}</p>}
            <p className="gestures-muted" style={{ marginTop: "0.35rem" }}>
              Raise a hand for pitch, open the hand for level. Headphones make the L/R split obvious.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
