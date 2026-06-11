import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  Plus, Power, PowerOff, Settings2, Trash2, GripVertical,
  Search, X, ChevronDown, SlidersHorizontal,
  SlidersHorizontal, Sidebar,
} from "lucide-react";

interface PluginParam {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

interface PluginInstance {
  id: string;
  name: string;
  category: string;
  bypassed: boolean;
  wetDry: number;
  params: PluginParam[];
  sidechainSource?: string;
  preset?: string;
}

interface AvailablePlugin {
  id: string;
  name: string;
  category: string;
  params?: PluginParam[];
  presets?: string[];
}

interface PluginRackProps {
  plugins: PluginInstance[];
  onReorder: (plugins: PluginInstance[]) => void;
  onAdd: (plugin: AvailablePlugin) => void;
  onRemove: (id: string) => void;
  onBypass: (id: string, bypassed: boolean) => void;
  onParamChange: (pluginId: string, paramName: string, value: number) => void;
  onWetDry: (pluginId: string, mix: number) => void;
  availablePlugins: AvailablePlugin[];
}

const CATEGORIES = [
  "All",
  "EQ",
  "Compressor",
  "Reverb",
  "Delay",
  "Distortion",
  "Filter",
  "Modulation",
  "Dynamics",
  "Utility",
];

export function PluginRack({
  plugins,
  onReorder,
  onAdd,
  onRemove,
  onBypass,
  onParamChange,
  onWetDry,
  availablePlugins,
}: PluginRackProps) {
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserSearch, setBrowserSearch] = useState("");
  const [browserCategory, setBrowserCategory] = useState("All");
  const [editingPlugin, setEditingPlugin] = useState<string | null>(null);
  const [expandedParams, setExpandedParams] = useState<Set<string>>(new Set());

