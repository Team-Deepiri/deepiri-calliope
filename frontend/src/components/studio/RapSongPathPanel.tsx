import { Mic2, Music2, Sparkles, Wand2 } from "lucide-react";
import type { BeatStyle, RapStyle } from "../../api/client";

const STYLE_OPTIONS: { value: RapStyle; label: string }[] = [
  { value: "hard_tune", label: "Hard tune (Twoshot)" },
  { value: "melodic_rap", label: "Melodic rap" },
  { value: "natural", label: "Natural / light" },
];

const BEAT_OPTIONS: { value: BeatStyle; label: string }[] = [
  { value: "hiphop", label: "Hip-hop" },
  { value: "trap", label: "Trap" },
  { value: "boom_bap", label: "Boom bap" },
  { value: "house", label: "House" },
  { value: "garage", label: "UK garage" },
  { value: "lofi", label: "Lo-fi" },
  { value: "breakbeat", label: "Breakbeat" },
];

export type RapTempoMode = "auto" | "studio";

type Props = {
  targetLabel: string | null;
  targetStartBar: number | null;
  canProcess: boolean;
  busy: boolean;
  status: string | null;
  style: RapStyle;
  onStyleChange: (style: RapStyle) => void;
  beatStyle: BeatStyle;
  onBeatStyleChange: (style: BeatStyle) => void;
  tempoMode: RapTempoMode;
  onTempoModeChange: (mode: RapTempoMode) => void;
  studioBpm: number;
  playheadBar: number;
  metronomeOn: boolean;
  onToggleMetronome: () => void;
  onMakeRapSong: () => void;
  onMakeRapTake: () => void;
  onAddBeat: () => void;
};

export function RapSongPathPanel({
  targetLabel,
  targetStartBar,
  canProcess,
  busy,
  status,
  style,
  onStyleChange,
  beatStyle,
  onBeatStyleChange,
  tempoMode,
  onTempoModeChange,
  studioBpm,
  playheadBar,
  metronomeOn,
  onToggleMetronome,
  onMakeRapSong,
  onMakeRapTake,
  onAddBeat,
}: Props) {
  return (
    <div className="daw-rap-path">
      <div className="daw-rap-path__head">
        <Sparkles size={14} />
        <div>
          <strong>Rap song path</strong>
          <span>Record → autotune → beat → export</span>
        </div>
      </div>
      <p className="daw-rap-path__target">
        {targetLabel ? (
          <>
            Take: <em>{targetLabel}</em>
            {targetStartBar != null && targetStartBar > 0 ? (
              <> · bar {targetStartBar + 1}</>
            ) : null}
          </>
        ) : (
          "Record or import a vocal, then process it here."
        )}
      </p>
      <p className="daw-rap-path__tip">
        Metronome on while recording helps tempo match. Make rap song lines the beat up with your take; Add beat uses the playhead (bar {playheadBar}).
      </p>
      <label className="daw-rap-path__style">
        <span>Autotune style</span>
        <select
          value={style}
          disabled={busy}
          onChange={(e) => onStyleChange(e.target.value as RapStyle)}
        >
          {STYLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="daw-rap-path__style">
        <span>Beat style</span>
        <select
          value={beatStyle}
          disabled={busy}
          onChange={(e) => onBeatStyleChange(e.target.value as BeatStyle)}
        >
          {BEAT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="daw-rap-path__style">
        <span>Beat tempo</span>
        <select
          value={tempoMode}
          disabled={busy}
          onChange={(e) => onTempoModeChange(e.target.value as RapTempoMode)}
        >
          <option value="auto">Auto (match my take)</option>
          <option value="studio">Lock to studio ({studioBpm} BPM)</option>
        </select>
      </label>
      <label className="daw-rap-path__check">
        <input
          type="checkbox"
          checked={metronomeOn}
          disabled={busy}
          onChange={onToggleMetronome}
        />
        <span>Metronome click while playing / recording</span>
      </label>
      <div className="daw-rap-path__actions">
        <button
          type="button"
          className="daw-rap-path__hero"
          disabled={!canProcess || busy}
          onClick={onMakeRapSong}
        >
          <Wand2 size={14} />
          {busy ? "Building…" : "Make rap song"}
        </button>
        <button
          type="button"
          className="daw-rap-path__primary"
          disabled={!canProcess || busy}
          onClick={onMakeRapTake}
        >
          <Mic2 size={14} />
          Autotune take only
        </button>
        <button
          type="button"
          className="daw-rap-path__secondary"
          disabled={busy}
          onClick={onAddBeat}
        >
          <Music2 size={14} />
          Add beat at playhead
        </button>
      </div>
      {status && <p className="daw-rap-path__status">{status}</p>}
    </div>
  );
}
