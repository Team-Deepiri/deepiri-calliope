import type { ArrangementTrack } from "./TimelineView";

export type MixerTrack = ArrangementTrack & {
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
};

type MixerConsoleProps = {
  tracks: MixerTrack[];
  onUpdateTrack: (trackId: string, updates: Partial<MixerTrack>) => void;
};

export function MixerConsole({ tracks, onUpdateTrack }: MixerConsoleProps) {
  return (
    <div className="daw-mixer">
      <div className="daw-mixer__head">
        <span className="daw-mixer__title">Mixer</span>
        <span className="daw-mixer__master">Master · −0.3 dBFS</span>
      </div>
      <div className="daw-mixer__strips">
        {tracks.map((track) => {
          const level = Math.min(100, Math.max(12, 55 + track.volume * 2 + (track.solo ? 15 : 0)));
          return (
            <div key={track.id} className="daw-strip">
              <div className="daw-strip__meter">
                <div className="daw-strip__meter-fill" style={{ height: `${level}%` }} />
              </div>
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
                {track.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
