import { useEffect, useRef, useState } from "react";
import type { ArrangementTrack } from "./TimelineView";

export type MixerTrack = ArrangementTrack & {
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
};

type MeterSample = { rms: number; peak: number; hold: number };

const IDLE_METER: MeterSample = { rms: 0, peak: 0, hold: 0 };

// Meter scale: fader range is -60..+6 dB (66 dB of travel).
const METER_DB_FLOOR = -60;
const METER_DB_RANGE = 66;

function toPercent(linear: number): number {
  const db = 20 * Math.log10(Math.max(linear, 1e-4));
  return Math.max(0, Math.min(100, ((db - METER_DB_FLOOR) / METER_DB_RANGE) * 100));
}

type MixerConsoleProps = {
  tracks: MixerTrack[];
  onUpdateTrack: (trackId: string, updates: Partial<MixerTrack>) => void;
  readMeter?: (trackId: string) => { peak: number; rms: number };
};

export function MixerConsole({ tracks, onUpdateTrack, readMeter }: MixerConsoleProps) {
  const [meters, setMeters] = useState<Record<string, MeterSample>>({});
  const holdsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!readMeter) return;
    const id = window.setInterval(() => {
      const next: Record<string, MeterSample> = {};
      for (const t of tracks) {
        const s = readMeter(t.id);
        const prevHold = holdsRef.current[t.id] ?? 0;
        // Peak-hold decays slowly so transients stay readable.
        const hold = s.peak >= prevHold ? s.peak : prevHold * 0.92;
        holdsRef.current[t.id] = hold;
        next[t.id] = { rms: s.rms, peak: s.peak, hold };
      }
      setMeters(next);
    }, 80);
    return () => window.clearInterval(id);
  }, [readMeter, tracks]);

  return (
    <div className="daw-mixer">
      <div className="daw-mixer__head">
        <span className="daw-mixer__title">Mixer</span>
        <span className="daw-mixer__master">Post-fader metering</span>
      </div>
      <div className="daw-mixer__strips">
        {tracks.map((track) => {
          const m = meters[track.id] ?? IDLE_METER;
          const rmsPct = toPercent(m.rms);
          const peakPct = toPercent(m.peak);
          const holdPct = m.hold > 1e-3 ? toPercent(m.hold) : null;
          return (
            <div key={track.id} className={`daw-strip${track.muted ? " is-muted" : ""}`}>
              <div className="daw-strip__meter">
                <div className="daw-strip__meter-scale" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <i key={i} />
                  ))}
                </div>
                <div
                  className="daw-strip__meter-fill"
                  style={{ height: `${rmsPct}%`, ["--daw-meter-peak" as string]: `${100 - peakPct}%` }}
                >
                  {holdPct != null && (
                    <span className="daw-strip__meter-hold" style={{ bottom: `${holdPct}%` }} />
                  )}
                </div>
                {peakPct > 99 && <span className="daw-strip__meter-clip" title="Clipping" />}
              </div>
              <label className="daw-strip__pan">
                <span>Pan</span>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={track.pan}
                  onChange={(e) => onUpdateTrack(track.id, { pan: parseFloat(e.target.value) })}
                  aria-label={`${track.name} pan`}
                />
              </label>
              <div className="daw-strip__fader-wrap">
                <input
                  type="range"
                  className="daw-strip__fader"
                  min={-60}
                  max={6}
                  step={0.1}
                  value={track.volume}
                  onChange={(e) => onUpdateTrack(track.id, { volume: parseFloat(e.target.value) })}
                  aria-label={`${track.name} volume`}
                />
              </div>
              <div className="daw-strip__vol">{track.muted ? "MUTED" : `${track.volume.toFixed(1)} dB`}</div>
              <div className="daw-strip__btns">
                <button
                  type="button"
                  className={`daw-strip__btn${track.muted ? " is-on-mute" : ""}`}
                  onClick={() => onUpdateTrack(track.id, { muted: !track.muted })}
                >
                  M
                </button>
                <button
                  type="button"
                  className={`daw-strip__btn${track.solo ? " is-on-solo" : ""}`}
                  onClick={() => onUpdateTrack(track.id, { solo: !track.solo })}
                >
                  S
                </button>
              </div>
              <span className="daw-strip__name" title={track.name}>
                <i className="daw-strip__dot" style={{ background: track.color }} />
                {track.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
