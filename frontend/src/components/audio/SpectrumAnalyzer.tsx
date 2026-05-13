import { useEffect, useRef, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Activity, BarChart2, Circle } from "lucide-react";

type SpectrumMode = "bars" | "line" | "fill" | "circular";

interface SpectrumAnalyzerProps {
  fftData: Uint8Array | number[];
  sampleRate?: number;
  mode?: SpectrumMode;
  height?: number;
  showLabels?: boolean;
  color?: string;
  gradient?: string;
  smoothing?: number;
  barCount?: number;
  onPeakClick?: (frequency: number, magnitude: number) => void;
}

export function SpectrumAnalyzer({
  fftData,
  sampleRate = 48000,
  mode = "bars",
  height = 200,
  showLabels = true,
  color = "rgba(139, 92, 246, 0.9)",
  gradient,
  smoothing = 0.8,
  barCount = 64,
  onPeakClick,
}: SpectrumAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevDataRef = useRef<number[]>([]);
  
  const getGradientId = () => {
    if (!gradient) return "";
    const hash = gradient.split("").reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
    return `spectrum-grad-${Math.abs(hash)}`;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fftData.length) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const canvasHeight = rect.height;

    ctx.fillStyle = "rgb(10, 10, 25)";
    ctx.fillRect(0, 0, width, canvasHeight);

    let data: number[];
    if (fftData instanceof Uint8Array) {
      data = Array.from(fftData).map((v) => v / 255);
    } else {
      data = fftData.map((v) => Math.min(1, Math.max(0, v)));
    }

    if (smoothing > 0 && prevDataRef.current.length === data.length) {
      data = data.map((v, i) => v * (1 - smoothing) + prevDataRef.current[i] * smoothing);
    }
    prevDataRef.current = [...data];

    const binCount = data.length;
    const freqPerBin = sampleRate / 2 / binCount;

    if (mode === "bars") {
      const barsToShow = Math.min(barCount, binCount);
      const barWidth = width / barsToShow;
      const gap = Math.max(1, barWidth * 0.2);

      for (let i = 0; i < barsToShow; i++) {
        const startBin = Math.floor((i / barsToShow) * binCount);
        const endBin = Math.floor(((i + 1) / barsToShow) * binCount);
        
        let sum = 0;
        for (let b = startBin; b < endBin && b < binCount; b++) {
          sum += data[b];
        }
        const avg = sum / Math.max(1, endBin - startBin);

        const barH = avg * canvasHeight;
        const x = i * barWidth + gap / 2;
        const w = barWidth - gap;
        
        const gradient = ctx.createLinearGradient(0, canvasHeight, 0, canvasHeight - barH);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, "rgba(139, 92, 246, 0.3)");
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvasHeight - barH, w, barH);
        
        if (avg > 0.8) {
          ctx.fillStyle = "rgba(239, 68, 68, 0.8)";
          ctx.fillRect(x, canvasHeight - barH, w, 3);
        }
      }
    } else if (mode === "line") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      const step = width / data.length;
      for (let i = 0; i < data.length; i++) {
        const x = i * step;
        const y = canvasHeight - data[i] * canvasHeight;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.strokeStyle = "rgba(139, 92, 246, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const x = i * step;
        const y = canvasHeight - data[i] * canvasHeight * 0.7;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (mode === "fill") {
      ctx.beginPath();
      ctx.moveTo(0, canvasHeight);

      const step = width / data.length;
      for (let i = 0; i < data.length; i++) {
        const x = i * step;
        const y = canvasHeight - data[i] * canvasHeight;
        ctx.lineTo(x, y);
      }

      ctx.lineTo(width, canvasHeight);
      ctx.closePath();

      const fillGradient = ctx.createLinearGradient(0, canvasHeight, 0, 0);
      fillGradient.addColorStop(0, "rgba(139, 92, 246, 0.05)");
      fillGradient.addColorStop(0.5, "rgba(139, 92, 246, 0.4)");
      fillGradient.addColorStop(1, color);
      ctx.fillStyle = fillGradient;
      ctx.fill();
    } else if (mode === "circular") {
      const centerX = width / 2;
      const centerY = canvasHeight / 2;
      const maxRadius = Math.min(centerX, centerY) * 0.9;
      const minRadius = maxRadius * 0.2;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      for (let r = minRadius; r < maxRadius; r += (maxRadius - minRadius) / 4) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      for (let i = 0; i < data.length; i++) {
        const angle = (i / data.length) * Math.PI * 2 - Math.PI / 2;
        const radius = minRadius + data[i] * (maxRadius - minRadius);
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    if (showLabels && mode !== "circular") {
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "10px monospace";
      
      const freqLabels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
      for (const freq of freqLabels) {
        if (freq >= sampleRate / 2) continue;
        const bin = Math.floor((freq / (sampleRate / 2)) * binCount);
        if (bin >= binCount) continue;
        
        const x = mode === "bars" 
          ? (bin / binCount) * width * (barCount / binCount) + (barWidth / 2)
          : (bin / binCount) * width;
        
        if (x > 20 && x < width - 20) {
          ctx.fillText(freq >= 1000 ? `${freq / 1000}k` : `${freq}`, x - 10, canvasHeight - 4);
        }
      }
    }

  }, [fftData, sampleRate, mode, height, color, showLabels, smoothing, barCount]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg"
      style={{ height }}
    />
  );
}


