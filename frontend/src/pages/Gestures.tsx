import { useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Disc3, Hand, Pause, Play, Radio, Square, Upload, Video } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { CameraStage } from "../components/gestures/CameraStage";
import { useHandTracker } from "../gestures/useHandTracker";
import { useBatonOrchestra } from "../gestures/useBatonOrchestra";
import { FIGURE_EDGES } from "../gestures/patternConduct";
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

function pct(v: number, fallback: number): number {
  return Number.isFinite(v) ? v * 100 : fallback * 100;
}

function mirrorX(x: number, fallback = 0.5): number {
  return pct(1 - (Number.isFinite(x) ? x : fallback), 0.5);
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
    conductMode,
    setConductMode,
    finalReport,
    calib,
    hasProfile,
    startCalibration,
    cancelCalibration,
    resetConductorProfile,
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
  const grade = finalReport ?? batonLevels.grade;

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

  const coachText =
    conductMode === "pattern"
      ? calib.active
        ? "Calibrating: conduct to each lit beat — we’ll learn your figure (~3 samples per beat). Tempo stays steady."
        : hasProfile
          ? "Pattern (your figure): hit lit beats to keep tempo. Miss and it crawls. Left hand = bass / mid / treble."
          : "Pattern: hit lit beat dots to keep the song at normal tempo — miss and it crawls. Calibrate to personalize the figure."
      : "Free tempo: stroke rate sets tempo; stroke size sets dynamics. Left hand = bass / mid / treble.";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="gradient-strip" style={{ maxWidth: 200, marginBottom: "1rem" }} />
      <h1 className="section-title">Gestures</h1>
      <p className="lead mt-sm">
        Conduct a MIDI score by tracing a beat pattern with your fingertip — right tip drives the
        figure, left hand shapes bass / mid / treble.
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
                  {conductMode === "pattern"
                    ? "Hit the lit dots to keep the music moving — miss and it slows to a crawl."
                    : "Wave your index tip as the stick. Left hand balances the orchestra bands."}
                </small>
              </div>
            </div>
            <ul className="gestures-vocab__list">
              {conductMode === "pattern" ? (
                <>
                  <li className="gestures-vocab__item">
                    <strong>Lit beat</strong>
                    <span>Hit to keep tempo</span>
                    <small>Land cues for normal pace; miss and the song crawls</small>
                  </li>
                  <li className="gestures-vocab__item">
                    <strong>Pattern size</strong>
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
                </>
              ) : (
                <>
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
                </>
              )}
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
            {conductMode === "pattern" && (batonIsArmed || grade.score > 0) && (
              <div
                className={
                  "gestures-grade-badge" + (grade.frozen ? " gestures-grade-badge--final" : "")
                }
                title={grade.coach}
              >
                <span className="gestures-grade-badge__letter">{grade.letter}</span>
                <span className="gestures-grade-badge__score">{grade.score}</span>
              </div>
            )}
          </div>

          <div
            className={
              "gestures-baton-trail" +
              (conductMode === "pattern" ? " gestures-baton-trail--pattern" : "") +
              (batonPlayback === "playing" ? " gestures-baton-trail--live" : "") +
              (batonLevels.pulse || batonLevels.beat ? " gestures-baton-trail--pulse" : "")
            }
            aria-hidden
          >
            {conductMode === "pattern" && (
              <>
                <svg className="gestures-pattern-path" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {FIGURE_EDGES.map(([a, b]) => {
                    const pa = batonLevels.targets.find((t) => t.beat === a);
                    const pb = batonLevels.targets.find((t) => t.beat === b);
                    if (!pa || !pb) return null;
                    return (
                      <line
                        key={`mesh-${a}-${b}`}
                        x1={(1 - pa.x) * 100}
                        y1={pa.y * 100}
                        x2={(1 - pb.x) * 100}
                        y2={pb.y * 100}
                        stroke="rgba(148, 163, 184, 0.22)"
                        strokeWidth="1"
                        strokeLinecap="round"
                      />
                    );
                  })}
                  {(batonLevels.pathEdges ?? []).map(([a, b]) => {
                    const pa = batonLevels.targets.find((t) => t.beat === a);
                    const pb = batonLevels.targets.find((t) => t.beat === b);
                    if (!pa || !pb) return null;
                    return (
                      <line
                        key={`path-${a}-${b}`}
                        x1={(1 - pa.x) * 100}
                        y1={pa.y * 100}
                        x2={(1 - pb.x) * 100}
                        y2={pb.y * 100}
                        stroke="rgba(251, 191, 36, 0.4)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    );
                  })}
                </svg>
                {batonLevels.targets.map((t) => {
                  const isLit = t.beat === batonLevels.nextBeat;
                  return (
                    <span
                      key={t.beat}
                      className={
                        "gestures-pattern-node gestures-pattern-node--waypoint" +
                        (isLit ? " gestures-pattern-node--active" : "") +
                        (isLit && batonLevels.pulse ? " gestures-pattern-node--ictus" : "")
                      }
                      style={{
                        left: `${mirrorX(t.x)}%`,
                        top: `${pct(t.y, 0.5)}%`,
                      }}
                    >
                      {t.label}
                    </span>
                  );
                })}
              </>
            )}
            <span
              className={
                "gestures-baton-tip" + (batonLevels.beat ? " gestures-baton-tip--beat" : "")
              }
              style={{
                left: `${mirrorX(batonLevels.tipX, 0.5)}%`,
                top: `${pct(batonLevels.tipY, 0.5)}%`,
              }}
            />
          </div>

          {conductMode === "pattern" ? (
            <div className="gestures-live-hud" aria-label="Conducting metrics">
              <div className="gestures-live-hud__grade">
                <span className="gestures-live-hud__letter">
                  {grade.letter}
                </span>
                <div>
                  <strong>{grade.score}</strong>
                  <small>{grade.coach || "Conduct to build a grade"}</small>
                </div>
              </div>
              <div className="gestures-live-hud__meters">
                <Meter label="Timing" value={grade.breakdown.timing} accent="#fde68a" />
                <Meter label="Accuracy" value={grade.breakdown.accuracy} accent="#f472b6" />
                <Meter label="Continuity" value={grade.breakdown.continuity} accent="#34d399" />
                <Meter label="Tempo" value={batonLevels.tempoRate} accent="#c084fc" />
                <Meter label="Dynamics" value={batonLevels.dynamics} accent="var(--primary-500)" />
                <Meter label="Progress" value={batonLevels.progress} accent="#94a3b8" />
              </div>
            </div>
          ) : (
            <div className="gestures-live-hud gestures-live-hud--free" aria-label="Free tempo meters">
              <div className="gestures-live-hud__meters">
                <Meter label="Phrase" value={batonLevels.phrase} accent="#f472b6" />
                <Meter label="Dynamics" value={batonLevels.dynamics} accent="var(--primary-500)" />
                <Meter
                  label="Tempo rate"
                  value={(batonLevels.tempoRate - 0.55) / 0.9}
                  accent="#c084fc"
                />
                <Meter label="Progress" value={batonLevels.progress} accent="#94a3b8" />
              </div>
            </div>
          )}

          <div className="gestures-mode-row" role="group" aria-label="Conduct mode">
            <button
              type="button"
              className={
                "gestures-mode-chip" + (conductMode === "pattern" ? " gestures-mode-chip--on" : "")
              }
              onClick={() => setConductMode("pattern")}
            >
              Pattern
            </button>
            <button
              type="button"
              className={
                "gestures-mode-chip" + (conductMode === "free" ? " gestures-mode-chip--on" : "")
              }
              onClick={() => setConductMode("free")}
            >
              Free tempo
            </button>
            {conductMode === "pattern" && (
              <>
                {calib.active ? (
                  <button
                    type="button"
                    className="gestures-mode-chip gestures-mode-chip--warn"
                    onClick={() => cancelCalibration()}
                  >
                    Cancel calib
                  </button>
                ) : (
                  <button
                    type="button"
                    className="gestures-mode-chip"
                    onClick={() => void startCalibration()}
                    disabled={!cameraReady || batonBusy}
                    title="Learn your personal beat positions from a short conducting sample"
                  >
                    Calibrate figure
                  </button>
                )}
                {hasProfile && !calib.active && (
                  <button
                    type="button"
                    className="gestures-mode-chip"
                    onClick={() => resetConductorProfile()}
                    title="Restore the default 4/4 figure"
                  >
                    Reset figure
                  </button>
                )}
              </>
            )}
          </div>

          {calib.active && (
            <div className="gestures-calib-banner" role="status">
              <strong>
                Learning your figure · {calib.total}/{calib.goal}
              </strong>
              <div className="gestures-calib-banner__beats">
                {([1, 2, 3, 4] as const).map((b) => (
                  <span
                    key={b}
                    className={
                      "gestures-calib-pill" +
                      (calib.counts[b - 1] >= calib.needed ? " gestures-calib-pill--done" : "")
                    }
                  >
                    {b}: {Math.min(calib.counts[b - 1], calib.needed)}/{calib.needed}
                  </span>
                ))}
              </div>
              <small>Hit each lit cue on the beat — we keep the diamond shape and fit it to your space.</small>
            </div>
          )}

          {hasProfile && !calib.active && conductMode === "pattern" && (
            <p className="gestures-profile-note">Using your calibrated figure</p>
          )}

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

          {(batonPlayback === "ended" || (finalReport && finalReport.frozen)) &&
            conductMode === "pattern" &&
            finalReport && (
              <div className="gestures-final-card">
                <div className="gestures-final-card__head">
                  <span className="gestures-final-card__letter">{finalReport.letter}</span>
                  <div>
                    <strong>Conducting score</strong>
                    <p>{finalReport.score} / 100</p>
                  </div>
                </div>
                <p className="gestures-final-card__coach">{finalReport.coach}</p>
              </div>
            )}

          <p className="gestures-coach">{coachText}</p>

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

          <div className="gestures-mix-meters" aria-label="Orchestra balance">
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
          </div>

          <p className="gestures-muted" style={{ marginTop: "0.75rem" }}>
            Orchestral FluidR3 voices + hall bus. Each Play is captured — Send to Studio drops the
            take on the timeline.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
