import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Wand2, Mic, Music, Zap, Play, Pause, Settings, X, Eye } from "lucide-react";
import { applyVocalEffect, listVocalEffectPresets, previewVocalEffect } from "../../api/client";

interface VocalEffectPreset {
  type: string;
  name: string;
  description: string;
  tags: string[];
  plugin_count: number;
}

interface VocalEffectsPanelProps {
  samples?: number[];
  onApplyEffect?: (samples: number[], effectType: string) => void;
}

export function VocalEffectsPanel({ samples, onApplyEffect }: VocalEffectsPanelProps) {
  const [presets, setPresets] = useState<VocalEffectPreset[]>([]);
  const [selectedEffect, setSelectedEffect] = useState<string | null>(null);
  const [dryWet, setDryWet] = useState(1.0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  const loadPresets = useCallback(async () => {
    try {
      const result = await listVocalEffectPresets();
      setPresets(result.presets);
    } catch (e) {
      console.error("Failed to load presets:", e);
    }
  }, []);

  const handleApplyEffect = useCallback(async (effectType: string) => {
    if (!samples) return;
    
    setIsProcessing(true);
    try {
      const result = await previewVocalEffect(samples, effectType, 48000, dryWet);
      onApplyEffect?.(result.samples, effectType);
    } catch (e) {
      console.error("Failed to apply effect:", e);
    } finally {
      setIsProcessing(false);
    }
  }, [samples, dryWet, onApplyEffect]);

  const handlePreview = useCallback(async (effectType: string) => {
    if (!samples) return;
    
    setPreviewing(true);
    try {
      await previewVocalEffect(samples, effectType, 48000, dryWet);
    } catch (e) {
      console.error("Failed to preview:", e);
    } finally {
      setPreviewing(false);
    }
  }, [samples, dryWet]);

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-medium flex items-center gap-2">
          <Wand2 size={18} />
          Vocal Effects
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={loadPresets}
            className="px-3 py-1 bg-gray-800 text-gray-400 rounded text-sm hover:bg-gray-700"
          >
            Load Presets
          </button>
          <button
            onClick={() => setShowPanel(!showPanel)}
            className={`p-2 rounded ${showPanel ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400"}`}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {presets.map((preset) => (
          <motion.button
            key={preset.type}
            onClick={() => setSelectedEffect(preset.type)}
            className={`p-3 rounded-lg text-left transition-colors ${
              selectedEffect === preset.type
                ? "bg-purple-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="font-medium text-sm">{preset.name}</div>
            <div className="text-xs opacity-70 mt-0.5">
              {preset.tags.slice(0, 2).join(", ")}
            </div>
          </motion.button>
        ))}
      </div>

      {selectedEffect && (
        <div className="mt-4 bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white font-medium">
              {presets.find((p) => p.type === selectedEffect)?.name}
            </span>
            <button
              onClick={() => setSelectedEffect(null)}
              className="text-gray-400 hover:text-white"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">Dry/Wet</span>
              <span className="text-white">{Math.round(dryWet * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={dryWet}
              onChange={(e) => setDryWet(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => void handlePreview(selectedEffect)}
              disabled={previewing || !samples}
              className="flex-1 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {previewing ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play size={16} />
              )}
              Preview
            </button>
            <button
              onClick={() => void handleApplyEffect(selectedEffect)}
              disabled={isProcessing || !samples}
              className="flex-1 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Zap size={16} />
              )}
              Apply
            </button>
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="text-xs text-gray-500 mb-2">Effect Categories</div>
        <div className="flex flex-wrap gap-1">
          {["vintage", "futuristic", "ambient", "fun"].map((tag) => (
            <span key={tag} className="px-2 py-1 bg-gray-800 text-gray-400 rounded text-xs">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}


interface EffectChainPreviewProps {
  effects: string[];
}

export function EffectChainPreview({ effects }: EffectChainPreviewProps) {
  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <h3 className="text-white font-medium flex items-center gap-2 mb-4">
        <Eye size={18} />
        Effect Chain Preview
      </h3>

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {effects.map((effect, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="px-3 py-2 bg-purple-900/50 text-purple-300 rounded-lg text-sm whitespace-nowrap">
              {effect}
            </div>
            {i < effects.length - 1 && (
              <span className="text-gray-600">→</span>
            )}
          </div>
        ))}
      </div>

      {effects.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          No effects in chain
        </div>
      )}
    </div>
  );
}