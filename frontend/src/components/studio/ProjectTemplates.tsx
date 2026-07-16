import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FilePlus2, Zap, Music, Cloud, Coffee, Disc3,
  Guitar, Speaker, Radio, Mic2, X, Search,
  Loader2,
} from "lucide-react";
import { TEMPLATES, type TemplateInfo } from "../../api/sessionTemplates";

interface ProjectTemplatesProps {
  onSelect: (template: TemplateInfo) => void;
  onClose: () => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
  FilePlus2,
  Zap,
  Music,
  Cloud,
  Coffee,
  Disc3,
  Guitar,
  Speaker,
  Radio,
  Mic2,
};

const GENRE_COLORS: Record<string, string> = {
  any: "from-gray-600 to-gray-700",
  electronic: "from-purple-600 to-pink-600",
  hiphop: "from-orange-600 to-red-600",
  rock: "from-yellow-600 to-red-600",
  jazz: "from-amber-600 to-yellow-600",
  orchestral: "from-blue-600 to-indigo-600",
  lofi: "from-green-600 to-teal-600",
  ambient: "from-cyan-600 to-blue-600",
  pop: "from-pink-600 to-purple-600",
  podcast: "from-slate-600 to-gray-600",
};

export function ProjectTemplates({ onSelect, onClose }: ProjectTemplatesProps) {
  const [search, setSearch] = useState("");
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  const genres = useMemo(() => {
    const g = new Set<string>();
    TEMPLATES.forEach((t) => g.add(t.genre));
    return Array.from(g);
  }, []);

  const filtered = useMemo(() => {
    let result = [...TEMPLATES];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.genre.toLowerCase().includes(q),
      );
    }
    if (selectedGenre) {
      result = result.filter((t) => t.genre === selectedGenre);
    }
    return result;
  }, [search, selectedGenre]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          className="bg-gray-950 border border-gray-800 rounded-3xl shadow-2xl w-[800px] max-h-[85vh] flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <FilePlus2 size={18} className="text-blue-500" />
              <h2 className="text-lg font-bold text-white">
                Project Templates
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-gray-800 text-gray-500 hover:text-white transition-all"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-4 space-y-4 shrink-0">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-blue-500/50 transition-colors"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedGenre(null)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                  !selectedGenre
                    ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                    : "bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                }`}
              >
                All
              </button>
              {genres.map((genre) => (
                <button
                  key={genre}
                  onClick={() =>
                    setSelectedGenre(genre === selectedGenre ? null : genre)
                  }
                  className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all capitalize ${
                    selectedGenre === genre
                      ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                      : "bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                  }`}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FilePlus2 className="w-12 h-12 text-gray-700 mb-3" />
                <p className="text-gray-400 font-bold text-sm">
                  No templates found
                </p>
                <p className="text-gray-600 text-xs mt-1">
                  Try adjusting your search or filters
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {filtered.map((template, index) => {
                  const IconComponent =
                    ICON_MAP[template.icon] ?? FilePlus2;
                  const gradient =
                    GENRE_COLORS[template.genre] ?? "from-gray-600 to-gray-700";

                  return (
                    <motion.div
                      key={template.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.04 }}
                      className="group bg-gray-900/50 border border-gray-800 rounded-2xl p-4 hover:border-gray-700 transition-all cursor-pointer flex flex-col"
                      onClick={() => onSelect(template)}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center mb-3 shadow-lg`}
                      >
                        <IconComponent size={18} className="text-white" />
                      </div>

                      <h4 className="text-sm font-bold text-gray-200 group-hover:text-white transition-colors">
                        {template.name}
                      </h4>
                      <p className="text-[10px] text-gray-500 mt-1 leading-relaxed flex-1">
                        {template.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-800/50">
                        <span className="text-[9px] font-mono font-bold text-gray-400 bg-gray-800/50 px-1.5 py-0.5 rounded">
                          {template.bpm} BPM
                        </span>
                        <span className="text-[9px] font-mono font-bold text-gray-400 bg-gray-800/50 px-1.5 py-0.5 rounded">
                          {template.key}
                        </span>
                        <span className="text-[9px] font-mono font-bold text-gray-400 bg-gray-800/50 px-1.5 py-0.5 rounded">
                          {template.trackCount} tracks
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(template);
                        }}
                        className="mt-3 w-full py-2 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 hover:text-blue-300 text-[10px] font-bold transition-all border border-blue-500/10 hover:border-blue-500/20"
                      >
                        Use Template
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
