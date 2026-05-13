import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { 
  Star, Trash2, Copy, Download, Upload, Search, 
  Filter, Heart, SlidersHorizontal, Music, Drum, Mic, Sparkles
} from "lucide-react";
import type { PluginInstance } from "../../types/audio";

interface Preset {
  id: string;
  name: string;
  description: string;
  author: string;
  category: string;
  plugins: Array<{
    id: string;
    plugin_name: string;
    enabled: boolean;
    mix: number;
    parameters: Array<{ name: string; value: number }>;
  }>;
  tags: string[];
  favorite: boolean;
  rating: number;
  created_at: string;
  updated_at: string;
}

interface PresetManagerProps {
  onSelectPreset: (preset: Preset) => void;
  onSaveChain: (name: string, description: string, category: string, tags: string[]) => void;
  currentChain?: PluginInstance[];
}

const CATEGORY_ICONS: Record<string, typeof Music> = {
  vocal: Mic,
  drums: Drum,
  bass: Music,
  guitar: Music,
  synth: Sparkles,
  master: SlidersHorizontal,
  fx: Sparkles,
  custom: Music,
};

export function PresetManager({ onSelectPreset, onSaveChain, currentChain }: PresetManagerProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);

  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveCategory, setSaveCategory] = useState("custom");
  const [saveTags, setSaveTags] = useState("");

  const fetchPresets = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append("search", searchQuery);
      if (selectedCategory) params.append("category", selectedCategory);
      if (showFavorites) params.append("favorites_only", "true");

      const res = await fetch(`/v1/presets/list?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets);
        setCategories(data.categories);
      }
    } catch (err) {
      console.error("Failed to fetch presets:", err);
    }
  }, [searchQuery, selectedCategory, showFavorites]);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const toggleFavorite = async (presetId: string) => {
    try {
      const res = await fetch(`/v1/presets/${presetId}/favorite`, { method: "POST" });
      if (res.ok) {
        fetchPresets();
      }
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
    }
  };

  const deletePreset = async (presetId: string) => {
    if (!confirm("Delete this preset?")) return;
    try {
      const res = await fetch(`/v1/presets/${presetId}`, { method: "DELETE" });
      if (res.ok) {
        fetchPresets();
      }
    } catch (err) {
      console.error("Failed to delete preset:", err);
    }
  };

  const duplicatePreset = async (preset: Preset) => {
    try {
      const res = await fetch(`/v1/presets/${preset.id}/duplicate?new_name=${encodeURIComponent(preset.name + " (Copy)")}`, {
        method: "POST",
      });
      if (res.ok) {
        fetchPresets();
      }
    } catch (err) {
      console.error("Failed to duplicate preset:", err);
    }
  };

  const saveChain = async () => {
    if (!saveName.trim() || !currentChain?.length) return;
    
    const plugins = currentChain.map((p) => ({
      id: p.id,
      plugin_name: p.plugin_name,
      enabled: p.enabled,
      mix: p.mix,
      parameters: Object.entries(p.parameters).map(([name, value]) => ({ name, value })),
    }));

    try {
      const res = await fetch("/v1/presets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName,
          description: saveDescription,
          category: saveCategory,
          tags: saveTags.split(",").map((t) => t.trim()).filter(Boolean),
          plugins,
        }),
      });

      if (res.ok) {
        setShowSaveDialog(false);
        setSaveName("");
        setSaveDescription("");
        setSaveTags("");
        fetchPresets();
      }
    } catch (err) {
      console.error("Failed to save preset:", err);
    }
  };

  const exportPreset = async (preset: Preset) => {
    try {
      const res = await fetch(`/v1/presets/${preset.id}/export`);
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${preset.name.replace(/\s+/g, "_")}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Failed to export preset:", err);
    }
  };

  const importPreset = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const res = await fetch("/v1/presets/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        if (res.ok) {
          fetchPresets();
        }
      } catch (err) {
        console.error("Failed to import preset:", err);
      }
    };
    input.click();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-200">Plugin Presets</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={importPreset}
            className="p-2 bg-gray-800 rounded hover:bg-gray-700"
            title="Import Preset"
          >
            <Upload size={16} className="text-gray-400" />
          </button>
          {currentChain && currentChain.length > 0 && (
            <button
              onClick={() => setShowSaveDialog(true)}
              className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-500"
            >
              Save Chain
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search presets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-800 rounded text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>
        <button
          onClick={() => setShowFavorites(!showFavorites)}
          className={`p-2 rounded ${showFavorites ? "bg-yellow-600 text-white" : "bg-gray-800 text-gray-400"}`}
          title="Favorites"
        >
          <Heart size={16} fill={showFavorites ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="flex gap-1 mb-4 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1 rounded text-xs whitespace-nowrap ${
            selectedCategory === null ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400"
          }`}
        >
          All
        </button>
        {categories.map((cat) => {
          const Icon = CATEGORY_ICONS[cat] || Music;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded text-xs whitespace-nowrap flex items-center gap-1 ${
                selectedCategory === cat ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400"
              }`}
            >
              <Icon size={12} />
              {cat}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {presets.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <SlidersHorizontal size={32} className="mx-auto mb-2 opacity-50" />
            <p>No presets found</p>
            {currentChain && currentChain.length > 0 && (
              <button
                onClick={() => setShowSaveDialog(true)}
                className="mt-2 text-purple-400 hover:underline text-sm"
              >
                Save current chain as preset
              </button>
            )}
          </div>
        ) : (
          presets.map((preset) => (
            <motion.div
              key={preset.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`bg-gray-800 rounded-lg p-3 cursor-pointer hover:bg-gray-700 transition-colors ${
                selectedPreset?.id === preset.id ? "ring-1 ring-purple-500" : ""
              }`}
              onClick={() => setSelectedPreset(preset)}
              onDoubleClick={() => onSelectPreset(preset)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-200 truncate">{preset.name}</h3>
                    {preset.favorite && <Heart size={14} className="text-yellow-500 fill-yellow-500" />}
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{preset.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-400 capitalize">
                      {preset.category}
                    </span>
                    <span className="text-xs text-gray-500">{preset.author}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(preset.id); }}
                    className="p-1 hover:bg-gray-700 rounded"
                  >
                    <Heart size={14} className={preset.favorite ? "text-yellow-500 fill-yellow-500" : "text-gray-500"} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); duplicatePreset(preset); }}
                    className="p-1 hover:bg-gray-700 rounded"
                    title="Duplicate"
                  >
                    <Copy size={14} className="text-gray-500" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); exportPreset(preset); }}
                    className="p-1 hover:bg-gray-700 rounded"
                    title="Export"
                  >
                    <Download size={14} className="text-gray-500" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePreset(preset.id); }}
                    className="p-1 hover:bg-gray-700 rounded"
                    title="Delete"
                  >
                    <Trash2 size={14} className="text-gray-500 hover:text-red-500" />
                  </button>
                </div>
              </div>

              {selectedPreset?.id === preset.id && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <div className="text-xs text-gray-500 mb-2">Plugins ({preset.plugins.length})</div>
                  <div className="flex flex-wrap gap-1">
                    {preset.plugins.map((p) => (
                      <span
                        key={p.id}
                        className={`text-xs px-2 py-0.5 rounded ${
                          p.enabled ? "bg-purple-900/50 text-purple-300" : "bg-gray-700 text-gray-500"
                        }`}
                      >
                        {p.plugin_name}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectPreset(preset); }}
                      className="flex-1 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-500"
                    >
                      Load Preset
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>

      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-900 rounded-xl p-6 w-96 max-w-full mx-4"
          >
            <h3 className="text-lg font-semibold text-gray-200 mb-4">Save Plugin Chain</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Name</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="My Preset"
                  className="w-full px-3 py-2 bg-gray-800 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Description</label>
                <textarea
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="Describe your preset..."
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-800 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Category</label>
                <select
                  value={saveCategory}
                  onChange={(e) => setSaveCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 rounded text-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="custom">Custom</option>
                </select>
              </div>
              
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Tags (comma separated)</label>
                <input
                  type="text"
                  value={saveTags}
                  onChange={(e) => setSaveTags(e.target.value)}
                  placeholder="vocal, warm, punchy"
                  className="w-full px-3 py-2 bg-gray-800 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowSaveDialog(false)}
                className="flex-1 py-2 bg-gray-800 text-gray-400 rounded hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={saveChain}
                disabled={!saveName.trim()}
                className="flex-1 py-2 bg-purple-600 text-white rounded hover:bg-purple-500 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}