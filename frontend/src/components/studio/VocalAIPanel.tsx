import { useState, useCallback, useRef } from "react";
import { Mic2, Sparkles, Send, Square, RotateCcw, Play } from "lucide-react";

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
  strophic: "Strophic",
  freeform: "Freeform",
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
      await new Promise((r) => setTimeout(r, 300));
      if (cancelled) return;

      setProgress({ stage: "Generating vocal melody", percent: 25 });
      await new Promise((r) => setTimeout(r, 500));

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
  }, [lyrics, voice, tuning, arrangementStyle, vocalStyle, genrePreset, cancelled]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setCancelled(true);
  }, []);

  const handleReset = useCallback(() => {
    setResult(null);
    setError(null);
    setCancelled(false);
  }, []);

  return (
    <div className="daw-vocal-ai">
      <div className="daw-vocal-ai__head">
        <Mic2 size={14} />
        <div>
          <strong>AI Vocal Synthesis</strong>
          <span>Neural SVS</span>
        </div>
      </div>

      <div>
        <label>Lyrics / prompt</label>
        <textarea
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          rows={3}
          placeholder="Enter lyrics for the AI to sing…"
          disabled={generating}
        />
      </div>

      <div className="daw-vocal-ai__row">
        <div>
          <label>Voice model</label>
          <select value={voice} onChange={(e) => setVoice(e.target.value)} disabled={generating}>
            <option value="soprano">Soprano (Aura)</option>
            <option value="tenor">Tenor (Atlas)</option>
            <option value="alt">Alt (Nova)</option>
            <option value="bass">Bass (Titan)</option>
          </select>
        </div>
        <div>
          <label>Arrangement</label>
          <select
            value={arrangementStyle}
            onChange={(e) => setArrangementStyle(e.target.value as ArrangementStyle)}
            disabled={generating}
          >
            {Object.entries(STYLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="daw-vocal-ai__row">
        <div>
          <label>Vocal style</label>
          <select
            value={vocalStyle}
            onChange={(e) => setVocalStyle(e.target.value as VocalStyle)}
            disabled={generating}
          >
            {Object.entries(VOCAL_STYLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Genre</label>
          <select
            value={genrePreset}
            onChange={(e) => setGenrePreset(e.target.value as GenrePreset)}
            disabled={generating}
          >
            {Object.keys(GENRE_PRESETS).map((g) => (
              <option key={g} value={g}>
                {g.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label>Tuning strength · {(tuning * 100).toFixed(0)}%</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={tuning}
          onChange={(e) => setTuning(parseFloat(e.target.value))}
          disabled={generating}
        />
      </div>

      <div className="daw-vocal-ai__actions">
        <button
          type="button"
          className="daw-vocal-ai__generate"
          onClick={() => void handleGenerate()}
          disabled={generating || !lyrics.trim()}
        >
          {generating ? <Sparkles size={14} className="daw-vocal-ai__spin" /> : <Send size={14} />}
          {generating ? "Synthesizing…" : "Generate vocal"}
        </button>
        {generating && (
          <button type="button" className="daw-vocal-ai__secondary" onClick={handleCancel}>
            <Square size={14} />
            Cancel
          </button>
        )}
        {result && (
          <button type="button" className="daw-vocal-ai__secondary" onClick={handleReset}>
            <RotateCcw size={14} />
            Reset
          </button>
        )}
      </div>

      {generating && (
        <div className="daw-vocal-ai__progress">
          <div className="daw-vocal-ai__progress-bar">
            <span style={{ width: `${progress.percent}%` }} />
          </div>
          <span className="daw-vocal-ai__progress-label">{progress.stage}</span>
        </div>
      )}

      {result && (
        <div className="daw-vocal-ai__result">
          <div className="daw-vocal-ai__result-head">
            <Play size={12} />
            <span>Generated vocal</span>
            <span className="daw-vocal-ai__result-meta">
              {(result.duration_sec || 0).toFixed(1)}s
            </span>
          </div>
          <div className="daw-vocal-ai__wave">
            {result.waveform && result.waveform.length > 0 ? (
              <svg viewBox={`0 0 ${Math.min(result.waveform.length, 2000)} 80`} preserveAspectRatio="none">
                <path
                  d={result.waveform
                    .slice(0, 2000)
                    .map((v: number, i: number) => `${i === 0 ? "M" : "L"} ${i} ${40 - v * 38}`)
                    .join(" ")}
                  fill="none"
                  stroke="var(--daw-accent)"
                  strokeWidth="1.5"
                />
              </svg>
            ) : null}
          </div>
          <div className="daw-vocal-ai__result-actions">
            <a href={result.output_file} download>
              Download
            </a>
            <button
              type="button"
              onClick={() => {
                const audio = new Audio(result.output_file);
                void audio.play();
              }}
            >
              <Play size={12} />
              Preview
            </button>
          </div>
        </div>
      )}

      {error && <p className="daw-vocal-ai__error">{error}</p>}
    </div>
  );
}
