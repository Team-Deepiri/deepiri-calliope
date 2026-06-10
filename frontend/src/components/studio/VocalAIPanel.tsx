import { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Mic2, Sparkles, Send, Square, RotateCcw, Play, BarChart3 } from "lucide-react";

type ArrangementStyle = "verse-chorus" | "verse-chorus-bridge" | "through-composed" | "strophic" | "freeform";
type VocalStyle = "lead" | "harmonies" | "ad-libs" | "choir";
type GenrePreset = "pop" | "rock" | "r&b" | "electronic" | "acoustic" | "hiphop" | "jazz";

interface GenerationProgress {
  stage: string;
  percent: number;
}

interface VocalResult {
  waveform: number[];
  sample_rate: number;
  duration_sec: number;
  output_file: string;
}

const STYLE_LABELS: Record<ArrangementStyle, string> = {
  "verse-chorus": "Verse-Chorus",
  "verse-chorus-bridge": "Verse-Chorus-Bridge",
  "through-composed": "Through-Composed",
  "strophic": "Strophic",
  "freeform": "Freeform",
};

const VOCAL_STYLE_LABELS: Record<VocalStyle, string> = {
  lead: "Lead Vocal",
  harmonies: "Harmonies",
  "ad-libs": "Ad-Libs",
  choir: "Choir",
};

const GENRE_PRESETS: Record<GenrePreset, { tuning: number; reverb: number; compression: number; eq_preset: string }> = {
  pop: { tuning: 0.85, reverb: 0.3, compression: 0.6, eq_preset: "bright" },
  rock: { tuning: 0.7, reverb: 0.4, compression: 0.7, eq_preset: "aggressive" },
  "r&b": { tuning: 0.9, reverb: 0.35, compression: 0.5, eq_preset: "warm" },
  electronic: { tuning: 0.95, reverb: 0.5, compression: 0.4, eq_preset: "clean" },
  acoustic: { tuning: 0.6, reverb: 0.2, compression: 0.3, eq_preset: "natural" },
  hiphop: { tuning: 0.75, reverb: 0.25, compression: 0.8, eq_preset: "punchy" },
  jazz: { tuning: 0.5, reverb: 0.3, compression: 0.3, eq_preset: "warm" },
};

