import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  Music,
  X,
  Trash2,
  Search,
  Filter,
  Play,
  Pause,
  BarChart2,
  Mic,
  Drum,
  Disc3,
  Sliders,
} from "lucide-react";
import { uploadAudioClip, listAudioClips, deleteAudioClip, analyzeAudioClip, type AudioClip } from "../../api/client";

const CATEGORY_ICONS: Record<string, typeof Music> = {
  reference: Music,
  sample: Disc3,
  loop: Drum,
  stem: Sliders,
  instrumental: Music,
  vocal: Mic,
};

const CATEGORY_COLORS: Record<string, string> = {
  reference: "bg-purple-600",
  sample: "bg-blue-600",
  loop: "bg-green-600",
  stem: "bg-yellow-600",
  instrumental: "bg-orange-600",
  vocal: "bg-pink-600",
};

interface AudioClipsManagerProps {
  onSelectClip?: (clip: AudioClip) => void;
  onUseInGeneration?: (clipId: string) => void;
}

export function AudioClipsManager({ onSelectClip, onUseInGeneration }: AudioClipsManagerProps) {
  const [clips, setClips] = useState<AudioClip[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedClip, setSelectedClip] = useState<AudioClip | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [analysisResults, setAnalysisResults] = useState<Record<string, unknown> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadClips = useCallback(async () => {
    try {
      const data = await listAudioClips(category || undefined, search || undefined);
      setClips(data.clips);
    } catch (e) {
      console.error("Failed to load clips:", e);
    }
  }, [category, search]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await uploadAudioClip(file, file.name, category || "reference");
      await loadClips();
      setShowUpload(false);
    } catch (e) {
      console.error("Upload failed:", e);
      alert("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = Array.from(e.dataTransfer.files).find(
      (f) => f.type.startsWith("audio/") || f.name.match(/\.(wav|mp3|ogg|flac|m4a|aac|webm)$/i)
    );
    if (file) void handleUpload(file);
  }, [category]);

  const handleAnalyze = async (clipId: string) => {
    setAnalyzing(clipId);
    try {
      const result = await analyzeAudioClip(clipId);
      setAnalysisResults(result);
    } catch (e) {
      console.error("Analysis failed:", e);
    } finally {
      setAnalyzing(null);
    }
  };

  const handleDelete = async (clipId: string) => {
    if (!confirm("Delete this clip?")) return;
    try {
      await deleteAudioClip(clipId);
      setClips((prev) => prev.filter((c) => c.id !== clipId));
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-200">Audio Clips</h2>
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm flex items-center gap-2"
        >
          <Upload size={16} />
          Upload Clip
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search clips..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void loadClips()}
            className="w-full pl-9 pr-3 py-2 bg-gray-800 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>
      </div>

      <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
        <button
          onClick={() => setCategory(null)}
          className={`px-3 py-1 rounded text-xs whitespace-nowrap ${
            category === null ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400"
          }`}
        >
          All
        </button>
        {Object.keys(CATEGORY_ICONS).map((cat) => {
          const Icon = CATEGORY_ICONS[cat];
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1 rounded text-xs whitespace-nowrap flex items-center gap-1 ${
                category === cat ? `${CATEGORY_COLORS[cat]} text-white` : "bg-gray-800 text-gray-400"
              }`}
            >
              <Icon size={12} />
              {cat}
            </button>
          );
        })}
      </div>

      {clips.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 py-12">
          <Music size={48} className="mb-4 opacity-30" />
          <p className="mb-2">No audio clips yet</p>
          <button
            onClick={() => setShowUpload(true)}
            className="text-purple-400 hover:underline text-sm"
          >
            Upload your first clip
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-2">
          {clips.map((clip) => (
            <motion.div
              key={clip.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-gray-800 rounded-lg p-3 hover:bg-gray-700 transition-colors cursor-pointer ${
                selectedClip?.id === clip.id ? "ring-1 ring-purple-500" : ""
              }`}
              onClick={() => setSelectedClip(clip)}
              onDoubleClick={() => onSelectClip?.(clip)}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded flex items-center justify-center ${CATEGORY_COLORS[clip.category] || "bg-gray-600"}`}>
                  {(() => {
                    const Icon = CATEGORY_ICONS[clip.category] || Music;
                    return <Icon size={20} className="text-white" />;
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">{clip.name}</div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="capitalize">{clip.category}</span>
                    <span>·</span>
                    <span>{clip.duration_sec.toFixed(1)}s</span>
                    <span>·</span>
                    <span>{clip.sample_rate}Hz</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAnalyze(clip.id); }}
                    disabled={analyzing === clip.id}
                    className="p-1.5 hover:bg-gray-600 rounded"
                    title="Analyze"
                  >
                    <BarChart2 size={14} className="text-gray-400" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onUseInGeneration?.(clip.id); }}
                    className="p-1.5 hover:bg-gray-600 rounded"
                    title="Use in Generation"
                  >
                    <Music size={14} className="text-gray-400" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(clip.id); }}
                    className="p-1.5 hover:bg-gray-600 rounded"
                    title="Delete"
                  >
                    <Trash2 size={14} className="text-gray-400 hover:text-red-500" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={() => !uploading && setShowUpload(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gray-900 rounded-xl p-6 w-[480px] max-w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Upload Audio Clip</h3>
                <button
                  onClick={() => setShowUpload(false)}
                  disabled={uploading}
                  className="text-gray-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  dragOver ? "border-green-500 bg-green-900/20" : "border-gray-600 hover:border-gray-500"
                }`}
              >
                {uploading ? (
                  <div className="text-white">Uploading...</div>
                ) : (
                  <>
                    <Upload size={32} className="mx-auto mb-3 text-gray-400" />
                    <p className="text-gray-300 mb-2">Drag & drop audio file</p>
                    <p className="text-gray-500 text-sm mb-4">or</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.webm"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUpload(file);
                      }}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                    >
                      Browse Files
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {analysisResults && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="mt-4 bg-gray-800 rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-white font-medium flex items-center gap-2">
                <BarChart2 size={16} />
                Analysis Results
              </h4>
              <button onClick={() => setAnalysisResults(null)} className="text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-gray-500 text-xs">Tempo</div>
                <div className="text-white font-mono">{(analysisResults as Record<string, unknown>).tempo_bpm as number} BPM</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">RMS</div>
                <div className="text-white font-mono">{(analysisResults as Record<string, unknown>).rms_dbfs as number} dBFS</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Spectral Centroid</div>
                <div className="text-white font-mono">{(analysisResults as Record<string, unknown>).spectral_centroid as number} Hz</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}