import { useState, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { Grid3x3, Music, SlidersHorizontal, Zap, Layers } from "lucide-react";

interface QuantizeGridProps {
  tempo: number;
  beatsPerBar?: number;
  subdivisions?: number;
  audioPeaks?: number[];
  onGridClick?: (bar: number, beat: number, subdivision: number) => void;
  height?: number;
}

export function QuantizeGrid({
  tempo,
  beatsPerBar = 4,
  subdivisions = 4,
  audioPeaks,
  onGridClick,
  height = 200,
}: QuantizeGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverCell, setHoverCell] = useState<{ bar: number; beat: number; sub: number } | null>(null);
  const [activeCells, setActiveCells] = useState<Set<string>>(new Set());

  const msPerBeat = 60000 / tempo;
  const msPerBar = msPerBeat * beatsPerBar;
  const msPerSubdivision = msPerBeat / subdivisions;

  const totalBars = 8;
  const totalBeats = totalBars * beatsPerBar;
  const totalSubdivisions = totalBeats * subdivisions;

  const gridColumns = totalBeats;
  const gridRows = subdivisions;

  const cellWidth = 100 / gridColumns;
  const cellHeight = 100 / gridRows;

  const normalizedPeaks = useMemo(() => {
    if (!audioPeaks || audioPeaks.length === 0) return [];
    const maxPeak = Math.max(...audioPeaks.map(Math.abs), 0.01);
    return audioPeaks.map((p) => p / maxPeak);
  }, [audioPeaks]);

  const handleCellClick = useCallback(
    (bar: number, beat: number, sub: number) => {
      const cellKey = `${bar}-${beat}-${sub}`;
      setActiveCells((prev) => {
        const next = new Set(prev);
        if (next.has(cellKey)) {
          next.delete(cellKey);
        } else {
          next.add(cellKey);
        }
        return next;
      });
      onGridClick?.(bar, beat, sub);
    },
    [onGridClick]
  );

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-medium flex items-center gap-2">
          <Grid3x3 size={18} />
          Quantize Grid
        </h3>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-gray-400">
            <span className="text-gray-500">Tempo:</span> {tempo} BPM
          </div>
          <div className="text-gray-400">
            <span className="text-gray-500">Grid:</span> {beatsPerBar}/{subdivisions}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-8 gap-0.5">
        {Array.from({ length: totalBars }).map((_, barIdx) => (
          <div key={barIdx} className="flex flex-col gap-0.5">
            <div className="text-xs text-gray-600 text-center mb-1">{barIdx + 1}</div>
            {Array.from({ length: subdivisions }).map((_, subIdx) => (
              <div
                key={subIdx}
                className={`h-4 rounded-sm transition-all ${
                  subIdx === 0 ? "bg-gray-700" : "bg-gray-800"
                }`}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {["1/4", "1/8", "1/16", "1/32"].map((div, i) => (
            <button
              key={div}
              className={`px-3 py-1 rounded text-xs ${
                subdivisions === [4, 8, 16, 32][i] ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400"
              }`}
            >
              {div}
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-500">
          {msPerSubdivision.toFixed(0)}ms per subdivision
        </div>
      </div>

      {normalizedPeaks.length > 0 && (
        <div className="mt-4">
          <div className="text-xs text-gray-500 mb-2">Audio Energy</div>
          <div className="flex items-end gap-0.5 h-16">
            {normalizedPeaks.map((peak, i) => (
              <motion.div
                key={i}
                className="flex-1 bg-purple-600 rounded-t"
                initial={{ height: 0 }}
                animate={{ height: `${peak * 100}%` }}
                transition={{ duration: 0.1 }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


interface RhythmGridProps {
  onPatternSelect?: (pattern: number[]) => void;
}

export function RhythmGrid({ onPatternSelect }: RhythmGridProps) {
  const [pattern, setPattern] = useState<number[]>([1, 0, 0, 1, 0, 0, 1, 0]);
  const steps = 8;

  const toggleStep = (index: number) => {
    const newPattern = [...pattern];
    newPattern[index] = newPattern[index] === 1 ? 0 : 1;
    setPattern(newPattern);
    onPatternSelect?.(newPattern);
  };

  const clearPattern = () => {
    setPattern(Array(steps).fill(0));
    onPatternSelect?.(Array(steps).fill(0));
  };

  const randomize = () => {
    const newPattern = Array(steps)
      .fill(0)
      .map(() => (Math.random() > 0.6 ? 1 : 0));
    setPattern(newPattern);
    onPatternSelect?.(newPattern);
  };

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-medium flex items-center gap-2">
          <Zap size={18} />
          Rhythm Grid
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={clearPattern}
            className="px-3 py-1 bg-gray-800 text-gray-400 rounded text-xs hover:bg-gray-700"
          >
            Clear
          </button>
          <button
            onClick={randomize}
            className="px-3 py-1 bg-gray-800 text-gray-400 rounded text-xs hover:bg-gray-700"
          >
            Random
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1">
        {pattern.map((step, i) => (
          <motion.button
            key={i}
            onClick={() => toggleStep(i)}
            className={`w-10 h-16 rounded-lg flex items-center justify-center transition-colors ${
              step === 1 ? "bg-purple-600" : "bg-gray-800 hover:bg-gray-700"
            }`}
            whileTap={{ scale: 0.95 }}
          >
            <span className="text-xs text-gray-400">{i + 1}</span>
          </motion.button>
        ))}
      </div>

      <div className="mt-4 flex justify-center gap-8">
        {[0, 2, 4, 6].map((beat) => (
          <div key={beat} className="text-xs text-gray-600">
            {beat / 2 + 1}
          </div>
        ))}
      </div>

      <div className="mt-4 text-xs text-gray-500 text-center">
        {pattern.join(" ")} — {pattern.filter((s) => s === 1).length} hits
      </div>
    </div>
  );
}


interface LayerStackProps {
  layers: { name: string; color: string; active: boolean }[];
  onToggle?: (index: number) => void;
}

export function LayerStack({ layers, onToggle }: LayerStackProps) {
  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <h3 className="text-white font-medium flex items-center gap-2 mb-4">
        <Layers size={18} />
        Audio Layers
      </h3>

      <div className="space-y-2">
        {layers.map((layer, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
              layer.active ? "bg-gray-800" : "bg-gray-900 opacity-50"
            }`}
            onClick={() => onToggle?.(i)}
          >
            <div className={`w-3 h-8 rounded ${layer.color}`} />
            <span className="flex-1 text-sm text-gray-300">{layer.name}</span>
            <div className={`w-4 h-4 rounded border ${
              layer.active ? "bg-purple-600 border-purple-600" : "border-gray-600"
            }`} />
          </div>
        ))}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        {layers.filter((l) => l.active).length} / {layers.length} active layers
      </div>
    </div>
  );
}


interface GrooveControlsProps {
  swing: number;
  feel: "straight" | "swing" | "shuffle";
  onSwingChange?: (value: number) => void;
  onFeelChange?: (feel: "straight" | "swing" | "shuffle") => void;
}

export function GrooveControls({
  swing,
  feel,
  onSwingChange,
  onFeelChange,
}: GrooveControlsProps) {
  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <h3 className="text-white font-medium flex items-center gap-2 mb-4">
        <Music size={18} />
        Groove Controls
      </h3>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">Swing</span>
            <span className="text-white">{Math.round(swing * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={swing}
            onChange={(e) => onSwingChange?.(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>Straight</span>
            <span>Swing</span>
          </div>
        </div>

        <div>
          <div className="text-sm text-gray-400 mb-2">Feel</div>
          <div className="flex gap-2">
            {(["straight", "swing", "shuffle"] as const).map((f) => (
              <button
                key={f}
                onClick={() => onFeelChange?.(f)}
                className={`flex-1 py-2 rounded text-sm capitalize ${
                  feel === f ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 p-3 bg-gray-800 rounded">
        <div className="text-xs text-gray-500 mb-2">Visualization</div>
        <div className="flex justify-center gap-1">
          {[0, 1, 2, 3].map((beat) => (
            <div key={beat} className="flex flex-col items-center gap-1">
              <div className="w-2 h-2 bg-gray-600 rounded-full" />
              <div className="flex gap-0.5">
                <div className={`w-1 h-4 rounded ${swing > 0.3 ? "bg-purple-600" : "bg-gray-700"}`} />
                <div className="w-1 h-4 rounded bg-gray-700" />
              </div>
              <span className="text-xs text-gray-600">{beat + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}