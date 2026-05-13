import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Activity, Volume2, Mic, BarChart2, Music, Zap } from "lucide-react";

interface MeterSegmentProps {
  active: boolean;
  color: "green" | "yellow" | "red" | "off";
}

function MeterSegment({ active, color }: MeterSegmentProps) {
  const bgColor = active
    ? color === "red"
      ? "bg-red-500"
      : color === "yellow"
      ? "bg-yellow-500"
      : "bg-green-500"
    : "bg-gray-800";

  return (
    <div className={`w-4 h-6 rounded-sm transition-colors ${bgColor}`} />
  );
}

interface LevelMeterDisplayProps {
  levelDbfs: number;
  peakDbfs: number;
  segments: string[];
  label?: string;
}

export function LevelMeterDisplay({ levelDbfs, peakDbfs, segments, label }: LevelMeterDisplayProps) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col gap-1">
        {segments.map((seg, i) => (
          <MeterSegment
            key={i}
            active={seg !== "off"}
            color={seg as "green" | "yellow" | "red" | "off"}
          />
        ))}
      </div>
      <div className="flex flex-col justify-between h-full">
        <span className="text-xs text-gray-500">0</span>
        <span className="text-xs text-gray-500">-6</span>
        <span className="text-xs text-gray-500">-12</span>
        <span className="text-xs text-gray-500">-24</span>
        <span className="text-xs text-gray-500">-48</span>
      </div>
      {label && <span className="text-xs text-gray-400">{label}</span>}
    </div>
  );
}


interface VUMeterDisplayProps {
  leftVu: number;
  rightVu: number;
}

export function VUMeterDisplay({ leftVu, rightVu }: VUMeterDisplayProps) {
  const leftPct = Math.max(0, Math.min(100, (leftVu + 20) * 5));
  const rightPct = Math.max(0, Math.min(100, (rightVu + 20) * 5));

  return (
    <div className="flex gap-4 items-center">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-gray-500">+3</span>
        <span className="text-xs text-gray-500">0</span>
        <span className="text-xs text-gray-500">-10</span>
        <span className="text-xs text-gray-500">-20</span>
        <span className="text-xs text-gray-500">VU</span>
      </div>
      {[{ vu: leftVu, pct: leftPct }, { vu: rightVu, pct: rightPct }].map((ch, i) => (
        <div key={i} className="flex flex-col items-center">
          <span className="text-xs text-gray-400 mb-1">{i === 0 ? "L" : "R"}</span>
          <div className="relative w-8 h-32 bg-gray-900 rounded overflow-hidden">
            <motion.div
              className="absolute bottom-0 w-full bg-green-600"
              style={{ height: `${ch.pct}%` }}
              initial={{ height: 0 }}
              animate={{ height: `${ch.pct}%` }}
              transition={{ duration: 0.1 }}
            />
            <div className="absolute w-full h-px bg-red-500 top-1/3" />
            <div className="absolute w-full h-px bg-yellow-500 top-2/3" />
          </div>
          <span className="text-xs font-mono text-gray-400 mt-1">{ch.vu.toFixed(0)}</span>
        </div>
      ))}
    </div>
  );
}


interface LoudnessDisplayPanelProps {
  integrated: number;
  shortTerm: number;
  momentary: number;
  range?: number;
}

