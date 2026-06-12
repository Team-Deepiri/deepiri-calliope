import { useState, useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Circle, Square, Pause, Mic, Speaker, VolumeOff,
  FolderOpen, Settings2, ChevronDown, Radio, Wifi,
} from "lucide-react";

type InputChannel = "stereo" | "mono" | "input1" | "input2";
type RecordFormat = "wav24" | "wav16" | "flac";
type CountIn = 0 | 1 | 2 | 4;

interface RecordingPanelProps {
  isRecording: boolean;
  isPaused: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onInputChange?: (input: InputChannel) => void;
  levels?: { left: number; right: number };
}

function formatTimer(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
}

function VULevelMeter({
  level,
  peak,
  label,
  color = "blue",
}: {
  level: number;
  peak: number;
  label: string;
  color?: string;
}) {
  const pct = Math.min(100, Math.max(0, level * 100));
  const peakPct = Math.min(100, Math.max(0, peak * 100));
  const isClipping = peak >= 0.95;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[9px] font-mono">
        <span className="text-gray-500 uppercase font-bold">{label}</span>
        <span className={isClipping ? "text-red-500" : "text-gray-500"}>
          {peak.toFixed(1)}
        </span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden relative">
        <motion.div
          className={`h-full rounded-full ${
            isClipping
              ? "bg-red-500"
              : pct > 80
                ? "bg-yellow-500"
                : `bg-${color}-500`
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.05, ease: "linear" }}
        />
        {peak > 0 && (
          <motion.div
            className="absolute top-0 h-full w-0.5 bg-white/80"
            initial={{ left: `${peakPct}%` }}
            animate={{ left: `${peakPct}%` }}
            transition={{ duration: 0.1 }}
          />
        )}
      </div>
    </div>
  );
}

export function RecordingPanel({
  isRecording,
  isPaused,
  onStart,
  onStop,
  onPause,
  onInputChange,
  levels,
}: RecordingPanelProps) {
  const [inputChannel, setInputChannel] = useState<InputChannel>("stereo");
  const [recordFormat, setRecordFormat] = useState<RecordFormat>("wav24");
  const [monitorOn, setMonitorOn] = useState(true);
  const [recordingPath, setRecordingPath] = useState("~/Recordings");
  const [countIn, setCountIn] = useState<CountIn>(0);
  const [preRoll, setPreRoll] = useState(0);
  const [postRoll, setPostRoll] = useState(2);
  const [autoPunchIn, setAutoPunchIn] = useState(false);
  const [autoPunchOut, setAutoPunchOut] = useState(false);
  const [punchInBar, setPunchInBar] = useState(1);
  const [punchOutBar, setPunchOutBar] = useState(9);
  const [warpRecording, setWarpRecording] = useState(false);
  const [dropToArrangement, setDropToArrangement] = useState(true);
  const [fileNameTemplate, setFileNameTemplate] = useState("{session}_{take}_{date}");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [peakHoldL, setPeakHoldL] = useState(0);
  const [peakHoldR, setPeakHoldR] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (isRecording && !isPaused) {
      startTimeRef.current = Date.now() - elapsedMs;
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 33);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  useEffect(() => {
    if (!isRecording) {
      setElapsedMs(0);
      setPeakHoldL(0);
      setPeakHoldR(0);
    }
  }, [isRecording]);

  useEffect(() => {
    if (!levels) return;
    const absL = Math.abs(levels.left);
    const absR = Math.abs(levels.right);
    if (absL > peakHoldL) setPeakHoldL(absL);
    if (absR > peakHoldR) setPeakHoldR(absR);
  }, [levels, peakHoldL, peakHoldR]);

  const handleInputChange = useCallback(
    (input: InputChannel) => {
      setInputChannel(input);
      onInputChange?.(input);
    },
    [onInputChange],
  );

  const handleBrowsePath = useCallback(() => {
    setRecordingPath(prompt("Enter recording path:", recordingPath) ?? recordingPath);
  }, [recordingPath]);

  const formatLabel: Record<RecordFormat, string> = {
    wav24: "WAV 24-bit",
    wav16: "WAV 16-bit",
    flac: "FLAC",
  };

  const inputLabel: Record<InputChannel, string> = {
    stereo: "Stereo",
    mono: "Mono",
    input1: "Input 1",
    input2: "Input 2",
  };

  const currentLevel = levels ?? { left: 0, right: 0 };

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Mic size={18} className="text-red-500" />
            <h3 className="text-base font-bold text-white">Recording</h3>
          </div>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={`p-1.5 rounded-lg transition-colors ${
              showSettings
                ? "bg-blue-500/20 text-blue-400"
                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
            }`}
          >
            <Settings2 size={14} />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <motion.button
            onClick={isRecording ? onStop : onStart}
            whileTap={{ scale: 0.9 }}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-xl ${
              isRecording
                ? "bg-gray-800 hover:bg-gray-700 border-2 border-gray-600"
                : "bg-red-600 hover:bg-red-500"
            }`}
          >
            {isRecording ? (
              <Square size={20} className="text-red-500 fill-red-500" />
            ) : (
              <Circle size={28} className="text-white fill-white" />
            )}
          </motion.button>

          {isRecording && (
            <motion.button
              onClick={onPause}
              whileTap={{ scale: 0.9 }}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all border-2 ${
                isPaused
                  ? "bg-yellow-500/20 border-yellow-500 text-yellow-400"
                  : "bg-gray-800 border-gray-600 text-gray-400 hover:text-white"
              }`}
            >
              <Pause size={16} fill="currentColor" />
            </motion.button>
          )}

          <div className="flex-1">
            <div className="font-mono text-3xl font-bold tracking-wider tabular-nums">
              {isRecording ? (
                isPaused ? (
                  <span className="text-yellow-400">{formatTimer(elapsedMs)}</span>
                ) : (
                  <motion.span
                    className="text-red-500"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    {formatTimer(elapsedMs)}
                  </motion.span>
                )
              ) : (
                <span className="text-gray-600">00:00:00.000</span>
              )}
            </div>
            <div className="text-[10px] text-gray-600 font-mono mt-1">
              {recordingPath}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                Input
              </label>
              <select
                value={inputChannel}
                onChange={(e) =>
                  handleInputChange(e.target.value as InputChannel)
                }
                disabled={isRecording}
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 outline-none focus:border-blue-500/50 disabled:opacity-50"
              >
                {(
                  [
                    "stereo",
                    "mono",
                    "input1",
                    "input2",
                  ] as InputChannel[]
                ).map((ch) => (
                  <option key={ch} value={ch}>
                    {inputLabel[ch]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                Format
              </label>
              <div className="flex gap-1.5">
                {(
                  [
                    "wav24",
                    "wav16",
                    "flac",
                  ] as RecordFormat[]
                ).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setRecordFormat(fmt)}
                    disabled={isRecording}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 ${
                      recordFormat === fmt
                        ? "bg-blue-600 text-white"
                        : "bg-gray-900 text-gray-500 hover:text-gray-300 border border-gray-800"
                    }`}
                  >
                    {formatLabel[fmt]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                Count-in
              </label>
              <div className="flex gap-1.5">
                {([0, 1, 2, 4] as CountIn[]).map((n) => (
                  <button
                    key={n}
                    onClick={() => setCountIn(n)}
                    disabled={isRecording}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 ${
                      countIn === n
                        ? "bg-blue-600 text-white"
                        : "bg-gray-900 text-gray-500 hover:text-gray-300 border border-gray-800"
                    }`}
                  >
                    {n === 0 ? "Off" : `${n} bar${n > 1 ? "s" : ""}`}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleBrowsePath}
              className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              <FolderOpen size={12} />
              Browse
            </button>
          </div>

          <div className="space-y-3">
            <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
              Input Level
            </label>
            <VULevelMeter
              level={currentLevel.left}
              peak={peakHoldL}
              label="L"
            />
            <VULevelMeter
              level={currentLevel.right}
              peak={peakHoldR}
              label="R"
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                Monitor
              </span>
              <button
                onClick={() => setMonitorOn((v) => !v)}
                className={`p-2 rounded-lg transition-all ${
                  monitorOn
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-gray-900 text-gray-500 hover:text-gray-300"
                }`}
              >
                {monitorOn ? <Speaker size={14} /> : <VolumeOff size={14} />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-gray-800/50 pt-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={warpRecording}
              onChange={(e) => setWarpRecording(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-7 h-3.5 bg-gray-800 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all" />
          </label>
          <span className="text-[10px] text-gray-400">Warp Recording</span>

          <label className="relative inline-flex items-center cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={dropToArrangement}
              onChange={(e) => setDropToArrangement(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-7 h-3.5 bg-gray-800 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all" />
          </label>
          <span className="text-[10px] text-gray-400">Drop to Arrangement</span>
        </div>

        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden space-y-4 border-t border-gray-800/50 pt-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    Pre-roll (bars)
                  </label>
                  <input
                    type="number"
                    value={preRoll}
                    onChange={(e) => setPreRoll(parseInt(e.target.value) || 0)}
                    min={0}
                    max={8}
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 outline-none focus:border-blue-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    Post-roll (bars)
                  </label>
                  <input
                    type="number"
                    value={postRoll}
                    onChange={(e) => setPostRoll(parseInt(e.target.value) || 0)}
                    min={0}
                    max={8}
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    Auto-Punch
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoPunchIn}
                      onChange={(e) => setAutoPunchIn(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-7 h-3.5 bg-gray-800 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all" />
                  </label>
                </div>
                {autoPunchIn && (
                  <div className="grid grid-cols-2 gap-3 pl-2">
                    <div className="space-y-1">
                      <label className="text-[8px] text-gray-500">Punch In (bar)</label>
                      <input
                        type="number"
                        value={punchInBar}
                        onChange={(e) =>
                          setPunchInBar(parseInt(e.target.value) || 1)
                        }
                        min={1}
                        className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2 py-1 text-xs text-gray-300 outline-none focus:border-blue-500/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] text-gray-500">Punch Out (bar)</label>
                      <input
                        type="number"
                        value={punchOutBar}
                        onChange={(e) =>
                          setPunchOutBar(parseInt(e.target.value) || 1)
                        }
                        min={1}
                        className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2 py-1 text-xs text-gray-300 outline-none focus:border-blue-500/50"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                  File Name Template
                </label>
                <input
                  value={fileNameTemplate}
                  onChange={(e) => setFileNameTemplate(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 outline-none focus:border-blue-500/50 font-mono"
                  placeholder="{session}_{take}_{date}"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
