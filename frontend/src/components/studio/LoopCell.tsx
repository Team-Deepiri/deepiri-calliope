import { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Star, GripVertical } from "lucide-react";

export interface LoopData {
  id: string;
  name: string;
  bpm: number;
  key: string;
  category: string;
  color: string;
  duration: number;
  bars: number;
  tags: string[];
  waveformPeaks?: number[];
  fileSize?: number;
  dateAdded?: string;
}

interface LoopCellProps {
  loop: LoopData;
  onPlay?: (loop: LoopData) => void;
  onDragStart?: (loop: LoopData, e: React.PointerEvent) => void;
  onToggleFavorite?: (loopId: string) => void;
  isPlaying?: boolean;
  isFavorite?: boolean;
  previewProgress?: number;
}

export function LoopCell({
  loop,
  onPlay,
  onDragStart,
  onToggleFavorite,
  isPlaying = false,
  isFavorite = false,
  previewProgress = 0,
}: LoopCellProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "rgba(15, 15, 30, 0.6)";
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 4);
    ctx.fill();

    const peaks =
      loop.waveformPeaks ??
      Array.from({ length: 48 }, () => Math.random() * 0.8 + 0.2);

    ctx.fillStyle = loop.color;
    const barWidth = width / peaks.length;

    for (let i = 0; i < peaks.length; i++) {
      const barHeight = peaks[i] * height * 0.8;
      const x = i * barWidth;
      const y = (height - barHeight) / 2;
      ctx.globalAlpha = isPlaying ? 1 : 0.6;
      ctx.fillRect(x + 1, y, Math.max(barWidth - 2, 1), barHeight);
    }

    ctx.globalAlpha = 1;

    if (previewProgress > 0) {
      const progressX = width * previewProgress;
      ctx.fillStyle = `${loop.color}40`;
      ctx.fillRect(0, 0, progressX, height);
    }

    ctx.strokeStyle = `${loop.color}30`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }, [loop, isPlaying, previewProgress]);

  const handlePlay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onPlay?.(loop);
    },
    [loop, onPlay],
  );

  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      onDragStart?.(loop, e);
    },
    [loop, onDragStart],
  );

  const handleToggleFavorite = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleFavorite?.(loop.id);
    },
    [loop.id, onToggleFavorite],
  );

  return (
    <motion.div
      layout
      className="relative bg-gray-900/60 border border-gray-800/50 rounded-xl overflow-hidden cursor-pointer group"
      whileHover={{ scale: 1.02, borderColor: "rgba(59, 130, 246, 0.3)" }}
      whileTap={{ scale: 0.98 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-gray-100 truncate">{loop.name}</h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">
                {loop.bpm} BPM
              </span>
              <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-full">
                {loop.key}
              </span>
            </div>
          </div>
          <motion.button
            onClick={handleToggleFavorite}
            whileTap={{ scale: 0.8 }}
            className={`p-1 rounded-lg transition-colors ${
              isFavorite
                ? "text-yellow-400 bg-yellow-500/10"
                : "text-gray-600 hover:text-gray-400 opacity-0 group-hover:opacity-100"
            }`}
          >
            <Star size={14} fill={isFavorite ? "currentColor" : "none"} />
          </motion.button>
        </div>

        <div className="relative">
          <canvas
            ref={canvasRef}
            className="w-full h-12 rounded-lg"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
              style={{
                backgroundColor: `${loop.color}20`,
                color: loop.color,
              }}
            >
              {loop.category}
            </span>
            {loop.bars > 0 && (
              <span className="text-[9px] font-mono text-gray-500">
                {loop.bars} bars
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <motion.button
              onClick={handlePlay}
              whileTap={{ scale: 0.85 }}
              className={`flex items-center justify-center w-8 h-8 rounded-full transition-all ${
                isPlaying
                  ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
              }`}
            >
              {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            </motion.button>

            <motion.button
              onPointerDown={handleDragPointerDown}
              whileTap={{ scale: 0.9 }}
              className="p-1.5 rounded-lg text-gray-600 hover:text-gray-400 hover:bg-gray-800 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
              title="Drag to track"
            >
              <GripVertical size={14} />
            </motion.button>
          </div>
        </div>
      </div>

      {previewProgress > 0 && (
        <motion.div
          className="absolute bottom-0 left-0 h-0.5 bg-blue-500"
          style={{ width: `${previewProgress * 100}%` }}
          layout
        />
      )}
    </motion.div>
  );
}