export function LoudnessDisplayPanel({ integrated, shortTerm, momentary, range }: LoudnessDisplayPanelProps) {
  return (
    <div className="bg-gray-900 rounded-lg p-4 flex items-center gap-6">
      <div className="text-center">
        <div className="text-xs text-gray-500 mb-1">Integrated</div>
        <div className="text-2xl font-mono text-purple-400">{integrated.toFixed(1)}</div>
        <div className="text-xs text-gray-600">LUFS</div>
      </div>
      <div className="h-12 w-px bg-gray-700" />
      <div className="text-center">
        <div className="text-xs text-gray-500 mb-1">Short Term</div>
        <div className="text-xl font-mono text-blue-400">{shortTerm.toFixed(1)}</div>
        <div className="text-xs text-gray-600">LUFS</div>
      </div>
      <div className="h-12 w-px bg-gray-700" />
      <div className="text-center">
        <div className="text-xs text-gray-500 mb-1">Momentary</div>
        <div className="text-xl font-mono text-green-400">{momentary.toFixed(1)}</div>
        <div className="text-xs text-gray-600">LUFS</div>
      </div>
      {range !== undefined && (
        <>
          <div className="h-12 w-px bg-gray-700" />
          <div className="text-center">
            <div className="text-xs text-gray-500 mb-1">Range</div>
            <div className="text-xl font-mono text-yellow-400">{range.toFixed(1)}</div>
            <div className="text-xs text-gray-600">LU</div>
          </div>
        </>
      )}
    </div>
  );
}


interface RTAProps {
  bands: number[];
  peaks: number[];
  frequencies?: number[];
}

export function RTA({ bands, peaks, frequencies }: RTAProps) {
  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-white text-sm font-medium flex items-center gap-2">
          <BarChart2 size={14} />
          Real-Time Analyzer
        </h4>
      </div>
      <div className="flex items-end justify-between gap-0.5 h-32">
        {bands.map((level, i) => (
          <div key={i} className="flex flex-col items-center flex-1">
            <div className="w-full relative" style={{ height: "100%" }}>
              <motion.div
                className="absolute bottom-0 w-full rounded-t"
                style={{
                  height: `${Math.max(0, level * 100)}%`,
                  background: `linear-gradient(to top, rgba(34, 197, 94, 0.8), rgba(234, 179, 8, 0.6), rgba(239, 68, 68, 0.4))`,
                }}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(0, level * 100)}%` }}
                transition={{ duration: 0.05 }}
              />
              {peaks && peaks[i] > 0 && (
                <div
                  className="absolute w-full bg-white h-1"
                  style={{ bottom: `${Math.max(0, peaks[i] * 100)}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-600 mt-2">
        <span>20</span>
        <span>200</span>
        <span>2k</span>
        <span>20k</span>
      </div>
    </div>
  );
}


interface StereoCorrelationProps {
  correlation: number;
}

export function StereoCorrelationMeter({ correlation }: StereoCorrelationProps) {
  const pct = ((correlation + 1) / 2) * 100;
  const color = correlation > 0.7 ? "bg-green-500" : correlation < -0.3 ? "bg-red-500" : "bg-yellow-500";
  const desc = correlation > 0.7 ? "Mono" : correlation > 0.3 ? "Normal" : correlation > -0.3 ? "Wide" : "Phase Issue";

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <h4 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
        <Activity size={14} />
        Stereo Correlation
      </h4>
      <div className="relative h-3 bg-gray-800 rounded">
        <div className="absolute left-0 top-0 h-full bg-gray-700 rounded" style={{ width: "50%" }} />
        <motion.div
          className={`absolute top-0 h-full w-3 ${color}`}
          style={{ left: `calc(${pct}% - 6px)` }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-600 mt-1">
        <span>-1</span>
        <span>0</span>
        <span>+1</span>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-lg font-mono text-white">{correlation.toFixed(2)}</span>
        <span className={`text-xs px-2 py-1 rounded ${
          correlation > 0.5 ? "bg-green-900/50 text-green-400" : correlation < -0.2 ? "bg-red-900/50 text-red-400" : "bg-yellow-900/50 text-yellow-400"
        }`}>
          {desc}
        </span>
      </div>
    </div>
  );
}


interface MonitoringDashboardProps {
  recordingId?: string;
  sessionId?: string;
  onGetMonitoringData?: (recordingId: string, sessionId?: string) => Promise<Record<string, unknown>>;
}

export function MonitoringDashboard({ recordingId, sessionId, onGetMonitoringData }: MonitoringDashboardProps) {
  const [monitoringData, setMonitoringData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!recordingId) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await onGetMonitoringData?.(recordingId, sessionId);
      setMonitoringData(data || null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [recordingId, sessionId, onGetMonitoringData]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (!recordingId) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 text-center">
        <Activity size={32} className="mx-auto mb-3 text-gray-600" />
        <p className="text-gray-500">Select a recording to view monitoring data</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 text-center">
        <p className="text-red-400">Error: {error}</p>
        <button onClick={() => void fetchData()} className="mt-2 text-purple-400 hover:underline">
          Retry
        </button>
      </div>
    );
  }

  const level = monitoringData?.level as { level_dbfs: number; peak_dbfs: number; segments: string[] } | undefined;
  const vu = monitoringData?.vu as { left_vu: number; right_vu: number } | undefined;
  const loudness = monitoringData?.loudness as { integrated_lufs: number; short_term_lufs: number; momentary_lufs: number } | undefined;
  const stereo = monitoringData?.stereo as { correlation: number; width: number } | undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-medium flex items-center gap-2">
          <Activity size={18} />
          Audio Monitoring
        </h3>
        <button
          onClick={() => void fetchData()}
          className="p-2 bg-gray-800 rounded hover:bg-gray-700"
        >
          <Zap size={16} className="text-gray-400" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-lg p-4">
          <h4 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
            <Volume2 size={14} />
            Level Meter
          </h4>
          {level && (
            <LevelMeterDisplay
              levelDbfs={level.level_dbfs}
              peakDbfs={level.peak_dbfs}
              segments={level.segments}
            />
          )}
        </div>

        <div className="bg-gray-900 rounded-lg p-4">
          <h4 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
            <Mic size={14} />
            VU Meter
          </h4>
          {vu && (
            <VUMeterDisplay leftVu={vu.left_vu} rightVu={vu.right_vu} />
          )}
        </div>
      </div>

      {loudness && (
        <LoudnessDisplayPanel
          integrated={loudness.integrated_lufs}
          shortTerm={loudness.short_term_lufs}
          momentary={loudness.momentary_lufs}
        />
      )}

      {stereo && (
        <StereoCorrelationMeter correlation={stereo.correlation} />
      )}

      {monitoringData?.rta && (
        <RTA
          bands={(monitoringData.rta as { bands: number[] }).bands}
          peaks={(monitoringData.rta as { peaks: number[] }).peaks}
        />
      )}
    </div>
  );
}


