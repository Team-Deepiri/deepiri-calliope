import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, RotateCcw, Volume2, VolumeX, Eye, EyeOff } from "lucide-react";
import type { PluginInstance } from "../../types/audio";

interface ABComparisonProps {
  originalSamples: number[];
  processedSamples: number[];
  onCompare?: (mode: "A" | "B") => void;
}

export function ABComparison({ originalSamples, processedSamples, onCompare }: ABComparisonProps) {
  const [activeMode, setActiveMode] = useState<"A" | "B">("B");
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const playAudio = useCallback((samples: number[], mode: "A" | "B") => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    if (sourceRef.current) {
      sourceRef.current.stop();
    }

    const ctx = audioContextRef.current;
    const buffer = ctx.createBuffer(1, samples.length, 48000);
    buffer.copyToChannel(new Float32Array(samples), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = loopEnabled;
    source.connect(ctx.destination);
    source.start();
    sourceRef.current = source;

    setIsPlaying(true);
    setActiveMode(mode);
    onCompare?.(mode);

    source.onended = () => setIsPlaying(false);
  }, [loopEnabled, onCompare]);

  const stopAudio = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.stop();
      sourceRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const toggleMode = useCallback(() => {
    const samples = activeMode === "A" ? processedSamples : originalSamples;
    const mode = activeMode === "A" ? "B" : "A";
    playAudio(samples, mode);
  }, [activeMode, originalSamples, processedSamples, playAudio]);

  return (
    <div className="bg-gray-900 rounded-lg p-4 flex items-center gap-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => playAudio(originalSamples, "A")}
          disabled={isPlaying && activeMode === "A"}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            activeMode === "A" ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400"
          }`}
        >
          A
        </button>
        <button
          onClick={() => playAudio(processedSamples, "B")}
          disabled={isPlaying && activeMode === "B"}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            activeMode === "B" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400"
          }`}
        >
          B
        </button>
      </div>

      <button
        onClick={toggleMode}
        className="p-2 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
        title="Toggle A/B"
      >
        <ArrowLeftRight size={20} className="text-gray-400" />
      </button>

      <button
        onClick={stopAudio}
        className="p-2 bg-gray-800 rounded hover:bg-gray-700 transition-colors"
        title="Stop"
      >
        <VolumeX size={20} className="text-gray-400" />
      </button>

      <label className="flex items-center gap-2 text-sm text-gray-400">
        <input
          type="checkbox"
          checked={loopEnabled}
          onChange={(e) => setLoopEnabled(e.target.checked)}
          className="rounded"
        />
        Loop
      </label>

      <div className="ml-auto text-sm text-gray-500">
        {activeMode === "A" ? "Original" : "Processed"}
      </div>
    </div>
  );
}


interface ABPluginComparisonProps {
  plugins: PluginInstance[];
  originalSamples: number[];
  sampleRate?: number;
}

