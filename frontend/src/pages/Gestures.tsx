import { useRef } from "react";
import { motion } from "framer-motion";
import { Hand, Link2, Radio, Square, Video } from "lucide-react";
import { Link } from "react-router-dom";
import { CameraStage } from "../components/gestures/CameraStage";
import { useHandTracker } from "../gestures/useHandTracker";
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

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

export function Gestures() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { status, error, signals, fps, start, stop } = useHandTracker({ videoRef, canvasRef });
  const live = status === "running" || status === "starting";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="gradient-strip" style={{ maxWidth: 200, marginBottom: "1rem" }} />
      <h1 className="section-title">Gestures</h1>
      <p className="lead mt-sm">
        Webcam hand tracking as a <strong>performance surface</strong>. Continuous signals (height, pinch,
        openness) will drive instruments; discrete poses will trigger composition later.
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
              <button type="button" className="btn-modern btn-ghost" onClick={stop}>
                <Square size={18} />
                Stop
              </button>
            )}
            <span className="gestures-status">
              <Radio size={14} />
              {status === "idle" && "Idle"}
              {status === "starting" && "Loading MediaPipe…"}
              {status === "running" && `Tracking · ${fps} fps`}
              {status === "error" && "Error"}
            </span>
            <Link to="/studio" className="btn-modern btn-ghost" style={{ textDecoration: "none", marginLeft: "auto" }}>
              Open Studio
            </Link>
          </div>
          {error && <p className="gestures-error">{error}</p>}
        </div>

        <div className="glass-panel gestures-panel stack" style={{ padding: "1.25rem" }}>
          <div className="gestures-signals-head">
            <Hand size={18} />
            <div>
              <div className="field-label" style={{ marginBottom: 0 }}>
                Instrument signals
              </div>
              <small className="gestures-muted">
                {signals.detected ? "Hand detected" : "No hand in frame"}
                {signals.fist ? " · fist" : ""}
              </small>
            </div>
          </div>

          <Meter label="Height" value={signals.height} accent="var(--primary-500)" />
          <Meter label="Pinch" value={signals.pinch} accent="var(--deepiri-orange)" />
          <Meter label="Openness" value={signals.openness} accent="#34d399" />

          <div className={"gestures-fist" + (signals.fist ? " gestures-fist--on" : "")}>
            Fist gate {signals.fist ? "ON" : "off"}
          </div>

          <div className="gestures-map-note">
            <Link2 size={14} />
            <span>
              Mapping to synth / Studio modulation lands in step 2. For now these meters are the live
              control surface.
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
