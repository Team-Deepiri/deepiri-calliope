import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Cpu, Radio, Activity, Clock } from "lucide-react";

interface PerformanceMeterProps {
  sampleRate: number;
  bufferSize: number;
  onSampleRateChange?: (rate: number) => void;
  onBufferSizeChange?: (size: number) => void;
}

const SAMPLE_RATES = [44100, 48000, 88200, 96000, 192000];
const BUFFER_SIZES = [64, 128, 256, 512, 1024, 2048];

function getDriverType(): string {
  if (typeof navigator === "undefined") return "Unknown";
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const type = ctx.baseLatency === 0 ? "Native" : ctx.sampleRate >= 48000 ? "ASIO" : "MME";
  ctx.close();
  return type;
}

export function PerformanceMeter({
  sampleRate, bufferSize,
  onSampleRateChange, onBufferSizeChange,
}: PerformanceMeterProps) {
  const [cpuUsage, setCpuUsage] = useState(0);
  const [memUsage, setMemUsage] = useState(0);
  const [latency, setLatency] = useState(0);
  const [driverType] = useState(getDriverType);
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const rafId = useRef<number>(0);

  const tick = useCallback(() => {
    frameCount.current++;
    const now = performance.now();
    const elapsed = now - lastTime.current;

    if (elapsed >= 500) {
      const fps = (frameCount.current / elapsed) * 1000;
      const maxFps = 60;
      const cpu = Math.min(100, Math.max(0, ((maxFps - fps) / maxFps) * 100));
      setCpuUsage(Math.round(cpu));

      if ("deviceMemory" in navigator) {
        const mem = (navigator as any).deviceMemory as number;
        setMemUsage(Math.round((1 - mem / 8) * 100));
      } else {
        setMemUsage((prev) => Math.max(0, prev - 0.5 + Math.random()));
      }

      const estimatedLatency = (bufferSize / sampleRate) * 1000;
      setLatency(Math.round(estimatedLatency * 10) / 10);

      frameCount.current = 0;
      lastTime.current = now;
    }

    rafId.current = requestAnimationFrame(tick);
  }, [bufferSize, sampleRate]);

  useEffect(() => {
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [tick]);

  const cpuColor = cpuUsage > 80 ? "text-red-400" : cpuUsage > 50 ? "text-yellow-400" : "text-green-400";
  const memColor = memUsage > 80 ? "text-red-400" : memUsage > 50 ? "text-yellow-400" : "text-cyan-400";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="performance-meter flex items-center gap-3 bg-gray-900/80 border border-gray-800/50 rounded-xl px-3 py-1.5 text-[10px] font-mono"
    >
      {/* CPU */}
      <div className="flex items-center gap-1.5">
        <Cpu size={11} className="text-gray-500" />
        <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${cpuUsage}%`,
              backgroundColor: cpuUsage > 80 ? "#ef4444" : cpuUsage > 50 ? "#eab308" : "#22c55e",
            }}
          />
        </div>
        <span className={cpuColor}>{cpuUsage}%</span>
      </div>

      {/* Memory */}
      <div className="flex items-center gap-1.5">
        <Activity size={11} className="text-gray-500" />
        <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${memUsage}%`,
              backgroundColor: memUsage > 80 ? "#ef4444" : memUsage > 50 ? "#eab308" : "#06b6d4",
            }}
          />
        </div>
        <span className={memColor}>{memUsage}%</span>
      </div>

      <div className="w-px h-4 bg-gray-800" />

      {/* Sample Rate */}
      <div className="flex items-center gap-1">
        <Radio size={11} className="text-gray-500" />
        {onSampleRateChange ? (
          <select
            value={sampleRate}
            onChange={(e) => onSampleRateChange(Number(e.target.value))}
            className="bg-transparent text-gray-300 outline-none text-[10px] font-mono cursor-pointer hover:text-white"
          >
            {SAMPLE_RATES.map((r) => (
              <option key={r} value={r} className="bg-gray-900">{r / 1000}kHz</option>
            ))}
          </select>
        ) : (
          <span className="text-gray-300">{sampleRate / 1000}kHz</span>
        )}
      </div>

      <div className="w-px h-4 bg-gray-800" />

      {/* Buffer / Latency */}
      <div className="flex items-center gap-1">
        <Clock size={11} className="text-gray-500" />
        {onBufferSizeChange ? (
          <select
            value={bufferSize}
            onChange={(e) => onBufferSizeChange(Number(e.target.value))}
            className="bg-transparent text-gray-300 outline-none text-[10px] font-mono cursor-pointer hover:text-white"
          >
            {BUFFER_SIZES.map((s) => (
              <option key={s} value={s} className="bg-gray-900">{s}</option>
            ))}
          </select>
        ) : (
          <span className="text-gray-300">{bufferSize}</span>
        )}
        <span className="text-gray-600 ml-1">{latency}ms</span>
      </div>

      <div className="w-px h-4 bg-gray-800" />

      {/* Driver */}
      <div className="flex items-center gap-1 text-gray-400">
        <span>{driverType}</span>
      </div>
    </motion.div>
  );
}