export function ABPluginComparison({ plugins, originalSamples, sampleRate = 48000 }: ABPluginComparisonProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stepResults, setStepResults] = useState<{ samples: number[]; name: string }[]>([]);
  const [showOriginal, setShowOriginal] = useState(false);

  const processStep = useCallback(async (step: number) => {
    if (step >= plugins.length) return;

    setIsProcessing(true);
    const plugin = plugins[step];

    try {
      const res = await fetch("/v1/plugins/chain/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          samples: originalSamples,
          sr: sampleRate,
          chain: { plugins: [plugin] },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setStepResults((prev) => [...prev, { samples: data.samples, name: plugin.plugin_name }]);
        setCurrentStep(step + 1);
      }
    } catch (err) {
      console.error("Processing error:", err);
    } finally {
      setIsProcessing(false);
    }
  }, [plugins, originalSamples, sampleRate]);

  const resetComparison = useCallback(() => {
    setCurrentStep(0);
    setStepResults([]);
    setShowOriginal(false);
  }, []);

  const stepUp = useCallback(() => {
    if (currentStep < plugins.length) {
      processStep(currentStep);
    }
  }, [currentStep, plugins.length, processStep]);

  const stepDown = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setStepResults((prev) => prev.slice(0, -1));
    }
  }, [currentStep]);

  return (
    <div className="bg-gray-900 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-300">Plugin Chain A/B</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={resetComparison}
            className="p-2 bg-gray-800 rounded hover:bg-gray-700"
            title="Reset"
          >
            <RotateCcw size={16} className="text-gray-400" />
          </button>
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className="p-2 bg-gray-800 rounded hover:bg-gray-700"
            title="Toggle Original"
          >
            {showOriginal ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {plugins.map((plugin, i) => (
          <div
            key={plugin.id}
            className={`flex items-center gap-2 p-2 rounded ${
              i < currentStep ? "bg-green-900/30" : i === currentStep ? "bg-purple-900/30" : "bg-gray-800"
            }`}
          >
            <span className="text-xs text-gray-500 w-6">{i + 1}</span>
            <span className="text-sm text-gray-300 flex-1">{plugin.plugin_name}</span>
            {i < currentStep && (
              <span className="text-xs text-green-500">✓</span>
            )}
            {i === currentStep && !isProcessing && (
              <button
                onClick={stepUp}
                className="text-xs text-purple-400 hover:text-purple-300"
              >
                Process
              </button>
            )}
            {i === currentStep && isProcessing && (
              <span className="text-xs text-gray-500">...</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={stepDown}
          disabled={currentStep === 0}
          className="px-4 py-2 bg-gray-800 rounded disabled:opacity-50"
        >
          -
        </button>
        <div className="flex-1 text-center text-sm text-gray-400">
          Step {currentStep} / {plugins.length}
        </div>
        <button
          onClick={stepUp}
          disabled={currentStep >= plugins.length || isProcessing}
          className="px-4 py-2 bg-purple-600 rounded disabled:opacity-50"
        >
          +
        </button>
      </div>

      {stepResults.length > 0 && (
        <div className="mt-4 text-xs text-gray-500">
          Processed: {stepResults.map((r) => r.name).join(" → ")}
        </div>
      )}
    </div>
  );
}


interface PluginBypassToggleProps {
  plugins: PluginInstance[];
  onToggle: (index: number) => void;
}

export function PluginBypassToggle({ plugins, onToggle }: PluginBypassToggleProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {plugins.map((plugin, i) => (
        <button
          key={plugin.id}
          onClick={() => onToggle(i)}
          className={`px-3 py-1 rounded text-sm transition-colors ${
            plugin.enabled ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-500 line-through"
          }`}
        >
          {plugin.plugin_name}
        </button>
      ))}
    </div>
  );
}


interface QuickBypassProps {
  bypassAll: boolean;
  onBypassAll: () => void;
  onEnableAll: () => void;
}

export function QuickBypass({ bypassAll, onBypassAll, onEnableAll }: QuickBypass) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onBypassAll}
        className="px-3 py-1 bg-red-600/20 text-red-400 rounded text-sm hover:bg-red-600/30"
      >
        Bypass All
      </button>
      <button
        onClick={onEnableAll}
        className="px-3 py-1 bg-green-600/20 text-green-400 rounded text-sm hover:bg-green-600/30"
      >
        Enable All
      </button>
    </div>
  );
}


interface DryWetMixerProps {
  mix: number;
  onMixChange: (mix: number) => void;
}

export function DryWetMixer({ mix, onMixChange }: DryWetMixerProps) {
  return (
    <div className="flex items-center gap-4 bg-gray-900 rounded-lg p-3">
      <span className="text-xs text-gray-500 w-8">Dry</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={mix}
        onChange={(e) => onMixChange(parseFloat(e.target.value))}
        className="flex-1"
      />
      <span className="text-xs text-gray-500 w-8 text-right">Wet</span>
      <div className="w-12 text-center text-sm font-mono text-gray-400">
        {Math.round(mix * 100)}%
      </div>
    </div>
  );
}