import { useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";

interface WaveformDisplayProps {
  peaks: number[];
  duration: number;
  playedRange?: [number, number];
  pitchData?: number[];
  correctionData?: number[];
  height?: number;
  color?: string;
  pitchColor?: string;
}

export function WaveformDisplay({
  peaks,
  duration,
  playedRange,
  pitchData,
  correctionData,
  height = 100,
  color = "rgba(139, 92, 246, 0.8)",
  pitchColor = "rgba(239, 68, 68, 0.6)",
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const normalizedPeaks = useMemo(() => {
    if (!peaks.length) return [];
    const maxPeak = Math.max(...peaks.map(Math.abs), 0.01);
    return peaks.map((p) => p / maxPeak);
  }, [peaks]);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !normalizedPeaks.length) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const canvasHeight = rect.height;
    
    ctx.fillStyle = "rgb(15, 15, 25)";
    ctx.fillRect(0, 0, width, canvasHeight);
    
    if (playedRange) {
      const [start, end] = playedRange;
      const startX = (start / duration) * width;
      const endX = (end / duration) * width;
      ctx.fillStyle = "rgba(59, 130, 246, 0.3)";
      ctx.fillRect(startX, 0, endX - startX, canvasHeight);
    }
    
    ctx.fillStyle = color;
    const barWidth = width / normalizedPeaks.length;
    
    for (let i = 0; i < normalizedPeaks.length; i++) {
      const x = i * barWidth;
      const peakHeight = Math.abs(normalizedPeaks[i]) * (canvasHeight / 2);
      const y = (canvasHeight / 2) - peakHeight;
      
      ctx.fillRect(x, y, Math.max(barWidth - 1, 1), peakHeight * 2);
    }
    
    if (pitchData && pitchData.length > 0) {
      ctx.strokeStyle = pitchColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      const xStep = width / pitchData.length;
      
      for (let i = 0; i < pitchData.length; i++) {
        const x = i * xStep;
        const y = canvasHeight - (pitchData[i] / 1000) * canvasHeight;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();
    }
    
    if (correctionData && correctionData.length > 0) {
      ctx.strokeStyle = "rgba(34, 197, 94, 0.6)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      
      const xStep = width / correctionData.length;
      
      for (let i = 0; i < correctionData.length; i++) {
        const x = i * xStep;
        const y = canvasHeight - (correctionData[i] / 1000) * canvasHeight;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.stroke();
      ctx.setLineDash([]);
    }
    
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvasHeight / 2);
    ctx.lineTo(width, canvasHeight / 2);
    ctx.stroke();
    
  }, [normalizedPeaks, duration, playedRange, pitchData, correctionData, color, pitchColor]);
  
  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg"
      style={{ height }}
    />
  );
}

interface PitchVisualizerProps {
  f0Data: number[];
  targetF0: number[];
  confidence: number[];
  sampleRate: number;
  width?: number;
  height?: number;
}

export function PitchVisualizer({
  f0Data,
  targetF0,
  confidence,
  sampleRate,
  width = 600,
  height = 80,
}: PitchVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !f0Data.length) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    
    ctx.fillStyle = "rgb(10, 10, 20)";
    ctx.fillRect(0, 0, width, height);
    
    const minHz = 50;
    const maxHz = 1000;
    const binHeight = height / f0Data.length;
    
    for (let i = 0; i < f0Data.length; i++) {
      const f0 = f0Data[i];
      const conf = confidence[i] || 0;
      
      if (f0 > 0 && conf > 0.5) {
        const y = (1 - (Math.log10(f0) - Math.log10(minHz)) / (Math.log10(maxHz) - Math.log10(minHz))) * height;
        
        const hue = conf > 0.8 ? 120 : conf > 0.5 ? 60 : 0;
        ctx.fillStyle = `hsla(${hue}, 70%, 50%, ${conf})`;
        ctx.fillRect(width - 3, y - 1, 3, 2);
      }
    }
    
    if (targetF0.length === f0Data.length) {
      ctx.strokeStyle = "rgba(139, 92, 246, 0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      for (let i = 0; i < targetF0.length; i++) {
        const f0 = targetF0[i];
        const y = (1 - (Math.log10(f0) - Math.log10(minHz)) / (Math.log10(maxHz) - Math.log10(minHz))) * height;
        
        if (i === 0) {
          ctx.moveTo(0, y);
        } else {
          ctx.lineTo((i / f0Data.length) * width, y);
        }
      }
      
      ctx.stroke();
    }
    
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    for (let hz of [100, 200, 400, 800]) {
      const y = (1 - (Math.log10(hz) - Math.log10(minHz)) / (Math.log10(maxHz) - Math.log10(minHz))) * height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
  }, [f0Data, targetF0, confidence, width, height]);
  
  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full rounded"
    />
  );
}

interface LiveMeterProps {
  level: number;
  peak?: number;
  label?: string;
  orientation?: "horizontal" | "vertical";
}

export function LiveMeter({
  level,
  peak,
  label,
  orientation = "vertical",
}: LiveMeterProps) {
  const levelPercent = Math.max(0, Math.min(100, (level + 60) * (100 / 60)));
  const peakPercent = peak !== undefined ? Math.max(0, Math.min(100, (peak + 60) * (100 / 60))) : null;
  
  const isHorizontal = orientation === "horizontal";
  
  return (
    <div className={`flex ${isHorizontal ? "items-center" : "flex-col items-center"} gap-2`}>
      {label && <span className="text-xs text-gray-400">{label}</span>}
      <div
        className={`bg-gray-900 ${isHorizontal ? "h-3 w-24" : "w-3 h-20"} rounded overflow-hidden relative`}
      >
        <motion.div
          className={`absolute ${isHorizontal ? "h-full left-0" : "w-full bottom-0 left-0"} rounded`}
          style={{
            background: levelPercent > 90 ? "rgb(239, 68, 68)" : levelPercent > 75 ? "rgb(234, 179, 8)" : "rgb(34, 197, 94)",
            width: isHorizontal ? `${levelPercent}%` : "100%",
            height: isHorizontal ? "100%" : `${levelPercent}%`,
          }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.05 }}
        />
        {peakPercent !== null && (
          <div
            className={`absolute ${isHorizontal ? "h-full w-0.5" : "w-full h-0.5"} bg-red-500`}
            style={
              isHorizontal
                ? { left: `${peakPercent}%` }
                : { bottom: `${peakPercent}%` }
            }
          />
        )}
      </div>
    </div>
  );
}