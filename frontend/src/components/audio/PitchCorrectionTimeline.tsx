import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Pitch, Music, Eye, EyeOff, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface PitchCorrectionData {
  time: number;
  original: number;
  corrected: number;
  confidence: number;
  correction: number;
}

interface PitchCorrectionTimelineProps {
  f0Data: number[];
  correctedF0: number[];
  confidence: number[];
  correctionCents: number[];
  sampleRate: number;
  duration: number;
  onCorrectionEdit?: (index: number, newValue: number) => void;
}

export function PitchCorrectionTimeline({
  f0Data,
  correctedF0,
  confidence,
  correctionCents,
  sampleRate,
  duration,
  onCorrectionEdit,
}: PitchCorrectionTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [showOriginal, setShowOriginal] = useState(true);
  const [showCorrected, setShowCorrected] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  const width = 800 * zoom;
  const height = 300;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !f0Data.length) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "rgb(15, 15, 25)";
    ctx.fillRect(0, 0, width, height);

    const minHz = 80;
    const maxHz = 800;
    const pitchToY = (hz: number) => {
      const logMin = Math.log10(minHz);
      const logMax = Math.log10(maxHz);
      return height - ((Math.log10(Math.max(hz, minHz)) - logMin) / (logMax - logMin)) * height;
    };

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    for (const hz of [100, 200, 300, 400, 500, 600, 700]) {
      const y = pitchToY(hz);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.font = "10px monospace";
      ctx.fillText(`${hz}Hz`, 5, y - 5);
    }

    const numFrames = f0Data.length;
    const xStep = width / numFrames;

    if (showOriginal && f0Data.length > 0) {
      ctx.strokeStyle = "rgba(239, 68, 68, 0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();

      for (let i = 0; i < numFrames; i++) {
        const x = i * xStep;
        const y = f0Data[i] > 0 ? pitchToY(f0Data[i]) : height;

        if (confidence[i] > 0.5) {
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    if (showCorrected && correctedF0.length > 0) {
      ctx.strokeStyle = "rgba(34, 197, 94, 0.8)";
      ctx.lineWidth = 3;
      ctx.beginPath();

      for (let i = 0; i < correctedF0.length && i < numFrames; i++) {
        const x = i * xStep;
        const y = correctedF0[i] > 0 ? pitchToY(correctedF0[i]) : height;

        if (confidence[i] > 0.5) {
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    if (correctionCents.length > 0 && numFrames > 0) {
      const correctionHeight = 40;
      const correctionY = height - 50;

      for (let i = 0; i < numFrames; i++) {
        if (confidence[i] < 0.5) continue;

        const x = i * xStep;
        const cents = correctionCents[i];
        const barHeight = Math.abs(cents) / 100 * correctionHeight;

        const color = cents > 0 ? "rgba(59, 130, 246, 0.6)" : "rgba(168, 85, 247, 0.6)";
        ctx.fillStyle = color;
        ctx.fillRect(x - 1, correctionY - barHeight, 2, barHeight);
      }

      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, correctionY);
      ctx.lineTo(width, correctionY);
      ctx.stroke();
    }

    if (hoverIndex !== null && hoverIndex < numFrames) {
      const x = hoverIndex * xStep;
      const time = hoverIndex / sampleRate * (f0Data.length / duration);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();

      const infoX = Math.min(x + 10, width - 150);
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(infoX, 10, 140, 80);
      ctx.fillStyle = "white";
      ctx.font = "11px monospace";
      ctx.fillText(`Time: ${time.toFixed(3)}s`, infoX + 5, 28);
      ctx.fillText(`F0: ${f0Data[hoverIndex]?.toFixed(1) || 0}Hz`, infoX + 5, 45);
      ctx.fillText(`Corr: ${correctedF0[hoverIndex]?.toFixed(1) || 0}Hz`, infoX + 5, 62);
      ctx.fillText(`${correctionCents[hoverIndex]?.toFixed(0) || 0} cents`, infoX + 5, 79);
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    const numMarkers = Math.floor(duration);
    for (let t = 0; t <= numMarkers; t++) {
      const x = (t / duration) * width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fillText(`${t}s`, x + 2, height - 5);
    }

  }, [f0Data, correctedF0, confidence, correctionCents, width, height, showOriginal, showCorrected, hoverIndex, duration, sampleRate]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || f0Data.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const index = Math.floor((x / width) * f0Data.length);
    setHoverIndex(Math.max(0, Math.min(index, f0Data.length - 1)));
  }, [width, f0Data.length]);

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-medium flex items-center gap-2">
          <Pitch size={18} />
          Pitch Correction Timeline
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className={`p-2 rounded ${showOriginal ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400"}`}
            title="Toggle Original Pitch"
          >
            <Eye size={16} />
          </button>
          <button
            onClick={() => setShowCorrected(!showCorrected)}
            className={`p-2 rounded ${showCorrected ? "bg-green-600 text-white" : "bg-gray-800 text-gray-400"}`}
            title="Toggle Corrected Pitch"
          >
            <Eye size={16} />
          </button>
          <button
            onClick={() => setZoom(Math.max(1, zoom - 0.5))}
            className="p-2 bg-gray-800 text-gray-400 rounded hover:bg-gray-700"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={() => setZoom(Math.min(5, zoom + 0.5))}
            className="p-2 bg-gray-800 text-gray-400 rounded hover:bg-gray-700"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={() => { setZoom(1); setScrollOffset(0); }}
            className="p-2 bg-gray-800 text-gray-400 rounded hover:bg-gray-700"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        <canvas
          ref={canvasRef}
          style={{ width, height }}
          className="rounded-lg"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIndex(null)}
        />
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-red-500" />
            <span>Original</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-green-500" />
            <span>Corrected</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 opacity-60" />
          <span>Pitch Up</span>
          <div className="w-3 h-3 bg-purple-500 opacity-60" />
          <span>Pitch Down</span>
        </div>
      </div>
    </div>
  );
}