interface SpectrumGraphProps {
  peaks: { frequency: number; magnitude: number; time: number }[];
  peakCount?: number;
  height?: number;
}

export function SpectrumGraph({ peaks, peakCount = 20, height = 150 }: SpectrumGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks.length) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const canvasHeight = rect.height;

    ctx.fillStyle = "rgb(10, 10, 25)";
    ctx.fillRect(0, 0, width, canvasHeight);

    const sorted = [...peaks].sort((a, b) => b.magnitude - a.magnitude).slice(0, peakCount);

    ctx.strokeStyle = "rgba(139, 92, 246, 0.2)";
    ctx.lineWidth = 1;
    for (let y = 0; y < canvasHeight; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const xStep = width / peakCount;
    sorted.forEach((peak, i) => {
      const x = i * xStep + xStep / 2;
      const barH = peak.magnitude * canvasHeight;

      const hue = 260 + (peak.frequency / 20000) * 60;
      ctx.fillStyle = `hsla(${hue}, 70%, 50%, 0.8)`;
      ctx.fillRect(x - 4, canvasHeight - barH, 8, barH);

      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.font = "9px monospace";
      ctx.fillText(
        peak.frequency >= 1000 ? `${(peak.frequency / 1000).toFixed(1)}k` : `${peak.frequency.toFixed(0)}`,
        x - 10,
        canvasHeight - barH - 5
      );
    });

  }, [peaks, peakCount, height]);

  return <canvas ref={canvasRef} className="w-full rounded-lg" style={{ height }} />;
}


interface OctaveBandsProps {
  bands: number[];
  labels?: string[];
  height?: number;
}

export function OctaveBands({ bands, labels, height = 80 }: OctaveBandsProps) {
  return (
    <div className="flex items-end justify-between gap-1 w-full" style={{ height }}>
      {bands.map((level, i) => {
        const percent = Math.max(0, Math.min(100, (level + 60) * (100 / 70)));
        const hue = level > -6 ? 120 : level > -12 ? 60 : 0;
        
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <motion.div
              className="w-full rounded-t"
              style={{
                height: `${percent}%`,
                background: `hsl(${hue}, 70%, 50%)`,
              }}
              initial={{ height: 0 }}
              animate={{ height: `${percent}%` }}
              transition={{ duration: 0.1 }}
            />
            <span className="text-xs text-gray-500 font-mono">
              {labels?.[i] ?? (i + 1).toString()}
            </span>
          </div>
        );
      })}
    </div>
  );
}


