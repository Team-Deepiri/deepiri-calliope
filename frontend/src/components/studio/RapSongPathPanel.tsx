import { Mic2, Music2, Sparkles, Wand2 } from "lucide-react";
import type { RapStyle } from "../../api/client";

const STYLE_OPTIONS: { value: RapStyle; label: string }[] = [
  { value: "hard_tune", label: "Hard tune (Twoshot)" },
  { value: "melodic_rap", label: "Melodic rap" },
  { value: "natural", label: "Natural / light" },
];

type Props = {
  targetLabel: string | null;
  canProcess: boolean;
  busy: boolean;
  status: string | null;
  style: RapStyle;
  onStyleChange: (style: RapStyle) => void;
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
