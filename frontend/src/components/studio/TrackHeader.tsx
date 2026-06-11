import { useState, useCallback, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Music, Volume2, Activity, FolderTree, GripVertical,
  Mic, Headphones, Snowflake, Lock, ArrowUpDown,
} from "lucide-react";

type TrackType = "audio" | "midi" | "bus" | "group" | "vca";
type TrackSize = "small" | "medium" | "large";

interface TrackData {
  id: string;
  name: string;
  type: TrackType;
  color: string;
  armed: boolean;
  muted: boolean;
  solo: boolean;
  monitoring: boolean;
  automationArm: boolean;
  frozen: boolean;
  locked: boolean;
  height: TrackSize;
  inputChannel?: string;
  outputBus?: string;
}

interface TrackHeaderProps {
  track: TrackData;
  onUpdate: (updates: Partial<TrackData>) => void;
  onSelect: () => void;
  isSelected: boolean;
}

const TRACK_ICONS: Record<TrackType, typeof Music> = {
  audio: Mic,
  midi: Music,
  bus: Volume2,
  group: FolderTree,
  vca: Activity,
};

const TRACK_SIZE_OPTIONS: TrackSize[] = ["small", "medium", "large"];

const INPUT_CHANNELS = ["In 1", "In 2", "In 3-4", "In 5-8", "SPDIF L", "SPDIF R", "ADAT 1", "ADAT 2"];
const OUTPUT_BUSSES = ["Master", "Bus 1", "Bus 2", "FX Send 1", "FX Send 2", "Sidechain"];

