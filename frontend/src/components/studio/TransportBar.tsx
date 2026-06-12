import { useCallback, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Play, Pause, Square, Circle, Repeat, SkipBack, SkipForward,
  Timer, ArrowLeftRight, AlertTriangle, Gauge,
} from "lucide-react";

interface TransportBarProps {
  isPlaying: boolean;
  isRecording: boolean;
  isLooping: boolean;
  isMetronomeOn: boolean;
  bpm: number;
  position: { bars: number; beats: number; sixteenths: number };
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onRecord: () => void;
  onBpmChange: (bpm: number) => void;
  onPositionChange: (position: { bars: number; beats: number; sixteenths: number }) => void;
  onLoopToggle: () => void;
  onMetronomeToggle: () => void;
}

const SHORTCUTS: Record<string, string> = {
  "Space": "Play / Pause",
  "Shift+Space": "Stop",
  "R": "Toggle Record",
  "L": "Toggle Loop",
  "M": "Toggle Metronome",
  "Panic": "MIDI Panic (Esc)",
};

function formatPos(pos: TransportBarProps["position"]): string {
  return `${pos.bars}.${pos.beats}.${pos.sixteenths}`;
}

export function TransportBar({
  isPlaying, isRecording, isLooping, isMetronomeOn,
  bpm, position, onPlay, onPause, onStop, onRecord,
  onBpmChange, onPositionChange, onLoopToggle, onMetronomeToggle,
}: TransportBarProps) {
  const longPressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handlePlayPause = useCallback(() => {
    if (isRecording) return;
    if (isPlaying) onPause();
    else onPlay();
  }, [isPlaying, isRecording, onPlay, onPause]);

  const handleRecord = useCallback(() => {
    onRecord();
  }, [onRecord]);

  const handlePanic = useCallback(() => {
    console.log("MIDI Panic - all notes off");
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          handlePlayPause();
          break;
        case "KeyR":
          if (!e.ctrlKey && !e.metaKey) handleRecord();
          break;
        case "KeyL":
          if (!e.ctrlKey && !e.metaKey) onLoopToggle();
          break;
        case "KeyM":
          if (!e.ctrlKey && !e.metaKey) onMetronomeToggle();
          break;
        case "Escape":
          handlePanic();
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePlayPause, handleRecord, onLoopToggle, onMetronomeToggle, handlePanic]);

  const startBpmDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startBpm = bpm;
    const onMove = (ev: PointerEvent) => {
      const dy = startY - ev.clientY;
      const newBpm = Math.max(20, Math.min(999, Math.round(startBpm + dy * 0.5)));
      onBpmChange(newBpm);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [bpm, onBpmChange]);

  const tapRef = useRef<number[]>([]);
  const handleTapTempo = useCallback(() => {
    const now = Date.now();
    tapRef.current = [...tapRef.current.filter((t) => now - t < 2000), now];
    if (tapRef.current.length >= 4) {
      const intervals: number[] = [];
      for (let i = 1; i < tapRef.current.length; i++) {
        intervals.push(tapRef.current[i] - tapRef.current[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const tappedBpm = Math.round(60000 / avg);
      if (tappedBpm >= 20 && tappedBpm <= 999) {
        onBpmChange(tappedBpm);
      }
      tapRef.current = [];
    }
  }, [onBpmChange]);

  const handleBpmWheel = useCallback((e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? -1 : 1;
    onBpmChange(Math.max(20, Math.min(999, bpm + delta)));
  }, [bpm, onBpmChange]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="transport-bar flex items-center gap-2 bg-gray-950 border border-gray-800 rounded-2xl px-4 py-2 shadow-2xl"
    >
      {/* Play/Pause */}
      <button
        onClick={handlePlayPause}
        className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all active:scale-90"
        title={`Play / Pause (Space)`}
      >
        <motion.div
          key={isPlaying ? "pause" : "play"}
          initial={{ rotate: -90, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          exit={{ rotate: 90, opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </motion.div>
      </button>

      {/* Stop */}
      <button
        onClick={onStop}
        className="p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition-all active:scale-90"
        title={`Stop (Shift+Space)`}
      >
        <Square size={16} fill="currentColor" />
      </button>

      {/* Record */}
      <button
        onClick={handleRecord}
        className={`p-2.5 rounded-xl transition-all active:scale-90 relative ${
          isRecording
            ? "bg-red-600 text-white shadow-lg shadow-red-500/30"
            : "bg-gray-800 hover:bg-gray-700 text-gray-400"
        }`}
        title={`Record (R)`}
      >
        <Circle size={16} fill="currentColor" className={isRecording ? "animate-pulse" : ""} />
        {isRecording && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-ping" />
        )}
      </button>

      <div className="w-px h-8 bg-gray-800 mx-1" />

      {/* Position display */}
      <div className="flex items-center gap-3 bg-gray-900 px-3 py-1.5 rounded-xl border border-gray-800">
        <Timer size={14} className="text-gray-500" />
        <span className="font-mono text-lg font-bold text-cyan-400 tracking-wider tabular-nums">
          {formatPos(position)}
        </span>
        <div className="flex items-center gap-1">
          <SkipBack
            size={12}
            className="text-gray-600 hover:text-white cursor-pointer transition-colors"
            onClick={() => onPositionChange({ ...position, bars: Math.max(0, position.bars - 1) })}
          />
          <SkipForward
            size={12}
            className="text-gray-600 hover:text-white cursor-pointer transition-colors"
            onClick={() => onPositionChange({ ...position, bars: position.bars + 1 })}
          />
        </div>
      </div>

      <div className="w-px h-8 bg-gray-800 mx-1" />

      {/* BPM */}
      <div
        className="flex items-center gap-2 bg-gray-900 px-3 py-1.5 rounded-xl border border-gray-800 cursor-ew-resize select-none"
        onPointerDown={startBpmDrag}
        onWheel={handleBpmWheel}
        title="Drag up/down or scroll to change BPM"
      >
        <Gauge size={14} className="text-blue-400" />
        <span className="font-mono text-base font-bold text-white tabular-nums">{bpm}</span>
        <span className="text-[9px] text-gray-500 font-bold">BPM</span>
      </div>

      {/* Tap Tempo */}
      <button
        onClick={handleTapTempo}
        className="px-2 py-1.5 text-[10px] font-bold bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition-all active:scale-90"
        title="Tap Tempo (tap 4 times)"
      >
        Tap
      </button>

      {/* Time Signature */}
      <div className="flex items-center gap-1 bg-gray-900 px-2 py-1.5 rounded-xl border border-gray-800">
        <span className="font-mono text-xs font-bold text-gray-300">4/4</span>
      </div>

      <div className="w-px h-8 bg-gray-800 mx-1" />

      {/* Loop */}
      <button
        onClick={onLoopToggle}
        className={`p-2 rounded-lg transition-all ${
          isLooping ? "bg-amber-600 text-white shadow-sm" : "bg-gray-800 text-gray-500 hover:text-gray-300"
        }`}
        title={`Loop Toggle (L)`}
      >
        <Repeat size={14} />
      </button>

      {/* Metronome */}
      <button
        onClick={onMetronomeToggle}
        className={`p-2 rounded-lg transition-all ${
          isMetronomeOn ? "bg-green-600 text-white shadow-sm" : "bg-gray-800 text-gray-500 hover:text-gray-300"
        }`}
        title={`Metronome (M)`}
      >
        <Timer size={14} />
      </button>

      {/* MIDI Panic */}
      <button
        onClick={handlePanic}
        className="p-2 rounded-lg bg-gray-800 text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
        title="MIDI Panic - All Notes Off (Esc)"
      >
        <AlertTriangle size={14} />
      </button>

      <div className="flex-1" />

      {/* Pre-roll / Post-roll */}
      <div className="flex items-center gap-1">
        <button className="px-2 py-1 text-[9px] font-bold bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-all">
          Pre
        </button>
        <button className="px-2 py-1 text-[9px] font-bold bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-all">
          Post
        </button>
      </div>

      {/* Playhead position slider */}
      <div className="flex items-center gap-2 min-w-[120px]">
        <ArrowLeftRight size={12} className="text-gray-600" />
        <input
          type="range"
          min={0}
          max={128}
          step={1}
          value={position.bars * 4 + position.beats - 1}
          onChange={(e) => {
            const total = parseInt(e.target.value);
            const bars = Math.floor(total / 4);
            const beats = (total % 4) + 1;
            onPositionChange({ bars, beats, sixteenths: 1 });
          }}
          className="flex-1 h-1 appearance-none bg-gray-800 rounded-full cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500
            [&::-webkit-slider-thumb]:shadow-lg"
        />
      </div>
    </motion.div>
  );
}
