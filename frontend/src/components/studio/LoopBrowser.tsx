import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, X, SlidersHorizontal, ArrowUpDown,
  Import, Music, Loader2, ChevronDown,
} from "lucide-react";
import { LoopCell } from "./LoopCell";
import type { LoopData } from "./LoopCell";

interface LoopBrowserProps {
  loops?: LoopData[];
  favorites?: Set<string>;
  onLoopSelect?: (loop: LoopData) => void;
  onDropToTrack?: (loop: LoopData, trackId?: string) => void;
  onToggleFavorite?: (loopId: string) => void;
  onImport?: () => void;
  isLoading?: boolean;
}

const CATEGORIES = [
  "All", "Drums", "Bass", "Synth", "FX", "Vocals", "Melody", "Pads", "Arp",
];

const KEYS = [
  "All", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
  "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm",
];

type SortField = "name" | "bpm" | "duration" | "dateAdded";

function SkeletonCell() {
  return (
    <div className="bg-gray-900/40 border border-gray-800/30 rounded-xl p-3 space-y-2 animate-pulse">
      <div className="flex justify-between">
        <div className="space-y-1.5 flex-1">
          <div className="h-4 bg-gray-800 rounded w-3/4" />
          <div className="flex gap-1.5">
            <div className="h-3 w-14 bg-gray-800 rounded-full" />
            <div className="h-3 w-12 bg-gray-800 rounded-full" />
          </div>
        </div>
        <div className="h-4 w-4 bg-gray-800 rounded" />
      </div>
      <div className="h-12 bg-gray-800 rounded-lg" />
      <div className="flex justify-between items-center">
        <div className="h-3 w-16 bg-gray-800 rounded-full" />
        <div className="h-8 w-8 bg-gray-800 rounded-full" />
      </div>
    </div>
  );
}

export function LoopBrowser({
  loops = [],
  favorites = new Set(),
  onLoopSelect,
  onDropToTrack,
  onToggleFavorite,
  onImport,
  isLoading = false,
}: LoopBrowserProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [bpmRange, setBpmRange] = useState<[number, number]>([60, 200]);
  const [selectedKey, setSelectedKey] = useState("All");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const filteredLoops = useMemo(() => {
    let result = [...loops];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.tags.some((t) => t.toLowerCase().includes(q)) ||
          l.key.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q),
      );
    }

    if (selectedCategory !== "All") {
      result = result.filter((l) => l.category === selectedCategory);
    }

    result = result.filter((l) => l.bpm >= bpmRange[0] && l.bpm <= bpmRange[1]);

    if (selectedKey !== "All") {
      result = result.filter((l) => l.key === selectedKey);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "bpm":
          cmp = a.bpm - b.bpm;
          break;
        case "duration":
          cmp = a.duration - b.duration;
          break;
        case "dateAdded":
          cmp = (a.dateAdded ?? "").localeCompare(b.dateAdded ?? "");
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [loops, search, selectedCategory, bpmRange, selectedKey, sortField, sortAsc]);

  const toggleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortAsc((a) => !a);
        return prev;
      }
      setSortAsc(true);
      return field;
    });
  }, []);

  const handleDragStart = useCallback(
    (loop: LoopData, e: React.PointerEvent) => {
      const dt = e.nativeEvent as unknown as DragEvent;
      if (dt.dataTransfer) {
        dt.dataTransfer.setData("application/x-loop", JSON.stringify(loop));
        dt.dataTransfer.effectAllowed = "move";
      }
    },
    [],
  );

  const handleClearSearch = useCallback(() => setSearch(""), []);

  return (
    <div className="flex flex-col h-full bg-gray-950 rounded-2xl border border-gray-800">
      <div className="p-4 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-bold text-gray-100">Loop Browser</h2>
          </div>
          <div className="flex items-center gap-1">
            <motion.button
              onClick={() => setShowFilters((v) => !v)}
              whileTap={{ scale: 0.9 }}
              className={`p-2 rounded-lg transition-colors ${
                showFilters ? "bg-blue-500/20 text-blue-400" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
              }`}
            >
              <SlidersHorizontal size={14} />
            </motion.button>
            <motion.button
              onClick={onImport}
              whileTap={{ scale: 0.9 }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-xs font-bold transition-colors"
            >
              <Import size={12} />
              Import
            </motion.button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search loops..."
            className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-8 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 transition-colors"
          />
          {search && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden space-y-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase w-8">BPM</span>
                <input
                  type="range"
                  min={60}
                  max={200}
                  value={bpmRange[0]}
                  onChange={(e) => setBpmRange(([_, h]) => [Math.min(parseInt(e.target.value), h), h])}
                  className="flex-1 h-1 appearance-none bg-gray-800 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
                />
                <input
                  type="range"
                  min={60}
                  max={200}
                  value={bpmRange[1]}
                  onChange={(e) => setBpmRange(([l, _]) => [l, Math.max(parseInt(e.target.value), l)])}
                  className="flex-1 h-1 appearance-none bg-gray-800 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
                />
                <span className="text-[11px] font-mono text-gray-400 w-16 text-right">
                  {bpmRange[0]}-{bpmRange[1]}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase w-8">Key</span>
                <select
                  value={selectedKey}
                  onChange={(e) => setSelectedKey(e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-800 rounded-lg text-xs text-gray-300 px-2 py-1.5 focus:outline-none focus:border-blue-500/50"
                >
                  {KEYS.map((k) => (
                    <option key={k} value={k}>{k === "All" ? "All Keys" : k}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase w-8">Sort</span>
                <div className="flex gap-1">
                  {(["name", "bpm", "duration", "dateAdded"] as const).map((field) => (
                    <button
                      key={field}
                      onClick={() => toggleSort(field)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                        sortField === field
                          ? "bg-blue-500/20 text-blue-400"
                          : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      {field === "dateAdded" ? "Recent" : field.charAt(0).toUpperCase() + field.slice(1)}
                      {sortField === field && (
                        <ArrowUpDown
                          size={10}
                          className={sortAsc ? "" : "rotate-180"}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <motion.button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              whileTap={{ scale: 0.95 }}
              className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                selectedCategory === cat
                  ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                  : "bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
              }`}
            >
              {cat}
            </motion.button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 custom-scrollbar">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCell key={i} />
            ))}
          </div>
        ) : filteredLoops.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Music className="w-12 h-12 text-gray-700 mb-3" />
            <p className="text-gray-400 font-bold text-sm">No loops found</p>
            <p className="text-gray-600 text-xs mt-1">
              {search || selectedCategory !== "All" || selectedKey !== "All"
                ? "Try adjusting your search or filters"
                : "Import some loops to get started"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredLoops.map((loop) => (
              <LoopCell
                key={loop.id}
                loop={loop}
                onPlay={onLoopSelect}
                onDragStart={handleDragStart}
                onToggleFavorite={onToggleFavorite}
                isPlaying={false}
                isFavorite={favorites.has(loop.id)}
              />
            ))}
          </div>
        )}
      </div>

      {!isLoading && filteredLoops.length > 0 && (
        <div className="shrink-0 px-4 py-2 border-t border-gray-800/50 flex items-center justify-between">
          <span className="text-[10px] text-gray-500 font-mono">
            {filteredLoops.length} of {loops.length} loops
          </span>
          <div className="flex items-center gap-1 text-gray-600">
            <ChevronDown size={12} />
          </div>
        </div>
      )}
    </div>
  );
}