export function TrackHeader({ track, onUpdate, onSelect, isSelected }: TrackHeaderProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(track.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const Icon = TRACK_ICONS[track.type] || Music;

  useEffect(() => {
    if (editingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingName]);

  const handleNameSubmit = useCallback(() => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== track.name) {
      onUpdate({ name: trimmed });
    } else {
      setNameDraft(track.name);
    }
    setEditingName(false);
  }, [nameDraft, track.name, onUpdate]);

  const cycleHeight = useCallback(() => {
    const idx = TRACK_SIZE_OPTIONS.indexOf(track.height);
    const next = TRACK_SIZE_OPTIONS[(idx + 1) % TRACK_SIZE_OPTIONS.length];
    onUpdate({ height: next });
  }, [track.height, onUpdate]);

  return (
    <motion.div
      layout
      className={`track-header flex items-center gap-2 px-3 py-2 rounded-xl border transition-all select-none ${
        isSelected
          ? "bg-gray-800/80 border-blue-500/50 shadow-sm"
          : "bg-gray-900/50 border-gray-800/50 hover:bg-gray-800/50"
      }`}
      onClick={onSelect}
      style={{ borderLeftColor: track.color, borderLeftWidth: 3 }}
    >
      {/* Drag handle */}
      <GripVertical size={12} className="text-gray-700 cursor-grab active:cursor-grabbing shrink-0" />

      {/* Track type icon */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: track.color + "20", color: track.color }}
      >
        <Icon size={14} />
      </div>

      {/* Track name */}
      {editingName ? (
        <input
          ref={inputRef}
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={handleNameSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleNameSubmit();
            if (e.key === "Escape") { setNameDraft(track.name); setEditingName(false); }
          }}
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs font-bold text-white outline-none min-w-0"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="flex-1 text-xs font-bold text-gray-200 truncate min-w-0 cursor-pointer hover:text-white"
          onDoubleClick={(e) => { e.stopPropagation(); setEditingName(true); }}
        >
          {track.name}
        </span>
      )}

      {/* Arm */}
      <button
        onClick={(e) => { e.stopPropagation(); onUpdate({ armed: !track.armed }); }}
        className={`w-6 h-6 rounded text-[9px] font-black transition-all shrink-0 ${
          track.armed ? "bg-red-600 text-white shadow-sm" : "bg-gray-800 text-gray-600 hover:text-red-400"
        }`}
        title="Arm Record"
      >
        R
      </button>

      {/* Mute */}
      <button
        onClick={(e) => { e.stopPropagation(); onUpdate({ muted: !track.muted }); }}
        className={`w-6 h-6 rounded text-[9px] font-black transition-all shrink-0 ${
          track.muted ? "bg-red-600 text-white shadow-sm" : "bg-gray-800 text-gray-600 hover:text-gray-300"
        }`}
        title="Mute (M)"
      >
        M
      </button>

      {/* Solo */}
      <button
        onClick={(e) => { e.stopPropagation(); onUpdate({ solo: !track.solo }); }}
        className={`w-6 h-6 rounded text-[9px] font-black transition-all shrink-0 ${
          track.solo ? "bg-yellow-500 text-black shadow-sm" : "bg-gray-800 text-gray-600 hover:text-yellow-400"
        }`}
        title="Solo (S)"
      >
        S
      </button>

      {/* Monitor */}
      <button
        onClick={(e) => { e.stopPropagation(); onUpdate({ monitoring: !track.monitoring }); }}
        className={`w-6 h-6 rounded flex items-center justify-center transition-all shrink-0 ${
          track.monitoring ? "bg-green-600 text-white shadow-sm" : "bg-gray-800 text-gray-600 hover:text-green-400"
        }`}
        title="Monitor"
      >
        <Headphones size={10} />
      </button>

      {/* Automation arm */}
      <button
        onClick={(e) => { e.stopPropagation(); onUpdate({ automationArm: !track.automationArm }); }}
        className={`w-6 h-6 rounded flex items-center justify-center transition-all shrink-0 ${
          track.automationArm ? "bg-purple-600 text-white shadow-sm" : "bg-gray-800 text-gray-600 hover:text-purple-400"
        }`}
        title="Automation Arm"
      >
        <Activity size={10} />
      </button>

      {/* Freeze */}
      <button
        onClick={(e) => { e.stopPropagation(); onUpdate({ frozen: !track.frozen }); }}
        className={`w-6 h-6 rounded flex items-center justify-center transition-all shrink-0 ${
          track.frozen ? "bg-cyan-600 text-white shadow-sm" : "bg-gray-800 text-gray-600 hover:text-cyan-400"
        }`}
        title="Freeze Track"
      >
        <Snowflake size={10} />
      </button>

      {/* Lock */}
      <button
        onClick={(e) => { e.stopPropagation(); onUpdate({ locked: !track.locked }); }}
        className={`w-6 h-6 rounded flex items-center justify-center transition-all shrink-0 ${
          track.locked ? "bg-orange-600 text-white shadow-sm" : "bg-gray-800 text-gray-600 hover:text-orange-400"
        }`}
        title="Lock Track"
      >
        <Lock size={10} />
      </button>

      <div className="w-px h-5 bg-gray-800 shrink-0" />

      {/* Height toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); cycleHeight(); }}
        className="w-5 h-5 rounded flex items-center justify-center bg-gray-800 text-gray-500 hover:text-white transition-all shrink-0"
        title={`Size: ${track.height}`}
      >
        <ArrowUpDown size={10} />
      </button>

      {/* Input selector */}
      {track.type === "audio" && (
        <select
          value={track.inputChannel || ""}
          onChange={(e) => onUpdate({ inputChannel: e.target.value || undefined })}
          onClick={(e) => e.stopPropagation()}
          className="bg-gray-800 border border-gray-700 rounded text-[8px] text-gray-400 px-1 py-0.5 outline-none max-w-[60px] truncate"
          title="Input Channel"
        >
          <option value="">In</option>
          {INPUT_CHANNELS.map((ch) => (
            <option key={ch} value={ch}>{ch}</option>
          ))}
        </select>
      )}

      {/* Output selector */}
      <select
        value={track.outputBus || ""}
        onChange={(e) => onUpdate({ outputBus: e.target.value || undefined })}
        onClick={(e) => e.stopPropagation()}
        className="bg-gray-800 border border-gray-700 rounded text-[8px] text-gray-400 px-1 py-0.5 outline-none max-w-[60px] truncate"
        title="Output Routing"
      >
        <option value="">Out</option>
        {OUTPUT_BUSSES.map((bus) => (
          <option key={bus} value={bus}>{bus}</option>
        ))}
      </select>

      {/* Color indicator */}
      <div
        className="w-2 h-full min-h-[24px] rounded-sm shrink-0"
        style={{ backgroundColor: track.color }}
      />
    </motion.div>
  );
}
