import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Disc3, FileAudio, FileType, Radio,
  Search, X, Import, Download, GripVertical,
  ChevronLeft, ChevronRight,
  Music, Sliders, Waves, Mic,
} from "lucide-react";
import { LoopBrowser } from "./LoopBrowser";
import type { LoopData } from "./LoopCell";

type TabKey = "loops" | "samples" | "presets" | "recordings";

interface LibraryPanelProps {
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  onWidthChange?: (width: number) => void;
  onImport?: (tab: TabKey) => void;
  loops?: LoopData[];
  favorites?: Set<string>;
  onToggleFavorite?: (loopId: string) => void;
  onLoopSelect?: (loop: LoopData) => void;
  onDropToTrack?: (loop: LoopData, trackId?: string) => void;
}

const TABS: { key: TabKey; label: string; icon: typeof Music }[] = [
  { key: "loops", label: "Loops", icon: Music },
  { key: "samples", label: "Samples", icon: FileAudio },
  { key: "presets", label: "Presets", icon: Sliders },
  { key: "recordings", label: "Recordings", icon: Mic },
];

interface SampleEntry {
  id: string;
  name: string;
  duration: number;
  format: string;
  size: number;
  dateAdded: string;
}

interface PresetEntry {
  id: string;
  name: string;
  type: "synth" | "effect" | "drum";
  author: string;
  tags: string[];
}

interface RecordingEntry {
  id: string;
  name: string;
  duration: number;
  date: string;
  channels: number;
  sampleRate: number;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SamplesTab({ search }: { search: string }) {
  const samples: SampleEntry[] = [
    { id: "s1", name: "Kick_808.wav", duration: 3.2, format: "WAV", size: 284_000, dateAdded: "2026-06-01" },
    { id: "s2", name: "Snare_Acoustic.wav", duration: 2.1, format: "WAV", size: 186_000, dateAdded: "2026-05-28" },
    { id: "s3", name: "HiHat_Closed.wav", duration: 0.8, format: "WAV", size: 72_000, dateAdded: "2026-05-25" },
    { id: "s4", name: "Clap_Room.flac", duration: 1.5, format: "FLAC", size: 124_000, dateAdded: "2026-05-20" },
    { id: "s5", name: "Tom_Low.aiff", duration: 4.0, format: "AIFF", size: 352_000, dateAdded: "2026-05-18" },
  ];

  const filtered = samples.filter(
    (s) => !search || s.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-1">
      {filtered.map((sample) => (
        <div
          key={sample.id}
          className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-800/50 transition-colors cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <FileAudio size={14} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-200 truncate">{sample.name}</p>
            <div className="flex items-center gap-2 text-[9px] font-mono text-gray-500">
              <span>{formatDuration(sample.duration)}</span>
              <span>{sample.format}</span>
              <span>{formatFileSize(sample.size)}</span>
            </div>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            className="p-1.5 rounded-lg text-gray-600 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-all"
          >
            <GripVertical size={12} />
          </motion.button>
        </div>
      ))}
      {filtered.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-xs">No samples found</div>
      )}
    </div>
  );
}