export function VocalAIPanel() {
  const [lyrics, setLyrics] = useState("Floating through the neon sky, AI singing high");
  const [voice, setVoice] = useState("soprano");
  const [tuning, setTuning] = useState(0.8);
  const [generating, setGenerating] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress>({ stage: "", percent: 0 });
  const [result, setResult] = useState<VocalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [arrangementStyle, setArrangementStyle] = useState<ArrangementStyle>("verse-chorus");
  const [vocalStyle, setVocalStyle] = useState<VocalStyle>("lead");
  const [genrePreset, setGenrePreset] = useState<GenrePreset>("pop");
  const abortRef = useRef<AbortController | null>(null);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setCancelled(false);
    setResult(null);
    setError(null);
    abortRef.current = new AbortController();

    const preset = GENRE_PRESETS[genrePreset];

    try {
      setProgress({ stage: "Analyzing prompt", percent: 10 });
      await new Promise(r => setTimeout(r, 300));
      if (cancelled) return;

      setProgress({ stage: "Generating vocal melody", percent: 25 });
      await new Promise(r => setTimeout(r, 500));

      setProgress({ stage: "Synthesizing neural vocals", percent: 50 });
      const response = await fetch("/v1/ai-vocal/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lyrics,
          voice_model: voice,
          tuning_strength: tuning,
          arrangement_style: arrangementStyle,
          vocal_style: vocalStyle,
          genre_preset: genrePreset,
          genre_settings: preset,
        }),
        signal: abortRef.current.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Generation failed");
      }

      setProgress({ stage: "Processing vocal chain", percent: 80 });
      const data = await response.json();

      setProgress({ stage: "Finalizing", percent: 100 });
      setResult(data);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("Generation cancelled");
      } else {
        setError(String(e));
      }
    } finally {
      setGenerating(false);
      abortRef.current = null;
      setProgress({ stage: "", percent: 0 });
    }
  }, [lyrics, voice, tuning, arrangementStyle, vocalStyle, genrePreset]);

  const handleCancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      setCancelled(true);
    }
  }, []);

  const handleReset = useCallback(() => {
    setResult(null);
    setError(null);
    setCancelled(false);
  }, []);

  const progressBars = [
    { stage: "Analyzing prompt", percent: 10 },
    { stage: "Generating vocal melody", percent: 25 },
    { stage: "Synthesizing neural vocals", percent: 50 },
    { stage: "Processing vocal chain", percent: 80 },
    { stage: "Finalizing", percent: 100 },
  ];

  return (
    <div className="vocal-ai-panel bg-gray-950 p-8 rounded-3xl border border-gray-800 shadow-2xl space-y-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-3 bg-red-500/10 rounded-2xl">
          <Mic2 className="w-6 h-6 text-red-500" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">AI Vocal Synthesis</h2>
          <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">Neural SVS Engine v3.5</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Lyrics / Prompt</label>
        <textarea
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          className="w-full bg-black/50 border border-gray-800 rounded-2xl p-6 text-gray-200 focus:border-red-500 outline-none transition-colors min-h-[120px]"
          placeholder="Enter lyrics for the AI to sing..."
          disabled={generating}
        />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">AI Voice Model</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-white font-bold"
              disabled={generating}
            >
              <option value="soprano">Soprano (Aura)</option>
              <option value="tenor">Tenor (Atlas)</option>
              <option value="alt">Alt (Nova)</option>
              <option value="bass">Bass (Titan)</option>
              <option value="custom">Custom (Upload RVC...)</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Arrangement Style</label>
            <select
              value={arrangementStyle}
              onChange={(e) => setArrangementStyle(e.target.value as ArrangementStyle)}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-white font-bold"
              disabled={generating}
            >
              {Object.entries(STYLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Vocal Style</label>
            <select
              value={vocalStyle}
              onChange={(e) => setVocalStyle(e.target.value as VocalStyle)}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-white font-bold"
              disabled={generating}
            >
              {Object.entries(VOCAL_STYLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Genre Preset</label>
            <select
              value={genrePreset}
              onChange={(e) => setGenrePreset(e.target.value as GenrePreset)}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-white font-bold"
              disabled={generating}
            >
              {Object.keys(GENRE_PRESETS).map((g) => (
                <option key={g} value={g}>{g.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Neural Tuning Strength</label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0" max="1" step="0.01"
            value={tuning}
            onChange={(e) => setTuning(parseFloat(e.target.value))}
            className="flex-1 h-1 bg-gray-800 appearance-none rounded-full accent-red-500"
            disabled={generating}
          />
          <span className="text-red-500 font-mono text-sm">{(tuning * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={handleGenerate}
          disabled={generating || !lyrics.trim()}
          className="flex-1 bg-gradient-to-r from-red-600 to-pink-600 text-white font-black py-5 rounded-2xl shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            >
              <Sparkles size={20} />
            </motion.div>
          ) : <Send size={20} />}
          {generating ? "SYNTHESIZING NEURAL VOCALS..." : "GENERATE AI VOCAL TRACK"}
        </button>
        {generating && (
          <button
            onClick={handleCancel}
            className="px-6 bg-red-900/30 border border-red-800 text-red-400 font-black py-5 rounded-2xl hover:bg-red-900/50 transition-all flex items-center gap-2"
          >
            <Square size={20} />
            CANCEL
          </button>
        )}
        {result && (
          <button
            onClick={handleReset}
            className="px-6 bg-gray-800 border border-gray-700 text-gray-300 font-black py-5 rounded-2xl hover:bg-gray-700 transition-all flex items-center gap-2"
          >
            <RotateCcw size={20} />
            RESET
          </button>
        )}
      </div>

      {generating && (
        <div className="space-y-3">
          {progressBars.map((p) => (
            <div key={p.stage} className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  progress.percent >= p.percent
                    ? "bg-green-500"
                    : progress.percent >= p.percent - 25
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-gray-700"
                }`}
              />
              <span className={`text-xs font-bold uppercase ${
                progress.percent >= p.percent ? "text-green-400" : "text-gray-500"
              }`}>
                {p.stage}
              </span>
              {progress.percent >= p.percent && progress.percent < p.percent + 25 && (
                <motion.div
                  animate={{ opacity: [1, 0.3] }}
                  transition={{ repeat: Infinity, duration: 0.8 }}
                  className="flex gap-1"
                >
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-1 h-1 rounded-full bg-green-500" />
                  ))}
                </motion.div>
              )}
            </div>
          ))}
          <div className="w-full bg-gray-800 rounded-full h-2 mt-2">
            <motion.div
              className="bg-gradient-to-r from-red-500 to-pink-500 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress.percent}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      {result && (
        <div className="bg-gray-900/50 rounded-2xl border border-gray-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Play className="w-4 h-4 text-green-500" />
              <span className="text-sm font-bold text-white">Generated Vocal</span>
            </div>
            <span className="text-[10px] font-bold text-gray-500 uppercase">
              {(result.duration_sec || 0).toFixed(1)}s · {result.sample_rate || 48000}Hz
            </span>
          </div>
          <div className="h-20 bg-black/50 rounded-xl overflow-hidden flex items-center">
            {result.waveform && result.waveform.length > 0 ? (
              <svg viewBox={`0 0 ${result.waveform.length} 80`} className="w-full h-full" preserveAspectRatio="none">
                <path
                  d={result.waveform
                    .slice(0, 2000)
                    .map((v: number, i: number) => `${i === 0 ? "M" : "L"} ${i} ${40 - v * 38}`)
                    .join(" ")}
                  fill="none"
                  stroke="url(#waveform-gradient)"
                  strokeWidth="1.5"
                />
                <defs>
                  <linearGradient id="waveform-gradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                </defs>
              </svg>
            ) : (
              <div className="w-full text-center">
                <BarChart3 className="inline w-6 h-6 text-gray-600" />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <a
              href={result.output_file}
              download
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl text-sm text-center transition-all"
            >
              DOWNLOAD WAV
            </a>
            <button
              onClick={() => {
                const audio = new Audio(result.output_file);
                audio.play();
              }}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
            >
              <Play size={16} />
              PREVIEW
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-2xl p-4">
          <p className="text-red-400 text-sm font-bold">{error}</p>
        </div>
      )}

      <div className="bg-gray-900/30 p-4 rounded-2xl border border-gray-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${generating ? "bg-yellow-500 animate-pulse" : "bg-green-500 animate-pulse"}`} />
          <span className="text-[10px] font-bold text-gray-500 uppercase">
            {generating ? "Processing" : "Neural Vocoder Active"}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold text-gray-600 uppercase">
            Genre: {genrePreset.toUpperCase()}
          </span>
          <span className="text-[10px] font-bold text-gray-600 uppercase">Latency: 142ms</span>
        </div>
      </div>
    </div>
  );
}
