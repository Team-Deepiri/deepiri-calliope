import { Mic2, Music2, Sparkles } from "lucide-react";

type Props = {
  targetLabel: string | null;
  canProcess: boolean;
  busy: boolean;
  status: string | null;
  onMakeRapTake: () => void;
  onAddBeat: () => void;
};

export function RapSongPathPanel({
  targetLabel,
  canProcess,
  busy,
  status,
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
      <div className="daw-rap-path__actions">
        <button
          type="button"
          className="daw-rap-path__primary"
          disabled={!canProcess || busy}
          onClick={onMakeRapTake}
        >
          <Mic2 size={14} />
          {busy ? "Processing…" : "Make autotuned rap take"}
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