interface MixAssistantProps {
  onAutoMix?: (settings: { target_lufs: number; brightness: number; warmth: number; punch: number }) => Promise<void>;
  onAutoMaster?: (style: string) => Promise<void>;
}

export function MixAssistant({ onAutoMix, onAutoMaster }: MixAssistantProps) {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAutoMix = async () => {
    setIsProcessing(true);
    try {
      await onAutoMix?.({ target_lufs: -14, brightness: 0.5, warmth: 0.3, punch: 0.5 });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <h3 className="text-white font-medium flex items-center gap-2 mb-4">
        <Zap size={18} />
        AI Mix Assistant
      </h3>

      <div className="space-y-3">
        <button
          onClick={() => void handleAutoMix()}
          disabled={isProcessing}
          className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Zap size={16} />
          )}
          Auto Mix
        </button>

        <div className="grid grid-cols-3 gap-2">
          {["loud", "balanced", "subtle"].map((style) => (
            <button
              key={style}
              onClick={() => void onAutoMaster?.(style)}
              disabled={isProcessing}
              className="py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm capitalize disabled:opacity-50"
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-500">
        <p>AI Mix analyzes your audio and applies:</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Automatic level adjustment to target LUFS</li>
          <li>EQ correction based on frequency balance</li>
          <li>Dynamic processing for punch</li>
          <li>Stereo width and correlation correction</li>
        </ul>
      </div>
    </div>
  );
}