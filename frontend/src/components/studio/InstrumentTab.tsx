import { useState } from "react";
import { PianoRoll, type PianoNote } from "./PianoRoll";
import { StepSequencer } from "./StepSequencer";
import { SynthEngine, getSharedSynthContext, type SynthConfig } from "../../audio/synthEngine";

type Props = {
  synthConfig: SynthConfig;
  setSynthConfig: (fn: SynthConfig | ((prev: SynthConfig) => SynthConfig)) => void;
  synthRef: React.MutableRefObject<SynthEngine | null>;
  pianoNotes: PianoNote[];
  setPianoNotes: (n: PianoNote[]) => void;
  seqPattern: {
    id: string;
    name: string;
    steps: Record<string, { active: boolean; velocity: number; ratchet: number }[]>;
    length: number;
  };
  setSeqPattern: (p: {
    id: string;
    name: string;
    steps: Record<string, { active: boolean; velocity: number; ratchet: number }[]>;
    length: number;
  }) => void;
  transport: { playing: boolean; bar: number; beat: number };
  bpm: number;
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
  bpm,
}: Props) {
  const [subTab, setSubTab] = useState<"piano" | "drums">("piano");

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "4px 8px",
          background: "var(--daw-surface)",
          borderBottom: "1px solid var(--daw-border)",
          display: "flex",
          gap: "6px",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", gap: 2 }}>
          {(["piano", "drums"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className="btn-icon"
              style={{
                background: subTab === t ? "var(--daw-accent)" : "transparent",
                color: subTab === t ? "#fff" : "var(--daw-dim)",
              }}
              onClick={() => setSubTab(t)}
            >
              {t === "piano" ? "Piano" : "Drums"}
            </button>
          ))}
        </div>
        <select
          value={synthConfig.waveform}
          onChange={(e) => {
            const next = { ...synthConfig, waveform: e.target.value as SynthConfig["waveform"] };
            setSynthConfig(next);
            synthRef.current?.updateConfig(next);
          }}
          style={{
            fontSize: "0.6rem",
            background: "var(--daw-bg)",
            color: "var(--daw-text)",
            border: "1px solid var(--daw-border)",
            borderRadius: 3,
            padding: "2px 4px",
          }}
        >
          <option value="sawtooth">Saw</option>
          <option value="sine">Sine</option>
          <option value="square">Square</option>
          <option value="triangle">Triangle</option>
        </select>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {subTab === "piano" ? (
          <PianoRoll
            notes={pianoNotes}
            onChange={setPianoNotes}
            totalBars={8}
            rootMidi={36}
            octaveCount={5}
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
            bpm={bpm}
            onBpmChange={() => {}}
          />
        )}
      </div>
    </div>
  );
}
