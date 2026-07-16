import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Music, Shuffle, Trash2, Sparkles, Gauge, Bell, Repeat,
} from "lucide-react";

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

const NOTE_REPEATS = ["1/4", "1/8", "1/16", "1/32"] as const;

interface Step {
  active: boolean;
  velocity: number;
  ratchet: number;
}

interface Pattern {
  id: string;
  name: string;
  steps: Record<InstrumentRow, Step[]>;
  length: number;
}

interface StepSequencerProps {
  pattern: Pattern;
  onPatternChange: (pattern: Pattern) => void;
  isPlaying: boolean;
  currentStep: number;
  bpm: number;
  onBpmChange: (bpm: number) => void;
}

function createEmptySteps(len: number): Step[] {
  return Array.from({ length: len }, () => ({ active: false, velocity: 100, ratchet: 1 }));
}

function makeDefaultPattern(id: string, name: string, length = 16): Pattern {
  const steps = {} as Record<InstrumentRow, Step[]>;
  for (const row of ROWS) {
    steps[row] = createEmptySteps(length);
  }
  return { id, name, steps, length };
}

export function StepSequencer({ pattern, onPatternChange, isPlaying, currentStep, bpm, onBpmChange }: StepSequencerProps) {
  const [swing, setSwing] = useState(0);
  const [noteRepeat, setNoteRepeat] = useState<typeof NOTE_REPEATS[number]>("1/16");
  const [fillMode, setFillMode] = useState(false);
  const [activePattern, setActivePattern] = useState("A");

  const patterns = useMemo(() => ({
    A: pattern,
    B: makeDefaultPattern("B", "Pattern B", pattern.length),
    C: makeDefaultPattern("C", "Pattern C", pattern.length),
  }), [pattern]);

  const handleStepToggle = useCallback((row: InstrumentRow, stepIdx: number) => {
    const newSteps = { ...pattern.steps };
    const rowSteps = [...newSteps[row]];
    rowSteps[stepIdx] = { ...rowSteps[stepIdx], active: !rowSteps[stepIdx].active };
    newSteps[row] = rowSteps;
    onPatternChange({ ...pattern, steps: newSteps });
  }, [pattern, onPatternChange]);

  const handleVelocityChange = useCallback((row: InstrumentRow, stepIdx: number, velocity: number) => {
    const newSteps = { ...pattern.steps };
    const rowSteps = [...newSteps[row]];
    rowSteps[stepIdx] = { ...rowSteps[stepIdx], velocity: Math.max(1, Math.min(127, velocity)) };
    newSteps[row] = rowSteps;
    onPatternChange({ ...pattern, steps: newSteps });
  }, [pattern, onPatternChange]);

  const handleRatchetChange = useCallback((row: InstrumentRow, stepIdx: number, ratchet: number) => {
    const newSteps = { ...pattern.steps };
    const rowSteps = [...newSteps[row]];
    rowSteps[stepIdx] = { ...rowSteps[stepIdx], ratchet: Math.max(1, Math.min(8, ratchet)) };
    newSteps[row] = rowSteps;
    onPatternChange({ ...pattern, steps: newSteps });
  }, [pattern, onPatternChange]);

  const handleLengthChange = useCallback((len: number) => {
    const clamped = Math.max(8, Math.min(16, len));
    const newSteps = {} as Record<InstrumentRow, Step[]>;
    for (const row of ROWS) {
      const current = pattern.steps[row] || [];
      if (clamped > current.length) {
        newSteps[row] = [...current, ...createEmptySteps(clamped - current.length)];
      } else {
        newSteps[row] = current.slice(0, clamped);
      }
    }
    onPatternChange({ ...pattern, steps: newSteps, length: clamped });
  }, [pattern, onPatternChange]);

  const clearPattern = useCallback(() => {
    const newSteps = {} as Record<InstrumentRow, Step[]>;
    for (const row of ROWS) {
      newSteps[row] = createEmptySteps(pattern.length);
    }
    onPatternChange({ ...pattern, steps: newSteps });
  }, [pattern, onPatternChange]);

  const randomize = useCallback(() => {
    const newSteps = {} as Record<InstrumentRow, Step[]>;
    for (const row of ROWS) {
      newSteps[row] = Array.from({ length: pattern.length }, () => ({
        active: Math.random() > 0.6,
        velocity: Math.floor(Math.random() * 100) + 28,
        ratchet: Math.random() > 0.9 ? 2 : 1,
      }));
    }
    onPatternChange({ ...pattern, steps: newSteps });
  }, [pattern, onPatternChange]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="step-sequencer bg-gray-950 rounded-2xl border border-gray-800 p-4 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Music size={16} className="text-indigo-500" />
          <h2 className="text-sm font-bold text-white">Step Sequencer</h2>

          {/* Pattern chain */}
          <div className="flex items-center gap-1 ml-2">
            {(["A", "B", "C"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setActivePattern(p)}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                  activePattern === p
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-gray-800 text-gray-500 hover:text-gray-300"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Pattern length */}
          <div className="flex items-center gap-1 bg-gray-900 px-2 py-1 rounded-lg border border-gray-800">
            <span className="text-[9px] text-gray-500 font-bold">Steps</span>
            <select
              value={pattern.length}
              onChange={(e) => handleLengthChange(parseInt(e.target.value))}
              className="bg-transparent text-white text-xs font-bold outline-none"
            >
              {Array.from({ length: 9 }, (_, i) => i + 8).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {/* Note repeat */}
          <select
            value={noteRepeat}
            onChange={(e) => setNoteRepeat(e.target.value as typeof NOTE_REPEATS[number])}
            className="bg-gray-900 border border-gray-800 rounded-lg text-[10px] text-gray-400 px-2 py-1 outline-none"
          >
            {NOTE_REPEATS.map((nr) => (
              <option key={nr} value={nr}>{nr}</option>
            ))}
          </select>

          <div className="w-px h-5 bg-gray-800" />

          {/* Fill */}
          <button
            onMouseDown={() => setFillMode(true)}
            onMouseUp={() => setFillMode(false)}
            onMouseLeave={() => setFillMode(false)}
            className={`px-2.5 py-1.5 rounded text-[10px] font-bold transition-all ${
              fillMode ? "bg-yellow-600 text-white" : "bg-gray-800 text-gray-500 hover:text-gray-300"
            }`}
            title="Fill (momentary)"
          >
            Fill
          </button>

          {/* Clear */}
          <button
            onClick={clearPattern}
            className="p-1.5 rounded bg-gray-800 text-gray-500 hover:text-red-400 transition-all"
            title="Clear Pattern"
          >
            <Trash2 size={12} />
          </button>

          {/* Randomize */}
          <button
            onClick={randomize}
            className="p-1.5 rounded bg-gray-800 text-gray-500 hover:text-purple-400 transition-all"
            title="Randomize"
          >
            <Sparkles size={12} />
          </button>
        </div>
      </div>

      {/* Swing slider */}
      <div className="flex items-center gap-3 mb-4 bg-gray-900/50 px-3 py-2 rounded-xl border border-gray-800/50">
        <Shuffle size={12} className="text-gray-500" />
        <span className="text-[10px] font-bold text-gray-500 uppercase w-10">Swing</span>
        <input
          type="range"
          min={0}
          max={100}
          value={swing}
          onChange={(e) => setSwing(parseInt(e.target.value))}
          className="flex-1 h-1 appearance-none bg-gray-800 rounded-full cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500"
        />
        <span className="text-[10px] font-mono text-gray-400 w-8 text-right">{swing}%</span>
      </div>

      {/* Step grid */}
      <div className="space-y-0.5">
        {ROWS.map((row) => {
          const steps = pattern.steps[row] || createEmptySteps(pattern.length);
          return (
            <div key={row} className="flex items-center gap-1.5">
              {/* Row label */}
              <div
                className="w-20 text-[9px] font-bold uppercase tracking-wider text-right pr-2 shrink-0"
                style={{ color: ROW_COLORS[row] }}
              >
                {row}
              </div>

              {/* Steps */}
              <div className="flex gap-0.5 flex-1">
                {steps.map((step, idx) => {
                  const isCurrent = isPlaying && currentStep === idx;
                  const isFill = fillMode;
                  const active = isFill ? true : step.active;

                  return (
                    <div key={idx} className="flex flex-col items-center gap-0.5">
                      <button
                        onClick={() => handleStepToggle(row, idx)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          const newVel = Math.min(127, step.velocity + 20);
                          handleVelocityChange(row, idx, newVel > 127 ? 1 : newVel);
                        }}
                        onAuxClick={(e) => {
                          if (e.button === 1) {
                            handleRatchetChange(row, idx, step.ratchet >= 4 ? 1 : step.ratchet + 1);
                          }
                        }}
                        className={`w-full aspect-square rounded-sm transition-all ${
                          isCurrent
                            ? "ring-1 ring-white"
                            : ""
                        } ${
                          active
                            ? "shadow-sm"
                            : "bg-gray-800/50 hover:bg-gray-700/50"
                        }`}
                        style={{
                          backgroundColor: active
                            ? isCurrent
                              ? ROW_COLORS[row]
                              : ROW_COLORS[row] + "cc"
                            : undefined,
                          opacity: active ? 0.5 + (step.velocity / 127) * 0.5 : 1,
                        }}
                        title={`${row} ${idx + 1} - Vel: ${step.velocity}${step.ratchet > 1 ? ` ×${step.ratchet}` : ""}`}
                      />

                      {/* Velocity indicator */}
                      <div
                        className="w-full h-0.5 rounded-full transition-all"
                        style={{
                          backgroundColor: step.active ? ROW_COLORS[row] : "transparent",
                          opacity: step.velocity / 127,
                        }}
                      />

                      {/* Ratchet indicator */}
                      {step.ratchet > 1 && (
                        <Repeat size={6} className="text-gray-500" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Step numbers */}
      <div className="flex gap-0.5 mt-1 ml-[5.25rem]">
        {Array.from({ length: pattern.length }, (_, i) => (
          <div
            key={i}
            className={`flex-1 text-center text-[8px] font-mono ${
              isPlaying && currentStep === i ? "text-white font-bold" : "text-gray-600"
            }`}
          >
            {i + 1}
          </div>
        ))}
      </div>

      {/* BPM control */}
      <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-800/50">
        <Gauge size={12} className="text-gray-500" />
        <span className="text-[10px] text-gray-500 font-bold">BPM</span>
        <input
          type="number"
          value={bpm}
          onChange={(e) => onBpmChange(Math.max(20, Math.min(999, parseInt(e.target.value) || 120)))}
          className="w-16 bg-gray-800 border border-gray-700 rounded text-xs font-bold text-white text-center outline-none py-0.5"
        />
      </div>
    </motion.div>
  );
}