interface RealtimeLevelMeterProps {
  levels: { left: number; right: number };
  peakHold?: { left: number; right: number };
  showDb?: boolean;
}

export function RealtimeLevelMeter({ levels, peakHold, showDb = true }: RealtimeLevelMeterProps) {
  const leftDb = Math.max(-60, Math.min(0, 20 * Math.log10(Math.max(0.0001, levels.left))));
  const rightDb = Math.max(-60, Math.min(0, 20 * Math.log10(Math.max(0.0001, levels.right))));
  const leftPct = (leftDb + 60) * (100 / 60);
  const rightPct = (rightDb + 60) * (100 / 60);

  const leftPeakPct = peakHold ? (peakHold.left + 60) * (100 / 60) : null;
  const rightPeakPct = peakHold ? (peakHold.right + 60) * (100 / 60) : null;

  const getSegmentColor = (db: number) => {
    if (db > -3) return "bg-red-500";
    if (db > -6) return "bg-yellow-500";
    if (db > -12) return "bg-green-500";
    return "bg-green-600";
  };

  const dbMarks = [-48, -36, -24, -12, -6, -3, 0];

  return (
    <div className="flex gap-2 items-center">
      <div className="flex flex-col gap-0.5">
        {dbMarks.map((db) => (
          <div key={db} className="flex items-center gap-1">
            <span className="text-xs text-gray-500 w-8 text-right">{db}</span>
            <div className="w-24 h-1.5 bg-gray-900 rounded overflow-hidden relative">
              <div className={`absolute h-full ${getSegmentColor(db)}`} style={{ width: "100%" }} />
            </div>
          </div>
        ))}
      </div>
      
      <div className="flex gap-1">
        {["left", "right"].map((ch) => {
          const db = ch === "left" ? leftDb : rightDb;
          const pct = ch === "left" ? leftPct : rightPct;
          const peakPct = ch === "left" ? leftPeakPct : rightPeakPct;
          
          return (
            <div key={ch} className="flex flex-col items-center gap-1">
              <span className="text-xs text-gray-400">{ch === "left" ? "L" : "R"}</span>
              <div className="w-4 h-48 bg-gray-900 rounded overflow-hidden relative flex flex-col-reverse">
                <motion.div
                  className={`w-full ${getSegmentColor(db)}`}
                  style={{ height: `${pct}%` }}
                />
                {peakPct !== null && (
                  <div
                    className="absolute w-full h-0.5 bg-red-500"
                    style={{ bottom: `${peakPct}%` }}
                  />
                )}
              </div>
              {showDb && (
                <span className="text-xs font-mono text-gray-400">
                  {db.toFixed(1)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


interface LoudnessDisplayProps {
  integrated: number;
  shortTerm: number;
  momentary: number;
  range?: number;
}

export function LoudnessDisplay({ integrated, shortTerm, momentary, range }: LoudnessDisplayProps) {
  const formatLufs = (v: number) => v.toFixed(1);
  
  return (
    <div className="flex gap-4 items-center bg-gray-900 rounded-lg p-3">
      <div className="text-center">
        <div className="text-xs text-gray-500 mb-1">Integrated</div>
        <div className="text-2xl font-mono text-purple-400">{formatLufs(integrated)}</div>
        <div className="text-xs text-gray-600">LUFS</div>
      </div>
      <div className="h-10 w-px bg-gray-700" />
      <div className="text-center">
        <div className="text-xs text-gray-500 mb-1">Short Term</div>
        <div className="text-xl font-mono text-blue-400">{formatLufs(shortTerm)}</div>
        <div className="text-xs text-gray-600">LUFS</div>
      </div>
      <div className="h-10 w-px bg-gray-700" />
      <div className="text-center">
        <div className="text-xs text-gray-500 mb-1">Momentary</div>
        <div className="text-xl font-mono text-green-400">{formatLufs(momentary)}</div>
        <div className="text-xs text-gray-600">LUFS</div>
      </div>
      {range !== undefined && (
        <>
          <div className="h-10 w-px bg-gray-700" />
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">Range</div>
            <div className="text-xl font-mono text-yellow-400">{formatLufs(range)}</div>
            <div className="text-xs text-gray-600">LU</div>
          </div>
        </>
      )}
    </div>
  );
}


interface StereoCorrelationProps {
  correlation: number;
}

export function StereoCorrelation({ correlation }: StereoCorrelationProps) {
  const pct = ((correlation + 1) / 2) * 100;
  const color = correlation > 0 ? "bg-green-500" : correlation < -0.3 ? "bg-red-500" : "bg-yellow-500";
  
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500">Stereo</span>
      <div className="relative w-24 h-3 bg-gray-900 rounded">
        <div className="absolute left-0 top-0 h-full bg-gray-700 rounded" style={{ width: "50%" }} />
        <motion.div
          className={`absolute top-0 h-full w-2 ${color}`}
          style={{ left: `calc(${pct}% - 4px)` }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
        />
      </div>
      <span className="text-xs font-mono text-gray-400 w-16">
        {correlation > 0 ? "+" : ""}{correlation.toFixed(2)}
      </span>
    </div>
  );
}


interface PhaseAnalysisProps {
  left: number[];
  right: number[];
  sampleRate?: number;
}

export function PhaseAnalysis({ left, right, sampleRate = 48000 }: PhaseAnalysisProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || left.length === 0 || right.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "rgb(10, 10, 25)";
    ctx.fillRect(0, 0, rect.width, rect.height);

    const width = rect.width;
    const height = rect.height;
    
    const step = Math.max(1, Math.floor(left.length / width));
    
    ctx.strokeStyle = "rgba(139, 92, 246, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    for (let x = 0; x < width; x++) {
      const idx = Math.min(x * step, left.length - 1);
      const y = ((left[idx] - right[idx]) + 2) / 4 * height;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

  }, [left, right, sampleRate]);

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>L</span>
        <span>Phase</span>
        <span>R</span>
      </div>
      <canvas ref={canvasRef} className="w-full h-16 rounded" />
    </div>
  );
}


interface SpectrumControlsProps {
  mode: SpectrumMode;
  smoothing: number;
  barCount: number;
  onModeChange: (mode: SpectrumMode) => void;
  onSmoothingChange: (value: number) => void;
  onBarCountChange: (value: number) => void;
}

export function SpectrumControls({
  mode,
  smoothing,
  barCount,
  onModeChange,
  onSmoothingChange,
  onBarCountChange,
}: SpectrumControlsProps) {
  const modes: { value: SpectrumMode; icon: typeof Activity; label: string }[] = [
    { value: "bars", icon: BarChart2, label: "Bars" },
    { value: "line", icon: Activity, label: "Line" },
    { value: "fill", icon: BarChart2, label: "Fill" },
    { value: "circular", icon: Circle, label: "Circle" },
  ];

  return (
    <div className="flex gap-4 items-center bg-gray-900 rounded-lg p-2">
      <div className="flex gap-1">
        {modes.map((m) => (
          <button
            key={m.value}
            onClick={() => onModeChange(m.value)}
            className={`p-2 rounded transition-colors ${
              mode === m.value ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
            title={m.label}
          >
            <m.icon size={16} />
          </button>
        ))}
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Smooth</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={smoothing}
          onChange={(e) => onSmoothingChange(parseFloat(e.target.value))}
          className="w-20"
        />
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Bars</span>
        <input
          type="range"
          min="16"
          max="256"
          step="16"
          value={barCount}
          onChange={(e) => onBarCountChange(parseInt(e.target.value))}
          className="w-20"
        />
      </div>
    </div>
  );
}