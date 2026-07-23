import { useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Disc3, Hand, Pause, Play, Radio, Square, Upload, Video } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { CameraStage } from "../components/gestures/CameraStage";
import { useHandTracker } from "../gestures/useHandTracker";
import { useBatonOrchestra } from "../gestures/useBatonOrchestra";
import { stashGesturesStudioImport } from "../gestures/studioHandoff";
import type { Landmark } from "../gestures/deriveSignals";
import "../styles/gestures.css";

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

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

export function Gestures() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const {
    manifest,
    scoreId,
    setScoreId,
    armed: batonIsArmed,
    playback: batonPlayback,
    busy: batonBusy,
    error: batonError,
    levels: batonLevels,
    play: playBaton,
    pause: pauseBaton,
    stop: stopBaton,
    disarm: disarmBaton,
    exportTakeToStudio,
    hasTake,
    exportBusy,
    onStereoHands: onBatonHands,
  } = useBatonOrchestra(true);

  const onStereoHands = useCallback(
    (leftLm: Landmark[] | null, rightLm: Landmark[] | null) => {
      onBatonHands(leftLm, rightLm);
    },
    [onBatonHands],
  );

  const { status, error, left, right, fps, start, stop } = useHandTracker({
    videoRef,
    canvasRef,
    onStereoHands,
  });

  const live = status === "running" || status === "starting";
  const handCount = (left.detected ? 1 : 0) + (right.detected ? 1 : 0);
  const cameraReady = status === "running";
  const canSendTake = hasTake || batonIsArmed || batonPlayback === "ended" || batonPlayback === "paused";

  useEffect(() => {
    if (status !== "running") disarmBaton();
  }, [status, disarmBaton]);

  function handleStopCamera() {
    disarmBaton();
    stop();
  }

  async function handlePlayBaton() {
    await playBaton();
  }

  async function handleSendToStudio() {
    const payload = await exportTakeToStudio();
    if (!payload) return;
    stashGesturesStudioImport(payload);
    navigate("/studio");
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="gradient-strip" style={{ maxWidth: 200, marginBottom: "1rem" }} />
      <h1 className="section-title">Gestures</h1>
      <p className="lead mt-sm">
        Conduct a MIDI score with your hands — wave a fingertip or pencil as the baton, shape bass /
        mid / treble with the other hand.
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
                Stop camera
              </button>
            )}
            <span className="gestures-status">
              <Radio size={14} />
              {status === "idle" && "Idle"}
              {status === "starting" && "Loading MediaPipe…"}
              {status === "running" && (
                <>
                  {fps} fps · {handCount}/2 hands
                  {batonBusy && " · loading score…"}
                  {batonPlayback === "playing" &&
                    !batonBusy &&
                    ` · ${Math.round(batonLevels.tempoRate * 100)}% tempo`}
                  {batonPlayback === "paused" && !batonBusy && " · paused"}
                  {batonPlayback === "ended" && !batonBusy && " · ended"}
                </>
              )}
              {status === "error" && "Error"}
            </span>
            <Link to="/studio" className="btn-modern btn-ghost" style={{ textDecoration: "none", marginLeft: "auto" }}>
              Open Studio
            </Link>
          </div>

          {error && <p className="gestures-error">{error}</p>}

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
        </div>

        <div className="glass-panel gestures-panel stack" style={{ padding: "1.25rem" }}>
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
              "gestures-baton-trail" +
              (batonPlayback === "playing" ? " gestures-baton-trail--live" : "")
            }
            aria-hidden
          >
            <span
              className={"gestures-baton-tip" + (batonLevels.beat ? " gestures-baton-tip--beat" : "")}
              style={{
                left: `${(1 - batonLevels.tipX) * 100}%`,
                top: `${batonLevels.tipY * 100}%`,
              }}
            />
          </div>

          <div className="gestures-transport">
            <div className="gestures-transport__actions">
              {batonPlayback === "playing" ? (
                <button
                  type="button"
                  className="gestures-transport__primary"
                  onClick={() => pauseBaton()}
                  disabled={batonBusy}
                >
                  <Pause size={22} />
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  className="gestures-transport__primary"
                  onClick={() => void handlePlayBaton()}
                  disabled={!cameraReady || batonBusy || !manifest}
                >
                  <Play size={22} />
                  {batonBusy
                    ? "Loading…"
                    : batonPlayback === "ended"
                      ? "Replay"
                      : batonPlayback === "paused"
                        ? "Resume"
                        : "Play"}
                </button>
              )}
              {batonIsArmed && (
                <button
                  type="button"
                  className="gestures-transport__stop"
                  onClick={() => void stopBaton()}
                  disabled={batonBusy || exportBusy}
                >
                  <Square size={18} />
                  Stop
                </button>
              )}
              <button
                type="button"
                className="gestures-transport__studio"
                onClick={() => void handleSendToStudio()}
                disabled={!canSendTake || batonBusy || exportBusy}
                title="Upload this conducted take into Studio"
              >
                <Upload size={18} />
                {exportBusy ? "Sending…" : "Send to Studio"}
              </button>
            </div>
            <span
              className={
                "gestures-audio__badge" +
                (batonPlayback === "playing" ? " gestures-audio__badge--on" : "")
              }
            >
              {batonBusy
                ? "loading"
                : batonPlayback === "playing"
                  ? "playing"
                  : batonPlayback === "paused"
                    ? "paused"
                    : batonPlayback === "ended"
                      ? "ended"
                      : "idle"}
            </span>
          </div>

          {batonError && <p className="gestures-error">{batonError}</p>}

          <p className="gestures-coach">
            Start the camera, pick a score, then Play. Right hand = tempo/dynamics; left
            height/openness = bass / mid / treble.
          </p>

          {!cameraReady && (
            <p className="gestures-muted" style={{ marginTop: 0 }}>
              <Hand size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
              Camera required before Play.
            </p>
          )}

          <div className="gestures-preset-row">
            {(manifest?.scores ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                className={
                  "gestures-preset-chip" + (scoreId === s.id ? " gestures-preset-chip--on" : "")
                }
                disabled={batonBusy}
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

          <p className="gestures-muted" style={{ marginTop: "0.75rem" }}>
            Orchestral FluidR3 voices + hall bus. Each Play is captured — Send to Studio drops the
            take on the timeline.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
