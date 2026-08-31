import { Mic2, Music2, Sparkles, Wand2 } from "lucide-react";
import type { RapStyle } from "../../api/client";

const STYLE_OPTIONS: { value: RapStyle; label: string }[] = [
  { value: "hard_tune", label: "Hard tune (Twoshot)" },
  { value: "melodic_rap", label: "Melodic rap" },
  { value: "natural", label: "Natural / light" },
];

export type RapTempoMode = "auto" | "studio";

type Props = {
  targetLabel: string | null;
  canProcess: boolean;
  busy: boolean;
  status: string | null;
  style: RapStyle;
  onStyleChange: (style: RapStyle) => void;
  tempoMode: RapTempoMode;
  onTempoModeChange: (mode: RapTempoMode) => void;
  studioBpm: number;
  metronomeOn: boolean;
  onToggleMetronome: () => void;
  onMakeRapSong: () => void;
  onMakeRapTake: () => void;
  onAddBeat: () => void;
};

export function RapSongPathPanel({
  targetLabel,
  canProcess,
  busy,
  status,
  style,
  onStyleChange,
  tempoMode,
  onTempoModeChange,
  studioBpm,
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
          </>
        ) : (
          "Record or import a vocal, then process it here."
        )}
      </p>
      <p className="daw-rap-path__tip">
        Tip: turn on the metronome and rap to the click — detection and stretch work much better.
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
          Add beat to Drums
        </button>
      </div>
      {status && <p className="daw-rap-path__status">{status}</p>}
    </div>
  );
}
