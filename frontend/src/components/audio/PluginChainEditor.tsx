import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Power,
  ChevronDown,
  ChevronUp,
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

function pluginAccent(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("eq") || n.includes("filter")) return "#5b8def";
  if (n.includes("comp") || n.includes("limit")) return "#e8b84a";
  if (n.includes("reverb") || n.includes("room")) return "#8b6b9e";
  if (n.includes("delay") || n.includes("echo")) return "#3dd68c";
  if (n.includes("distort") || n.includes("drive")) return "#f2555a";
  return "#6b9fff";
}

export function PluginChainEditor({ chain, onChange, onBypass }: PluginChainEditorProps) {
  const [availablePlugins, setAvailablePlugins] = useState<PluginInfo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [showAddMenu, setShowAddMenu] = useState(false);

  useEffect(() => {
    void loadPlugins();
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
  };

  const removePlugin = (index: number) => {
    onChange(chain.filter((_, i) => i !== index));
    setCollapsed((prev) => {
      const next = new Set<number>();
      for (const i of prev) {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      }
      return next;
    });
  };

  const updatePlugin = (index: number, updates: Partial<PluginInstance>) => {
    onChange(chain.map((p, i) => (i === index ? { ...p, ...updates } : p)));
  };

  const updateParameter = (pluginIndex: number, paramName: string, value: number) => {
    const plugin = chain[pluginIndex];
    const updatedParams = plugin.parameters.map((p) => (p.name === paramName ? { ...p, value } : p));
    updatePlugin(pluginIndex, { parameters: updatedParams });
  };

  const movePlugin = (fromIndex: number, direction: "up" | "down") => {
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= chain.length) return;
    const newChain = [...chain];
    [newChain[fromIndex], newChain[toIndex]] = [newChain[toIndex], newChain[fromIndex]];
    onChange(newChain);
  };

  const toggleCollapsed = (index: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const filteredPlugins = selectedCategory
    ? availablePlugins.filter((p) => p.category === selectedCategory)
    : availablePlugins;

  return (
    <div className="daw-plugins">
      <div className="daw-plugins__head">
        <h3>Plugin Chain</h3>
        <div className="daw-plugins__head-actions">
          <div className="daw-plugins__add-wrap">
            <button type="button" className="daw-plugins__btn daw-plugins__btn--add" onClick={() => setShowAddMenu(!showAddMenu)}>
              <Plus size={14} />
              Add
            </button>
            <AnimatePresence>
              {showAddMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="daw-plugins__menu"
                >
                  <select
                    value={selectedCategory || ""}
                    onChange={(e) => setSelectedCategory(e.target.value || null)}
                  >
                    <option value="">All Categories</option>
                    {PLUGIN_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                  <div className="daw-plugins__menu-list">
                    {filteredPlugins.map((plugin) => (
                      <button key={plugin.name} type="button" onClick={() => addPlugin(plugin)}>
                        <span style={{ color: pluginAccent(plugin.name) }}>●</span>
                        <span>
                          <strong>{plugin.name}</strong>
                          <small>{plugin.category}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button type="button" className="daw-plugins__btn daw-plugins__btn--bypass" onClick={onBypass}>
            Bypass
          </button>
        </div>
      </div>

      <div className="daw-plugins__stack">
        {chain.map((plugin, index) => {
          const accent = pluginAccent(plugin.plugin_name);
          const isCollapsed = collapsed.has(index);
          return (
            <div
              key={`${plugin.plugin_name}-${index}`}
              className={`daw-plugin-card${plugin.enabled ? "" : " is-bypassed"}`}
              style={{ ["--plugin-accent" as string]: accent }}
            >
              <div className="daw-plugin-card__bar">
                <button
                  type="button"
                  className={`daw-plugin-card__power${plugin.enabled ? " is-on" : ""}`}
                  title={plugin.enabled ? "Enabled" : "Bypassed"}
                  onClick={() => updatePlugin(index, { enabled: !plugin.enabled })}
                >
                  <Power size={14} />
                </button>
                <button type="button" className="daw-plugin-card__title" onClick={() => toggleCollapsed(index)}>
                  <span className="daw-plugin-card__swatch" />
                  <span>
                    <strong>{plugin.plugin_name}</strong>
                    <small>Mix {Math.round(plugin.mix * 100)}%</small>
                  </span>
                  {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
                <div className="daw-plugin-card__tools">
                  <button type="button" disabled={index === 0} onClick={() => movePlugin(index, "up")} title="Move up">
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === chain.length - 1}
                    onClick={() => movePlugin(index, "down")}
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button type="button" className="is-danger" onClick={() => removePlugin(index)} title="Remove">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {!isCollapsed && (
                <div className="daw-plugin-card__body">
                  <label className="daw-plugin-card__mix">
                    <span>Wet / Dry</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={plugin.mix * 100}
                      onChange={(e) => updatePlugin(index, { mix: parseInt(e.target.value, 10) / 100 })}
                    />
                  </label>
                  {plugin.parameters.map((param) => {
                    const paramInfo = availablePlugins
                      .find((p) => p.name === plugin.plugin_name)
                      ?.parameters.find((p) => p.name === param.name);
                    const min = paramInfo?.min ?? 0;
                    const max = paramInfo?.max ?? 100;
                    const percent = max === min ? 0 : ((param.value - min) / (max - min)) * 100;
                    return (
                      <label key={param.name} className="daw-plugin-card__param">
                        <span>{param.name}</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={percent}
                          onChange={(e) => {
                            const val = min + (parseInt(e.target.value, 10) / 100) * (max - min);
                            updateParameter(index, param.name, val);
                          }}
                        />
                        <em>
                          {param.value.toFixed(1)}
                          {paramInfo?.unit ? ` ${paramInfo.unit}` : ""}
                        </em>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {chain.length === 0 && (
          <div className="daw-plugins__empty">No plugins yet. Add EQ, compressor, reverb — they apply on track playback.</div>
        )}
      </div>
    </div>
  );
}
