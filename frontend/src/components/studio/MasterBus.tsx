import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Volume2, Gauge, Waves, Sigma, Settings,
  ChevronDown, ChevronUp, SlidersHorizontal,
} from "lucide-react";

interface MeterData {
  integrated: number;
  shortTerm: number;
  momentary: number;
  correlation: number;
  peak: number;
}

interface MasterChannelState {
  volume: number;
  pan: number;
  muted: boolean;
  eqLow: { freq: number; gain: number };
  eqMid: { freq: number; gain: number; q: number };
  eqHigh: { freq: number; gain: number };
  compressor: { threshold: number; ratio: number; makeup: number; attack: number; release: number };
  limiter: { threshold: number; ceiling: number };
  outputMode: "mono" | "stereo";
  sampleRate: number;
  dithering: boolean;
}

interface MasterBusProps {
  masterChannel: MasterChannelState;
  onUpdate: (updates: Partial<MasterChannelState>) => void;
  metering: MeterData;
}

function dbToPercent(db: number, min = -60, max = 6): number {
  const clamped = Math.max(min, Math.min(max, db));
  return ((clamped - min) / (max - min)) * 100;
}

export function MasterBus({ masterChannel, onUpdate, metering }: MasterBusProps) {
  const [expanded, setExpanded] = useState(true);

  const handleFaderPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startVol = masterChannel.volume;
    const onMove = (ev: PointerEvent) => {
      const dy = startY - ev.clientY;
      const newVol = Math.max(-60, Math.min(6, startVol + dy * 0.3));
      onUpdate({ volume: Math.round(newVol * 10) / 10 });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [masterChannel.volume, onUpdate]);

  const lufsColor = (val: number): string => {
    if (val > -10) return "#ef4444";
    if (val > -14) return "#eab308";
    if (val > -18) return "#22c55e";
    return "#3b82f6";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="master-bus bg-gray-950 rounded-2xl border border-blue-900/30 shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-blue-950/30 border-b border-blue-900/20 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <Volume2 size={16} className="text-blue-400" />
          <h2 className="text-sm font-bold text-white">Master Bus</h2>
          <div className="text-[9px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
            {masterChannel.outputMode.toUpperCase()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-gray-500">{masterChannel.sampleRate / 1000}kHz</span>
          {expanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </div>
      </div>

      {expanded && (
        <div className="p-4 space-y-5">
          <div className="grid grid-cols-3 gap-4">
            {/* LUFS meter */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Gauge size={12} className="text-cyan-400" />
                <span className="text-[9px] font-bold text-gray-500 uppercase">LUFS</span>
              </div>
              <div className="grid grid-cols-1 gap-1">
                {(["integrated", "shortTerm", "momentary"] as const).map((type) => (
                  <div key={type} className="flex items-center gap-2">
                    <span className="text-[8px] font-mono text-gray-600 w-14 capitalize">{type.replace(/([A-Z])/g, " $1")}</span>
                    <div className="flex-1 h-2 bg-gray-900 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-100"
                        style={{
                          width: `${Math.abs(metering[type] + 30) * 3}%`,
                          backgroundColor: lufsColor(metering[type]),
                        }}
                      />
                    </div>
                    <span
                      className="text-[10px] font-mono w-12 text-right tabular-nums"
                      style={{ color: lufsColor(metering[type]) }}
                    >
                      {metering[type].toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stereo correlation */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Waves size={12} className="text-purple-400" />
                <span className="text-[9px] font-bold text-gray-500 uppercase">Correlation</span>
              </div>
              <div className="bg-gray-900 rounded-xl p-3 border border-gray-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] text-gray-600">-1</span>
                  <span className="text-xs font-mono font-bold" style={{ color: metering.correlation > 0.5 ? "#22c55e" : "#eab308" }}>
                    {metering.correlation.toFixed(2)}
                  </span>
                  <span className="text-[8px] text-gray-600">+1</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(metering.correlation + 1) * 50}%`,
                      background: "linear-gradient(to right, #ef4444, #eab308, #22c55e)",
                    }}
                  />
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-[7px] text-gray-700">Mono</span>
                  <span className="text-[7px] text-gray-700">Wide</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-gray-600">Peak:</span>
                <span className="text-[10px] font-mono text-white tabular-nums">{metering.peak.toFixed(1)} dB</span>
              </div>
            </div>

            {/* Output config */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Settings size={12} className="text-gray-400" />
                <span className="text-[9px] font-bold text-gray-500 uppercase">Output</span>
              </div>
              <div className="space-y-2">
                <select
                  value={masterChannel.outputMode}
                  onChange={(e) => onUpdate({ outputMode: e.target.value as "mono" | "stereo" })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg text-[10px] text-gray-400 px-2 py-1.5 outline-none"
                >
                  <option value="stereo">Stereo</option>
                  <option value="mono">Mono</option>
                </select>
                <select
                  value={masterChannel.sampleRate}
                  onChange={(e) => onUpdate({ sampleRate: parseInt(e.target.value) })}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg text-[10px] text-gray-400 px-2 py-1.5 outline-none"
                >
                  <option value={44100}>44.1 kHz</option>
                  <option value={48000}>48 kHz</option>
                  <option value={88200}>88.2 kHz</option>
                  <option value={96000}>96 kHz</option>
                </select>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={masterChannel.dithering}
                    onChange={(e) => onUpdate({ dithering: e.target.checked })}
                    className="w-3 h-3 rounded border-gray-700 bg-gray-900 accent-blue-500"
                  />
                  <span className="text-[9px] text-gray-500">Dithering</span>
                </label>
              </div>
            </div>
          </div>

          {/* Master EQ */}
          <div className="bg-gray-900/50 rounded-xl border border-gray-800/50 p-3 space-y-3">
            <div className="flex items-center gap-1.5">
              <Waves size={12} className="text-blue-400" />
              <span className="text-[9px] font-bold text-gray-500 uppercase">Master EQ</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <span className="text-[8px] text-gray-600">Low</span>
                <input
                  type="range"
                  min={20}
                  max={500}
                  value={masterChannel.eqLow.freq}
                  onChange={(e) => onUpdate({ eqLow: { ...masterChannel.eqLow, freq: parseInt(e.target.value) } })}
                  className="w-full h-1 appearance-none bg-gray-800 rounded-full cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
                />
                <input
                  type="range"
                  min={-18}
                  max={18}
                  value={masterChannel.eqLow.gain}
                  onChange={(e) => onUpdate({ eqLow: { ...masterChannel.eqLow, gain: parseInt(e.target.value) } })}
                  className="w-full h-1 appearance-none bg-gray-800 rounded-full cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500"
                />
                <div className="flex justify-between text-[7px] font-mono text-gray-600">
                  <span>{masterChannel.eqLow.freq}Hz</span>
                  <span>{masterChannel.eqLow.gain > 0 ? "+" : ""}{masterChannel.eqLow.gain}dB</span>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[8px] text-gray-600">Mid</span>
                <input
                  type="range"
                  min={200}
                  max={8000}
                  value={masterChannel.eqMid.freq}
                  onChange={(e) => onUpdate({ eqMid: { ...masterChannel.eqMid, freq: parseInt(e.target.value) } })}
                  className="w-full h-1 appearance-none bg-gray-800 rounded-full cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500"
                />
                <input
                  type="range"
                  min={-18}
                  max={18}
                  value={masterChannel.eqMid.gain}
                  onChange={(e) => onUpdate({ eqMid: { ...masterChannel.eqMid, gain: parseInt(e.target.value) } })}
                  className="w-full h-1 appearance-none bg-gray-800 rounded-full cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500"
                />
                <div className="flex justify-between text-[7px] font-mono text-gray-600">
                  <span>{masterChannel.eqMid.freq}Hz</span>
                  <span>{masterChannel.eqMid.gain > 0 ? "+" : ""}{masterChannel.eqMid.gain}dB</span>
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[8px] text-gray-600">High</span>
                <input
                  type="range"
                  min={2000}
                  max={20000}
                  value={masterChannel.eqHigh.freq}
                  onChange={(e) => onUpdate({ eqHigh: { ...masterChannel.eqHigh, freq: parseInt(e.target.value) } })}
                  className="w-full h-1 appearance-none bg-gray-800 rounded-full cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500"
                />
                <input
                  type="range"
                  min={-18}
                  max={18}
                  value={masterChannel.eqHigh.gain}
                  onChange={(e) => onUpdate({ eqHigh: { ...masterChannel.eqHigh, gain: parseInt(e.target.value) } })}
                  className="w-full h-1 appearance-none bg-gray-800 rounded-full cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500"
                />
                <div className="flex justify-between text-[7px] font-mono text-gray-600">
                  <span>{masterChannel.eqHigh.freq}Hz</span>
                  <span>{masterChannel.eqHigh.gain > 0 ? "+" : ""}{masterChannel.eqHigh.gain}dB</span>
                </div>
              </div>
            </div>
          </div>

          {/* Compressor + Limiter */}
          <div className="grid grid-cols-2 gap-4">
            {/* Compressor */}
            <div className="bg-gray-900/50 rounded-xl border border-gray-800/50 p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal size={12} className="text-orange-400" />
                <span className="text-[9px] font-bold text-gray-500 uppercase">Compressor</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[8px] text-gray-600">Threshold</span>
                  <input
                    type="range"
                    min={-60}
                    max={0}
                    value={masterChannel.compressor.threshold}
                    onChange={(e) => onUpdate({ compressor: { ...masterChannel.compressor, threshold: parseInt(e.target.value) } })}
                    className="w-full h-1 appearance-none bg-gray-800 rounded-full cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500"
                  />
                  <span className="text-[8px] font-mono text-gray-500">{masterChannel.compressor.threshold} dB</span>
                </div>
                <div>
                  <span className="text-[8px] text-gray-600">Ratio</span>
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={0.5}
                    value={masterChannel.compressor.ratio}
                    onChange={(e) => onUpdate({ compressor: { ...masterChannel.compressor, ratio: parseFloat(e.target.value) } })}
                    className="w-full h-1 appearance-none bg-gray-800 rounded-full cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500"
                  />
                  <span className="text-[8px] font-mono text-gray-500">{masterChannel.compressor.ratio}:1</span>
                </div>
                <div>
                  <span className="text-[8px] text-gray-600">Makeup</span>
                  <input
                    type="range"
                    min={0}
                    max={24}
                    value={masterChannel.compressor.makeup}
                    onChange={(e) => onUpdate({ compressor: { ...masterChannel.compressor, makeup: parseInt(e.target.value) } })}
                    className="w-full h-1 appearance-none bg-gray-800 rounded-full cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500"
                  />
                  <span className="text-[8px] font-mono text-gray-500">{masterChannel.compressor.makeup} dB</span>
                </div>
                <div>
                  <span className="text-[8px] text-gray-600">Attack</span>
                  <input
                    type="range"
                    min={0.1}
                    max={50}
                    step={0.1}
                    value={masterChannel.compressor.attack}
                    onChange={(e) => onUpdate({ compressor: { ...masterChannel.compressor, attack: parseFloat(e.target.value) } })}
                    className="w-full h-1 appearance-none bg-gray-800 rounded-full cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500"
                  />
                  <span className="text-[8px] font-mono text-gray-500">{masterChannel.compressor.attack} ms</span>
                </div>
              </div>
            </div>

            {/* Limiter */}
            <div className="bg-gray-900/50 rounded-xl border border-gray-800/50 p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <Sigma size={12} className="text-red-400" />
                <span className="text-[9px] font-bold text-gray-500 uppercase">Limiter</span>
              </div>
              <div className="space-y-2">
                <div>
                  <span className="text-[8px] text-gray-600">Threshold</span>
                  <input
                    type="range"
                    min={-12}
                    max={0}
                    step={0.1}
                    value={masterChannel.limiter.threshold}
                    onChange={(e) => onUpdate({ limiter: { ...masterChannel.limiter, threshold: parseFloat(e.target.value) } })}
                    className="w-full h-1 appearance-none bg-gray-800 rounded-full cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500"
                  />
                  <span className="text-[9px] font-mono text-gray-400">{masterChannel.limiter.threshold.toFixed(1)} dB</span>
                </div>
                <div>
                  <span className="text-[8px] text-gray-600">Ceiling</span>
                  <input
                    type="range"
                    min={-6}
                    max={0}
                    step={0.1}
                    value={masterChannel.limiter.ceiling}
                    onChange={(e) => onUpdate({ limiter: { ...masterChannel.limiter, ceiling: parseFloat(e.target.value) } })}
                    className="w-full h-1 appearance-none bg-gray-800 rounded-full cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-red-500"
                  />
                  <span className="text-[9px] font-mono text-gray-400">{masterChannel.limiter.ceiling.toFixed(1)} dB</span>
                </div>
              </div>
            </div>
          </div>

          {/* Master fader */}
          <div className="flex items-center gap-4 pt-2 border-t border-gray-800/50">
            <div className="flex items-center gap-2">
              <Volume2 size={14} className="text-blue-400" />
              <span className="text-[9px] font-bold text-gray-500 uppercase w-12">Master</span>
            </div>
            <div className="flex-1 h-8 bg-gray-900 rounded-xl border border-gray-800 relative cursor-pointer" onPointerDown={handleFaderPointerDown}>
              <div
                className="h-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-75"
                style={{ width: `${dbToPercent(masterChannel.volume)}%` }}
              />
              <div
                className="absolute top-0 bottom-0 w-1 bg-white rounded-full shadow-lg"
                style={{ left: `calc(${dbToPercent(masterChannel.volume)}% - 2px)` }}
              />
            </div>
            <span className="text-xs font-mono font-bold text-white tabular-nums w-16 text-right">
              {masterChannel.volume > 0 ? "+" : ""}{masterChannel.volume.toFixed(1)} dB
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
