import { useState } from "react";
import { PianoRoll, type PianoNote } from "./PianoRoll";
import { StepSequencer } from "./StepSequencer";
import { SynthEngine, getSharedSynthContext, type SynthConfig } from "../../audio/synthEngine";

type StepCell = { active: boolean; velocity: number; ratchet: number };

type Props = {
  synthConfig: SynthConfig;
  setSynthConfig: (fn: SynthConfig | ((prev: SynthConfig) => SynthConfig)) => void;
  synthRef: React.MutableRefObject<SynthEngine | null>;
  pianoNotes: PianoNote[];
  setPianoNotes: (n: PianoNote[]) => void;
  seqPattern: {
    id: string;
    name: string;
    steps: Record<string, StepCell[]>;
    length: number;
  };
  setSeqPattern: (p: {
    id: string;
    name: string;
    steps: Record<string, StepCell[]>;
    length: number;
  }) => void;
  transport: { playing: boolean; bar: number; beat: number };
};

export function InstrumentTab({
  synthConfig,
  setSynthConfig,
  synthRef,
  pianoNotes,
  setPianoNotes,
  seqPattern,
  setSeqPattern,
  transport,
}: Props) {
  const [subTab, setSubTab] = useState<"piano" | "drums">("piano");

  return (
    <div className="daw-keys">
      <div className="daw-keys__bar">
        <div className="daw-keys__tabs" role="tablist" aria-label="Keys mode">
          {(["piano", "drums"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={subTab === t}
              className={`daw-keys__tab${subTab === t ? " is-active" : ""}`}
              onClick={() => setSubTab(t)}
            >
              {t === "piano" ? "Piano" : "Drums"}
            </button>
          ))}
        </div>
        {subTab === "piano" && (
          <label className="daw-keys__synth">
            <span>Synth</span>
            <select
              value={synthConfig.waveform}
              onChange={(e) => {
                const next = { ...synthConfig, waveform: e.target.value as SynthConfig["waveform"] };
                setSynthConfig(next);
                synthRef.current?.updateConfig(next);
              }}
            >
              <option value="sawtooth">Saw</option>
              <option value="sine">Sine</option>
              <option value="square">Square</option>
              <option value="triangle">Triangle</option>
            </select>
          </label>
        )}
      </div>
      <p className="daw-keys__coach">
        {subTab === "piano"
          ? "Click grid to draw · QWERTY plays the synth"
          : "Click steps to toggle · Timeline drums come from clips / Add beat"}
      </p>
      <div className="daw-keys__body">
        {subTab === "piano" ? (
          <PianoRoll
            notes={pianoNotes}
            onChange={setPianoNotes}
            totalBars={8}
            rootMidi={48}
            octaveCount={3}
            onNotePreview={(midi, on) => {
              if (on) {
                if (!synthRef.current) {
                  synthRef.current = new SynthEngine(getSharedSynthContext());
                  synthRef.current.updateConfig(synthConfig);
                }
                synthRef.current.noteOn(midi, 100);
              } else {
                synthRef.current?.noteOff(midi);
              }
            }}
          />
        ) : (
          <StepSequencer
            pattern={seqPattern}
            onPatternChange={setSeqPattern}
            isPlaying={transport.playing}
            currentStep={transport.beat}
          />
        )}
      </div>
    </div>
  );
}
