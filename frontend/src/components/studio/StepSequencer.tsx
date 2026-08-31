import { useCallback } from "react";
import { Sparkles, Trash2 } from "lucide-react";

type InstrumentRow = "Kick" | "Snare" | "HH Closed" | "HH Open" | "Clap" | "Tom" | "Crash" | "Perc";

const ROWS: InstrumentRow[] = ["Kick", "Snare", "HH Closed", "HH Open", "Clap", "Tom", "Crash", "Perc"];

const ROW_COLORS: Record<InstrumentRow, string> = {
  Kick: "#ef4444",
  Snare: "#f97316",
  "HH Closed": "#eab308",
  "HH Open": "#22c55e",
  Clap: "#3b82f6",
  Tom: "#8b5cf6",
  Crash: "#ec4899",
  Perc: "#06b6d4",
};

interface Step {
  active: boolean;
  velocity: number;
  ratchet: number;
}

interface Pattern {
  id: string;
  name: string;
  steps: Record<string, Step[]>;
  length: number;
}

interface StepSequencerProps {
  pattern: Pattern;
  onPatternChange: (pattern: Pattern) => void;
  isPlaying: boolean;
  currentStep: number;
}

function createEmptySteps(len: number): Step[] {
  return Array.from({ length: len }, () => ({ active: false, velocity: 100, ratchet: 1 }));
}

export function StepSequencer({ pattern, onPatternChange, isPlaying, currentStep }: StepSequencerProps) {
  const handleStepToggle = useCallback(
    (row: InstrumentRow, stepIdx: number) => {
      const newSteps = { ...pattern.steps };
      const rowSteps = [...(newSteps[row] || createEmptySteps(pattern.length))];
      rowSteps[stepIdx] = { ...rowSteps[stepIdx], active: !rowSteps[stepIdx].active };
      newSteps[row] = rowSteps;
      onPatternChange({ ...pattern, steps: newSteps });
    },
    [pattern, onPatternChange],
  );

  const handleLengthChange = useCallback(
    (len: number) => {
      const clamped = Math.max(8, Math.min(16, len));
      const newSteps: Record<string, Step[]> = {};
      for (const row of ROWS) {
        const current = pattern.steps[row] || [];
        if (clamped > current.length) {
          newSteps[row] = [...current, ...createEmptySteps(clamped - current.length)];
        } else {
          newSteps[row] = current.slice(0, clamped);
        }
      }
      onPatternChange({ ...pattern, steps: newSteps, length: clamped });
    },
    [pattern, onPatternChange],
  );

  const clearPattern = useCallback(() => {
    const newSteps: Record<string, Step[]> = {};
    for (const row of ROWS) {
      newSteps[row] = createEmptySteps(pattern.length);
    }
    onPatternChange({ ...pattern, steps: newSteps });
  }, [pattern, onPatternChange]);

  const randomize = useCallback(() => {
    const newSteps: Record<string, Step[]> = {};
    for (const row of ROWS) {
      newSteps[row] = Array.from({ length: pattern.length }, () => ({
        active: Math.random() > 0.6,
        velocity: Math.floor(Math.random() * 100) + 28,
        ratchet: 1,
      }));
    }
    onPatternChange({ ...pattern, steps: newSteps });
  }, [pattern, onPatternChange]);

  return (
    <div className="daw-keys-seq">
      <div className="daw-keys-seq__toolbar">
        <label className="daw-keys-seq__field">
          <span>Steps</span>
          <select
            value={pattern.length}
            onChange={(e) => handleLengthChange(parseInt(e.target.value, 10))}
          >
            {[8, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="daw-keys-seq__actions">
          <button type="button" className="daw-keys-seq__icon-btn" onClick={clearPattern} title="Clear pattern">
            <Trash2 size={12} />
          </button>
          <button type="button" className="daw-keys-seq__icon-btn" onClick={randomize} title="Randomize">
            <Sparkles size={12} />
          </button>
        </div>
      </div>

      <div className="daw-keys-seq__grid">
        {ROWS.map((row) => {
          const steps = pattern.steps[row] || createEmptySteps(pattern.length);
          return (
            <div key={row} className="daw-keys-seq__row">
              <div className="daw-keys-seq__row-label" style={{ color: ROW_COLORS[row] }}>
                {row}
              </div>
              <div
                className="daw-keys-seq__cells"
                style={{ gridTemplateColumns: `repeat(${pattern.length}, minmax(14px, 1fr))` }}
              >
                {steps.map((step, idx) => {
                  const isCurrent = isPlaying && currentStep === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={`daw-keys-seq__cell${step.active ? " is-active" : ""}${isCurrent ? " is-current" : ""}`}
                      style={
                        step.active
                          ? {
                              backgroundColor: isCurrent ? ROW_COLORS[row] : `${ROW_COLORS[row]}cc`,
                              opacity: 0.55 + (step.velocity / 127) * 0.45,
                            }
                          : undefined
                      }
                      onClick={() => handleStepToggle(row, idx)}
                      title={`${row} ${idx + 1}`}
                      aria-pressed={step.active}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="daw-keys-seq__nums"
        style={{ gridTemplateColumns: `4.5rem repeat(${pattern.length}, minmax(14px, 1fr))` }}
      >
        <span />
        {Array.from({ length: pattern.length }, (_, i) => (
          <span
            key={i}
            className={`daw-keys-seq__num${isPlaying && currentStep === i ? " is-current" : ""}`}
          >
            {i + 1}
          </span>
        ))}
      </div>
    </div>
  );
}