  const filteredPlugins = useMemo(() => {
    let result = [...availablePlugins];
    if (browserSearch.trim()) {
      const q = browserSearch.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (browserCategory !== "All") {
      result = result.filter((p) => p.category === browserCategory);
    }
    return result;
  }, [availablePlugins, browserSearch, browserCategory]);

  const toggleParams = useCallback((id: string) => {
    setExpandedParams((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAddClick = useCallback(
    (plugin: AvailablePlugin) => {
      onAdd(plugin);
      setBrowserOpen(false);
      setBrowserSearch("");
    },
    [onAdd],
  );

  return (
    <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-blue-500" />
          <h3 className="text-sm font-bold text-white">Plugin Rack</h3>
          <span className="text-[10px] text-gray-600 font-mono ml-1">
            {plugins.length} slot{plugins.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={() => setBrowserOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-bold transition-all"
        >
          <Plus size={12} />
          Add Plugin
        </button>
      </div>

      <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
        {plugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <SlidersHorizontal className="w-8 h-8 text-gray-700 mb-2" />
            <p className="text-gray-500 text-xs font-bold">No plugins loaded</p>
            <p className="text-gray-700 text-[10px] mt-1">
              Click "Add Plugin" to insert effects
            </p>
          </div>
        ) : (
          <Reorder.Group
            axis="y"
            values={plugins}
            onReorder={onReorder}
            className="space-y-1.5"
          >
            {plugins.map((plugin) => (
              <Reorder.Item
                key={plugin.id}
                value={plugin}
                className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden"
                style={{ listStyle: "none" }}
              >
                <div
                  className={`flex items-center gap-2 px-3 py-2.5 ${
                    plugin.bypassed
                      ? "opacity-40"
                      : ""
                  }`}
                >
                  <GripVertical
                    size={14}
                    className="text-gray-600 cursor-grab active:cursor-grabbing shrink-0"
                  />
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      plugin.bypassed
                        ? "bg-gray-600"
                        : "bg-blue-500"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-200 truncate">
                        {plugin.name}
                      </span>
                      <span className="text-[8px] text-gray-600 uppercase">
                        {plugin.category}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onBypass(plugin.id, !plugin.bypassed)}
                      className={`p-1.5 rounded-lg transition-all ${
                        plugin.bypassed
                          ? "text-gray-500 hover:text-gray-300"
                          : "text-green-400 hover:text-green-300"
                      }`}
                      title={plugin.bypassed ? "Enable" : "Bypass"}
                    >
                      {plugin.bypassed ? (
                        <PowerOff size={12} />
                      ) : (
                        <Power size={12} />
                      )}
                    </button>
                    <button
                      onClick={() => toggleParams(plugin.id)}
                      className={`p-1.5 rounded-lg transition-all ${
                        expandedParams.has(plugin.id)
                          ? "text-blue-400 bg-blue-500/10"
                          : "text-gray-500 hover:text-gray-300"
                      }`}
                      title="Parameters"
                    >
                      <Settings2 size={12} />
                    </button>
                    <button
                      onClick={() => onRemove(plugin.id)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                      title="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedParams.has(plugin.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-gray-800/50"
                    >
                      <div className="p-3 space-y-3">
                        {/* Wet/Dry Mix */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider">
                              Wet/Dry Mix
                            </span>
                            <span className="text-[10px] font-mono text-gray-400">
                              {Math.round(plugin.wetDry * 100)}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(plugin.wetDry * 100)}
                            onChange={(e) =>
                              onWetDry(plugin.id, parseInt(e.target.value) / 100)
                            }
                            className="w-full h-1 appearance-none bg-gray-800 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
                          />
                        </div>

                        {/* Sidechain */}
                        <div className="flex items-center justify-between">
                          <span className="text-[8px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                            <Sidebar size={10} />
                            Sidechain
                          </span>
                          <select
                            value={plugin.sidechainSource ?? ""}
                            onChange={(e) => {
                              /* sidechain change handler */
                            }}
                            className="bg-gray-800 border border-gray-700 rounded-lg text-[10px] text-gray-300 px-2 py-1 outline-none"
                          >
                            <option value="">None</option>
                            <option value="kick">Kick</option>
                            <option value="snare">Snare</option>
                            <option value="bass">Bass</option>
                          </select>
                        </div>

                        {/* Parameters */}
                        {plugin.params.length > 0 && (
                          <div className="space-y-2 pt-1 border-t border-gray-800/30">
                            {plugin.params.map((param) => (
                              <div key={param.name} className="space-y-0.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider">
                                    {param.name}
                                  </span>
                                  <span className="text-[9px] font-mono text-gray-400">
                                    {param.value.toFixed(param.step >= 1 ? 0 : 1)}
                                    {param.unit ?? ""}
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min={param.min}
                                  max={param.max}
                                  step={param.step}
                                  value={param.value}
                                  onChange={(e) =>
                                    onParamChange(
                                      plugin.id,
                                      param.name,
                                      parseFloat(e.target.value),
                                    )
                                  }
                                  className="w-full h-1 appearance-none bg-gray-800 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Preset selector */}
                        {plugin.preset && (
                          <div className="flex items-center gap-2 pt-1 border-t border-gray-800/30">
                            <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider">
                              Preset
                            </span>
                            <select className="flex-1 bg-gray-800 border border-gray-700 rounded-lg text-[10px] text-gray-300 px-2 py-1 outline-none">
                              <option>{plugin.preset}</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}

        {plugins.length > 0 && (
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setBrowserOpen(true)}
            className="w-full py-2.5 border-2 border-dashed border-gray-800 rounded-xl text-[10px] font-bold text-gray-600 hover:text-gray-400 hover:border-gray-700 transition-all flex items-center justify-center gap-1.5"
          >
            <Plus size={12} />
            Add Plugin
          </motion.button>
        )}
      </div>

      {/* Plugin Browser Modal */}
      <AnimatePresence>
        {browserOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setBrowserOpen(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl w-[480px] max-h-[70vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <h3 className="text-sm font-bold text-white">Add Plugin</h3>
                <button
                  onClick={() => setBrowserOpen(false)}
                  className="p-1 rounded-lg bg-gray-800 text-gray-500 hover:text-white transition-all"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-3 space-y-3">
                <div className="relative">
                  <Search
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500"
                  />
                  <input
                    value={browserSearch}
                    onChange={(e) => setBrowserSearch(e.target.value)}
                    placeholder="Search plugins..."
                    className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-blue-500/50 transition-colors"
                  />
                  {browserSearch && (
                    <button
                      onClick={() => setBrowserSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setBrowserCategory(cat)}
                      className={`px-2 py-1 rounded-lg text-[9px] font-bold transition-all ${
                        browserCategory === cat
                          ? "bg-blue-500/20 text-blue-400"
                          : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-3">
                {filteredPlugins.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <SlidersHorizontal className="w-8 h-8 text-gray-700 mb-2" />
                    <p className="text-gray-500 text-xs font-bold">
                      No plugins found
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredPlugins.map((plugin) => (
                      <motion.button
                        key={plugin.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleAddClick(plugin)}
                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-800/50 transition-colors text-left"
                      >
                        <div className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
                          <SlidersHorizontal
                            size={12}
                            className="text-blue-400"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-gray-200 truncate">
                            {plugin.name}
                          </div>
                          <div className="text-[9px] text-gray-600">
                            {plugin.category}
                          </div>
                        </div>
                        <Plus size={12} className="text-gray-600 shrink-0" />
                      </motion.button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
