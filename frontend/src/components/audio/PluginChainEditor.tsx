import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Play,
  Pause,
  ChevronDown,
  ChevronRight,
  GripVertical,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { listPlugins } from "../../api/client";
import type { PluginInfo, PluginInstance } from "../../types/audio";
import { PLUGIN_CATEGORIES } from "../../types/audio";

interface PluginChainEditorProps {
  chain: PluginInstance[];
  onChange: (chain: PluginInstance[]) => void;
  onBypass?: () => void;
}

export function PluginChainEditor({ chain, onChange, onBypass }: PluginChainEditorProps) {
  const [availablePlugins, setAvailablePlugins] = useState<PluginInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  
  useEffect(() => {
    loadPlugins();
  }, []);
  
  const loadPlugins = async () => {
    try {
      const result = await listPlugins();
      setAvailablePlugins(result.plugins);
    } catch (e) {
      console.error("Failed to load plugins:", e);
    }
  };
  
  const addPlugin = (pluginInfo: PluginInfo) => {
    const newPlugin: PluginInstance = {
      plugin_name: pluginInfo.name,
      parameters: pluginInfo.parameters.map((p) => ({
        name: p.name,
        value: p.default,
      })),
      enabled: true,
      mix: 1.0,
    };
    
    onChange([...chain, newPlugin]);
    setShowAddMenu(false);
    setExpandedPlugin(newPlugin.plugin_name);
  };
  
  const removePlugin = (index: number) => {
    onChange(chain.filter((_, i) => i !== index));
  };
  
  const updatePlugin = (index: number, updates: Partial<PluginInstance>) => {
    const updated = chain.map((p, i) =>
      i === index ? { ...p, ...updates } : p
    );
    onChange(updated);
  };
  
  const updateParameter = (pluginIndex: number, paramName: string, value: number) => {
    const plugin = chain[pluginIndex];
    const updatedParams = plugin.parameters.map((p) =>
      p.name === paramName ? { ...p, value } : p
    );
    updatePlugin(pluginIndex, { parameters: updatedParams });
  };
  
  const movePlugin = (fromIndex: number, direction: "up" | "down") => {
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= chain.length) return;
    
    const newChain = [...chain];
    [newChain[fromIndex], newChain[toIndex]] = [newChain[toIndex], newChain[fromIndex]];
    onChange(newChain);
  };
  
  const filteredPlugins = selectedCategory
    ? availablePlugins.filter((p) => p.category === selectedCategory)
    : availablePlugins;
  
  return (
    <div className="bg-gray-900 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold">Plugin Chain</h3>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Plugin
            </button>
            
            <AnimatePresence>
              {showAddMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 top-full mt-2 w-64 bg-gray-800 rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto"
                >
                  <div className="p-2">
                    <select
                      value={selectedCategory || ""}
                      onChange={(e) => setSelectedCategory(e.target.value || null)}
                      className="w-full bg-gray-700 text-white rounded px-2 py-1 text-sm mb-2"
                    >
                      <option value="">All Categories</option>
                      {PLUGIN_CATEGORIES.map((cat) => (
                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="px-2 pb-2 space-y-1">
                    {filteredPlugins.map((plugin) => (
                      <button
                        key={plugin.name}
                        onClick={() => addPlugin(plugin)}
                        className="w-full text-left px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm transition-colors"
                      >
                        <div className="font-medium">{plugin.name}</div>
                        <div className="text-gray-400 text-xs">{plugin.category}</div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <button
            onClick={onBypass}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
          >
            Bypass All
          </button>
        </div>
      </div>
      
      <div className="space-y-2">
        <AnimatePresence>
          {chain.map((plugin, index) => (
            <motion.div
              key={plugin.plugin_name + index}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-gray-800 rounded-lg overflow-hidden"
            >
              <div
                className="flex items-center gap-2 p-3 cursor-pointer"
                onClick={() => setExpandedPlugin(expandedPlugin === plugin.plugin_name ? null : plugin.plugin_name)}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updatePlugin(index, { enabled: !plugin.enabled });
                  }}
                  className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
                    plugin.enabled ? "bg-green-600 text-white" : "bg-gray-700 text-gray-400"
                  }`}
                >
                  {plugin.enabled ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                
                <div className="flex-1">
                  <div className="text-white font-medium text-sm">{plugin.plugin_name}</div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Mix: {Math.round(plugin.mix * 100)}%</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={plugin.mix * 100}
                    onChange={(e) => updatePlugin(index, { mix: parseInt(e.target.value) / 100 })}
                    className="w-20"
                    onClick={(e) => e.stopPropagation()}
                  />
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      movePlugin(index, "up");
                    }}
                    disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
                  >
                    <ChevronDown className="w-4 h-4 rotate-180" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      movePlugin(index, "down");
                    }}
                    disabled={index === chain.length - 1}
                    className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removePlugin(index);
                    }}
                    className="p-1 text-gray-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  
                  {expandedPlugin === plugin.plugin_name ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>
              
              <AnimatePresence>
                {expandedPlugin === plugin.plugin_name && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    className="px-4 pb-4 space-y-3"
                  >
                    {plugin.parameters.map((param) => {
                      const paramInfo = availablePlugins
                        .find((p) => p.name === plugin.plugin_name)
                        ?.parameters.find((p) => p.name === param.name);
                      
                      const min = paramInfo?.min ?? 0;
                      const max = paramInfo?.max ?? 100;
                      const percent = ((param.value - min) / (max - min)) * 100;
                      
                      return (
                        <div key={param.name} className="flex items-center gap-3">
                          <span className="text-gray-400 text-xs w-24">{param.name}</span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={percent}
                            onChange={(e) => {
                              const val = min + (parseInt(e.target.value) / 100) * (max - min);
                              updateParameter(index, param.name, val);
                            }}
                            className="flex-1"
                          />
                          <span className="text-white text-xs w-16 text-right">
                            {param.value.toFixed(1)} {paramInfo?.unit || ""}
                          </span>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {chain.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            No plugins in chain. Click "Add Plugin" to start building.
          </div>
        )}
      </div>
    </div>
  );
}