interface CorrectionStatsProps {
  correctionCents: number[];
  confidence: number[];
  sampleRate: number;
}

export function CorrectionStats({ correctionCents, confidence, sampleRate }: CorrectionStatsProps) {
  const validCorrections = correctionCents.filter((_, i) => confidence[i] > 0.5);
  
  const avgCorrection = validCorrections.length > 0 
    ? validCorrections.reduce((a, b) => a + Math.abs(b), 0) / validCorrections.length 
    : 0;
  
  const maxCorrection = validCorrections.length > 0 
    ? Math.max(...validCorrections.map(Math.abs)) 
    : 0;
  
  const totalNotes = confidence.filter(c => c > 0.5).length;
  const correctedNotes = validCorrections.length;

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <h3 className="text-white font-medium flex items-center gap-2 mb-4">
        <Music size={18} />
        Correction Statistics
      </h3>

      <div className="grid grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-mono text-purple-400">{correctedNotes}</div>
          <div className="text-xs text-gray-500">Notes Corrected</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-mono text-blue-400">{avgCorrection.toFixed(1)}</div>
          <div className="text-xs text-gray-500">Avg Cents</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-mono text-green-400">{maxCorrection.toFixed(0)}</div>
          <div className="text-xs text-gray-500">Max Cents</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-mono text-yellow-400">
            {totalNotes > 0 ? ((correctedNotes / totalNotes) * 100).toFixed(0) : 0}%
          </div>
          <div className="text-xs text-gray-500">Correction Rate</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs text-gray-500 mb-2">Correction Distribution</div>
        <div className="flex gap-1 h-8">
          {[-50, -25, 0, 25, 50].map((threshold, i) => {
            const count = validCorrections.filter(c => Math.abs(c) >= threshold && Math.abs(c) < (i < 4 ? [25, 50, 100, 200][i] : 999)).length;
            const pct = validCorrections.length > 0 ? (count / validCorrections.length) * 100 : 0;
            return (
              <div
                key={threshold}
                className="flex-1 bg-purple-900 rounded-t"
                style={{ height: `${pct}%` }}
                title={`${count} notes`}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-gray-600 mt-1">
          <span>-50</span>
          <span>-25</span>
          <span>0</span>
          <span>+25</span>
          <span>+50</span>
        </div>
      </div>
    </div>
  );
}