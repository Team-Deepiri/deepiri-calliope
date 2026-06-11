import { useRef, useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { ZoomIn, ZoomOut, Grid3X3, Maximize2, Scissors } from "lucide-react";

interface ClipData {
  id: string;
  audioBuffer?: AudioBuffer;
  waveformData: number[];
  duration: number;
  sampleRate: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  startOffset: number;
  loopStart?: number;
  loopEnd?: number;
  pitchShift?: number;
  timeStretch?: number;
}

interface AudioClipEditorProps {
  clipData: ClipData;
  onEdit: (updates: Partial<ClipData>) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  snapToGrid: boolean;
}

function generateMockWaveform(length = 256): number[] {
  const result: number[] = [];
  for (let i = 0; i < length; i++) {
    const t = i / length;
    const env = Math.sin(t * Math.PI) * 0.8 + 0.2;
    result.push((Math.sin(t * 80) * 0.3 + Math.sin(t * 40) * 0.2 + Math.random() * 0.3) * env);
  }
  return result;
}

export function AudioClipEditor({
  clipData, onEdit, zoom, onZoomChange, snapToGrid,
}: AudioClipEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [draggingFade, setDraggingFade] = useState<"in" | "out" | "gain" | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });

  const waveform = clipData.waveformData.length > 0 ? clipData.waveformData : generateMockWaveform(256);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    const centerY = h / 2;
    const ampHeight = h * 0.4;

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    const visibleSamples = Math.min(waveform.length, Math.floor(waveform.length * zoom));
    const step = waveform.length / visibleSamples;
    const xScale = w / visibleSamples;

    for (let x = 0; x < visibleSamples; x++) {
      const idx = Math.floor(x * step);
      const sample = waveform[idx] || 0;
      const drawX = x * xScale;

      ctx.fillStyle = "#3b82f6";
      ctx.fillRect(drawX, centerY - sample * ampHeight, Math.max(1, xScale), sample * ampHeight * 2);
    }

    // Gain line
    const gainY = centerY - (clipData.gain * 0.5) * ampHeight;
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, gainY);
    ctx.lineTo(w, gainY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Fade in curve
    if (clipData.fadeIn > 0) {
      const fadeWidth = clipData.fadeIn * w;
      ctx.strokeStyle = "#eab308";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const x = t * fadeWidth;
        const y = centerY - Math.sin(t * Math.PI / 2) * ampHeight;
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Fade handle
      ctx.fillStyle = "#eab308";
      ctx.beginPath();
      ctx.arc(fadeWidth, centerY - ampHeight, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fade out curve
    if (clipData.fadeOut > 0) {
      const fadeWidth = clipData.fadeOut * w;
      const fadeStart = w - fadeWidth;
      ctx.strokeStyle = "#eab308";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(fadeStart, centerY);
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const x = fadeStart + t * fadeWidth;
        const y = centerY - Math.sin((1 - t) * Math.PI / 2) * ampHeight;
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = "#eab308";
      ctx.beginPath();
      ctx.arc(fadeStart, centerY - ampHeight, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Loop markers
    if (clipData.loopStart !== undefined) {
      const lx = clipData.loopStart * w;
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (clipData.loopEnd !== undefined) {
      const lx = clipData.loopEnd * w;
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, h);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Selection
    if (selection) {
      const sx = selection.start * w;
      const ex = selection.end * w;
      ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
      ctx.fillRect(sx, 0, ex - sx, h);
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 1;
      ctx.strokeRect(sx, 0, ex - sx, h);
    }
  }, [waveform, clipData, zoom, selection]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw]);

  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Check fade handles
    const fadeInEnd = clipData.fadeIn;
    const fadeOutStart = 1 - clipData.fadeOut;

    if (Math.abs(x - fadeInEnd) < 0.03 && y < 0.3) {
      setDraggingFade("in");
      return;
    }
    if (Math.abs(x - fadeOutStart) < 0.03 && y < 0.3) {
      setDraggingFade("out");
      return;
    }
    if (Math.abs(y - 0.5) < 0.05) {
      setDraggingFade("gain");
      setDragPos({ x: 0, y: e.clientY });
      return;
    }

    // Region selection
    const startX = x;
    const onMove = (ev: PointerEvent) => {
      const cx = (ev.clientX - rect.left) / rect.width;
      setSelection({ start: Math.min(startX, cx), end: Math.max(startX, cx) });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [clipData]);

  useEffect(() => {
    if (!draggingFade) return;
    const onMove = (ev: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (draggingFade === "in") {
        const val = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        onEdit({ fadeIn: val });
      } else if (draggingFade === "out") {
        const val = Math.max(0, Math.min(1, (rect.right - ev.clientX) / rect.width));
        onEdit({ fadeOut: val });
      } else if (draggingFade === "gain") {
        const dy = (dragPos.y - ev.clientY) / rect.height;
        const newGain = Math.max(-6, Math.min(6, clipData.gain + dy * 6));
        onEdit({ gain: Math.round(newGain * 10) / 10 });
      }
    };
    const onUp = () => {
      setDraggingFade(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [draggingFade, dragPos, clipData, onEdit]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="audio-clip-editor bg-gray-950 rounded-2xl border border-gray-800 p-4 shadow-2xl"
    >
      {/* Controls */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white">Waveform Editor</span>
          <span className="text-[9px] font-mono text-gray-500">
            {clipData.duration.toFixed(1)}s @ {clipData.sampleRate / 1000}kHz
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <button
            onClick={() => onZoomChange(Math.max(0.1, zoom / 1.5))}
            className="p-1.5 rounded bg-gray-800 text-gray-400 hover:text-white transition-all"
            title="Zoom Out"
          >
            <ZoomOut size={12} />
          </button>
          <span className="text-[10px] font-mono text-gray-500 w-10 text-center">
            {zoom.toFixed(1)}x
          </span>
          <button
            onClick={() => onZoomChange(Math.min(10, zoom * 1.5))}
            className="p-1.5 rounded bg-gray-800 text-gray-400 hover:text-white transition-all"
            title="Zoom In"
          >
            <ZoomIn size={12} />
          </button>

          <div className="w-px h-4 bg-gray-800 mx-1" />

          {/* Snap to grid */}
          <button
            onClick={() => onEdit({ ...clipData }) }
            className={`p-1.5 rounded transition-all ${
              snapToGrid ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-500"
            }`}
            title="Snap to Grid"
          >
            <Grid3X3 size={12} />
          </button>

          {/* Fit to window */}
          <button
            onClick={() => onZoomChange(1)}
            className="p-1.5 rounded bg-gray-800 text-gray-500 hover:text-white transition-all"
            title="Fit to Window"
          >
            <Maximize2 size={12} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative w-full h-48 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden cursor-crosshair"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          className="absolute inset-0"
        />

        {/* Selection toolbar */}
        {selection && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-gray-900/90 border border-gray-700 rounded-lg px-2 py-1">
            <span className="text-[9px] font-mono text-gray-400">
              {(selection.end - selection.start) * 100}%
            </span>
            <button
              onClick={() => setSelection(null)}
              className="p-0.5 rounded bg-gray-800 text-gray-500 hover:text-white transition-all"
              title="Clear Selection"
            >
              <Scissors size={10} />
            </button>
          </div>
        )}
      </div>

      {/* Warp / stretch controls */}
      <div className="grid grid-cols-2 gap-4 mt-3">
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-gray-500 uppercase">Pitch Shift (st)</label>
          <input
            type="range"
            min={-12}
            max={12}
            step={0.1}
            value={clipData.pitchShift ?? 0}
            onChange={(e) => onEdit({ pitchShift: Number(e.target.value) })}
            className="w-full accent-blue-500"
          />
          <span className="text-[9px] font-mono text-gray-400">{(clipData.pitchShift ?? 0).toFixed(1)} semitones</span>
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-bold text-gray-500 uppercase">Time Stretch</label>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.01}
            value={clipData.timeStretch ?? 1}
            onChange={(e) => onEdit({ timeStretch: Number(e.target.value) })}
            className="w-full accent-purple-500"
          />
          <span className="text-[9px] font-mono text-gray-400">{(clipData.timeStretch ?? 1).toFixed(2)}×</span>
        </div>
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between mt-2 text-[9px] font-mono text-gray-600">
        <span>Gain: {clipData.gain.toFixed(1)} dB</span>
        <span>Fade In: {(clipData.fadeIn * 100).toFixed(0)}%</span>
        <span>Fade Out: {(clipData.fadeOut * 100).toFixed(0)}%</span>
        {clipData.loopStart !== undefined && (
          <span>Loop: {clipData.loopStart.toFixed(2)} - {clipData.loopEnd?.toFixed(2)}</span>
        )}
        {(clipData.pitchShift ?? 0) !== 0 && (
          <span>Pitch: {(clipData.pitchShift ?? 0).toFixed(1)}st</span>
        )}
        {(clipData.timeStretch ?? 1) !== 1 && (
          <span>Stretch: {(clipData.timeStretch ?? 1).toFixed(2)}×</span>
        )}
      </div>
    </motion.div>
  );
}
