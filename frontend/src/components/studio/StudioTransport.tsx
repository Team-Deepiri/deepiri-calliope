import { useEffect, useRef } from "react";
import { Circle, Pause, Play, SkipBack } from "lucide-react";

export type TransportState = {
  playing: boolean;
  recording: boolean;
  armed: boolean;
  bar: number;
  beat: number;
};

type StudioTransportProps = {
  bpm: number;
  onBpmChange: (bpm: number) => void;
  transport: TransportState;
  onPlay: () => void;
  onStop: () => void;
  onRecord: () => void;
  getPlayheadBar?: () => number;
};

export function StudioTransport({
  bpm,
  onBpmChange,
  transport,
  onPlay,
  onStop,
  onRecord,
  getPlayheadBar,
}: StudioTransportProps) {
  const positionRef = useRef<HTMLSpanElement>(null);

  // LED-style position readout updates at frame rate without React renders.
  useEffect(() => {
    if (!transport.playing || !getPlayheadBar) return;
    let raf = 0;
    const tick = () => {
      const el = positionRef.current;
      if (el) {
        const barFloat = Math.max(0, getPlayheadBar() - 1);
        const bar = Math.floor(barFloat) + 1;
        const beat = Math.floor((barFloat % 1) * 4);
        const sixteenth = Math.floor((((barFloat % 1) * 4) % 1) * 4);
        el.textContent = `${String(bar).padStart(3, "0")}.${beat + 1}.${sixteenth + 1}`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [transport.playing, getPlayheadBar]);

  return (
    <div className="daw-transport" role="group" aria-label="Transport">
      <button type="button" className="daw-transport__btn" onClick={onStop} title="Return to start" aria-label="Return to start">
        <SkipBack size={16} />
      </button>
      <button
        type="button"
        className={`daw-transport__btn daw-transport__btn--play${transport.playing ? " is-active" : ""}`}
        onClick={onPlay}
        title={transport.playing ? "Pause" : "Play"}
        aria-label={transport.playing ? "Pause" : "Play"}
      >
        {transport.playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
      </button>
      <button
        type="button"
        className={`daw-transport__btn daw-transport__btn--record${transport.recording || transport.armed ? " is-active" : ""}${transport.armed && !transport.recording ? " is-armed" : ""}`}
        onClick={onRecord}
        title="Record vocal"
        aria-label="Record"
      >
        <Circle size={14} fill="currentColor" />
      </button>
      <span className="daw-transport__divider" aria-hidden />
      <span className={`daw-transport__led${transport.playing ? " is-playing" : ""}`}>
        <i className="daw-transport__led-dot" data-state={transport.recording ? "rec" : transport.playing ? "play" : "idle"} />
        <span ref={positionRef} className="daw-transport__time">
          {`${String(transport.bar).padStart(3, "0")}.${transport.beat + 1}.1`}
        </span>
      </span>
      <span className="daw-transport__divider" aria-hidden />
      <label className="daw-transport__bpm">
        BPM
        <input
          type="number"
          min={40}
          max={300}
          value={bpm}
          onChange={(e) => onBpmChange(Math.max(40, Math.min(300, parseInt(e.target.value, 10) || 120)))}
        />
      </label>
    </div>
  );
}