function PresetsTab({ search }: { search: string }) {
  const presets: PresetEntry[] = [
    { id: "p1", name: "Deep Sub Bass", type: "synth", author: "Native", tags: ["bass", "sub"] },
    { id: "p2", name: "Pluck Lead", type: "synth", author: "Native", tags: ["lead", "pluck"] },
    { id: "p3", name: "Room Reverb", type: "effect", author: "Native", tags: ["reverb", "ambient"] },
    { id: "p4", name: "Tape Delay", type: "effect", author: "Native", tags: ["delay", "tape"] },
    { id: "p5", name: "909 Kit", type: "drum", author: "Roland", tags: ["drums", "electronic"] },
    { id: "p6", name: "Analog Pad", type: "synth", author: "Native", tags: ["pad", "warm"] },
  ];

  const filtered = presets.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.tags.some((t) => t.includes(search.toLowerCase())),
  );

  return (
    <div className="space-y-1">
      {filtered.map((preset) => (
        <div
          key={preset.id}
          className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-800/50 transition-colors cursor-pointer group"
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            preset.type === "synth"
              ? "bg-purple-500/10 text-purple-400"
              : preset.type === "effect"
                ? "bg-green-500/10 text-green-400"
                : "bg-orange-500/10 text-orange-400"
          }`}>
            <Waves size={14} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-200 truncate">{preset.name}</p>
            <div className="flex items-center gap-1.5 text-[9px] text-gray-500">
              <span className="capitalize">{preset.type}</span>
              <span>·</span>
              <span>{preset.author}</span>
            </div>
          </div>
        </div>
      ))}
      {filtered.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-xs">No presets found</div>
      )}
    </div>
  );
}

function RecordingsTab({ search }: { search: string }) {
  const recordings: RecordingEntry[] = [
    { id: "r1", name: "Vocal Take 1", duration: 124, date: "2026-06-09", channels: 2, sampleRate: 48000 },
    { id: "r2", name: "Guitar Riff", duration: 32, date: "2026-06-08", channels: 1, sampleRate: 44100 },
    { id: "r3", name: "Synth Improv", duration: 256, date: "2026-06-07", channels: 2, sampleRate: 48000 },
  ];

  const filtered = recordings.filter(
    (r) => !search || r.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-1">
      {filtered.map((rec) => (
        <div
          key={rec.id}
          className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-800/50 transition-colors cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
            <Radio size={14} className="text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-gray-200 truncate">{rec.name}</p>
            <div className="flex items-center gap-2 text-[9px] font-mono text-gray-500">
              <span>{formatDuration(rec.duration)}</span>
              <span>{rec.channels}ch</span>
              <span>{rec.sampleRate / 1000}kHz</span>
            </div>
          </div>
          <span className="text-[9px] text-gray-600">{rec.date}</span>
        </div>
      ))}
      {filtered.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-xs">No recordings found</div>
      )}
    </div>
  );
}

export function LibraryPanel({
  width = 320,
  minWidth = 240,
  maxWidth = 600,
  onWidthChange,
  onImport,
  loops,
  favorites,
  onToggleFavorite,
  onLoopSelect,
  onDropToTrack,
}: LibraryPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("loops");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      resizeRef.current = { startX: e.clientX, startWidth: width };
      const onMove = (ev: PointerEvent) => {
        if (!resizeRef.current) return;
        const dx = ev.clientX - resizeRef.current.startX;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, resizeRef.current.startWidth + dx));
        onWidthChange?.(newWidth);
      };
      const onUp = () => {
        resizeRef.current = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [width, minWidth, maxWidth, onWidthChange],
  );

  const TabIcon = TABS.find((t) => t.key === activeTab)?.icon ?? Music;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-3 gap-2 bg-gray-950 border border-gray-800 rounded-2xl">
        {TABS.map((tab) => (
          <motion.button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setCollapsed(false); }}
            whileTap={{ scale: 0.9 }}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === tab.key ? "bg-blue-500/20 text-blue-400" : "text-gray-500 hover:text-gray-300"
            }`}
            title={tab.label}
          >
            <tab.icon size={16} />
          </motion.button>
        ))}
        <motion.button
          onClick={() => setCollapsed(false)}
          whileTap={{ scale: 0.9 }}
          className="p-2 rounded-lg text-gray-500 hover:text-gray-300 mt-auto"
        >
          <ChevronLeft size={14} />
        </motion.button>
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col h-full bg-gray-950 rounded-2xl border border-gray-800 overflow-hidden"
      style={{ width }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500/30 active:bg-blue-500/50 transition-colors z-20"
        onPointerDown={handleResizePointerDown}
      />

      <div className="p-4 pb-0 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TabIcon className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-bold text-gray-100">Library</h2>
          </div>
          <div className="flex items-center gap-1">
            <motion.button
              onClick={() => onImport?.(activeTab)}
              whileTap={{ scale: 0.9 }}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800"
              title="Import"
            >
              <Import size={14} />
            </motion.button>
            <motion.button
              onClick={() => setCollapsed(true)}
              whileTap={{ scale: 0.9 }}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800"
            >
              <ChevronRight size={14} />
            </motion.button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeTab}...`}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-8 pr-7 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex border-b border-gray-800">
          {TABS.map((tab) => (
            <motion.button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              whileTap={{ scale: 0.95 }}
              className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold transition-colors relative ${
                activeTab === tab.key
                  ? "text-blue-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <tab.icon size={12} />
              {tab.label}
              {activeTab === tab.key && (
                <motion.div
                  layoutId="library-tab-indicator"
                  className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full"
                />
              )}
            </motion.button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === "loops" && (
              <LoopBrowser
                loops={loops}
                favorites={favorites}
                onToggleFavorite={onToggleFavorite}
                onLoopSelect={onLoopSelect}
                onDropToTrack={onDropToTrack}
                onImport={() => onImport?.("loops")}
              />
            )}
            {activeTab === "samples" && <SamplesTab search={search} />}
            {activeTab === "presets" && <PresetsTab search={search} />}
            {activeTab === "recordings" && <RecordingsTab search={search} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
