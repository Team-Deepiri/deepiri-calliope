import { useState } from "react";
import { motion } from "framer-motion";
import { Cpu, Radio, Sparkles, SlidersHorizontal, Mic, Music } from "lucide-react";
import { generatePlan, type GenerateDepth, type RouterProvider } from "../api/client";
import { VocalRackPanel } from "../components/studio/VocalRackPanel";
import { VoiceDspPanel } from "../components/studio/VoiceDspPanel";
import { DEFAULT_VOCAL_RACK, type VocalRackPayload } from "../types/vocalRack";
import { AudioRecorder } from "../components/audio/AudioRecorder";
import { PluginChainEditor } from "../components/audio/PluginChainEditor";
import { AudioClipsManager } from "../components/audio/AudioClipsManager";
import type { PluginInstance } from "../types/audio";

const PROVIDERS: { value: RouterProvider; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "ollama", label: "Ollama" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "gemini", label: "Gemini" },
];

type StudioTab = "architect" | "vocal_studio" | "plugin_chain" | "clips";

export function Studio() {
  const [prompt, setPrompt] = useState(
    "Dark UK garage, 132 BPM, swung hats, minor 9 chords, dubby chords on the offbeat",
  );
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState<RouterProvider>("auto");
  const [depth, setDepth] = useState<GenerateDepth>("standard");
  const [genre, setGenre] = useState("");
  const [bpm, setBpm] = useState("");
  const [vocalRack, setVocalRack] = useState<VocalRackPayload>({ ...DEFAULT_VOCAL_RACK });
  const [vocalInject, setVocalInject] = useState(true);
  const [out, setOut] = useState("");
  const [meta, setMeta] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<StudioTab>("architect");
  const [pluginChain, setPluginChain] = useState<PluginInstance[]>([]);

  async function onGenerate() {
    setBusy(true);
    setOut("");
    setMeta("");
    try {
      const bpmN = bpm.trim() ? parseInt(bpm, 10) : undefined;
      const res = await generatePlan(prompt, {
        provider,
        model: model.trim() || undefined,
        depth,
        genre: genre.trim() || undefined,
        bpm_hint: bpmN && bpmN > 0 ? bpmN : undefined,
        vocal_rack: vocalInject ? vocalRack : undefined,
      });
      setOut(res.response);
      const vNote = vocalInject ? " · vocal rack on" : " · vocal rack off";
      setMeta(`${res.provider} · ${res.model} · depth=${res.depth}${vNote}`);
    } catch (e) {
      setOut(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div className="studio-page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <header className="studio-hero">
        <div className="studio-hero__strip" />
        <div className="studio-hero__row">
          <div>
            <h1 className="section-title studio-hero__title">Studio console</h1>
            <p className="lead mt-sm studio-hero__lead">
              Architect console + <strong>Calliope Voice Unit</strong>: rack drives both the LLM prompt (inject) and the
              live numpy DSP preview — EQ, dynamics, tune, formant, space, and stereo motion in one column.
            </p>
          </div>
          <div className="studio-hero__tags">
            <span className="studio-tag">
              <Cpu size={14} /> Router
            </span>
            <span className="studio-tag">
              <Radio size={14} /> Voice DSP
            </span>
          </div>
        </div>
      </header>

      <div className="flex items-center gap-2 mb-6 px-4">
        <button
          onClick={() => setActiveTab("architect")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "architect" ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          <Cpu className="w-4 h-4 inline mr-2" />
          Architect
        </button>
        <button
          onClick={() => setActiveTab("vocal_studio")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "vocal_studio" ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          <Mic className="w-4 h-4 inline mr-2" />
          Vocal Studio
        </button>
        <button
          onClick={() => setActiveTab("plugin_chain")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "plugin_chain" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 inline mr-2" />
          Plugin Chain
        </button>
        <button
          onClick={() => setActiveTab("clips")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "clips" ? "bg-green-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          <Music className="w-4 h-4 inline mr-2" />
          Audio Clips
        </button>
      </div>

      <div className="studio-layout">
        {activeTab === "architect" && (
          <section className="studio-col studio-col--main stack">
            <div className="glass-panel studio-panel stack" style={{ padding: "1.35rem" }}>
              <div>
                <div className="field-label">Producer brief</div>
                <textarea className="textarea studio-textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={8} />
              </div>

              <div className="studio-console-bar">
                <div className="studio-console-bar__segment">
                  <div className="field-label">Provider</div>
                  <select className="select" value={provider} onChange={(e) => setProvider(e.target.value as RouterProvider)}>
                    {PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="studio-console-bar__segment studio-console-bar__segment--grow">
                  <div className="field-label">Architect depth</div>
                  <select className="select" value={depth} onChange={(e) => setDepth(e.target.value as GenerateDepth)}>
                    <option value="standard">Standard (tight sections)</option>
                    <option value="deep">Deep (+ JSON plan block)</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="field-label">Model override (optional)</div>
                <input
                  className="input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="mistral · gpt-4o-mini · claude-3-5-haiku · anthropic/claude-3.5-sonnet"
                />
              </div>

              <div className="grid-2">
                <div>
                  <div className="field-label">Genre override</div>
                  <input className="input" value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="garage, techno" />
                </div>
                <div>
                  <div className="field-label">BPM override</div>
                  <input
                    className="input"
                    type="number"
                    min={40}
                    max={300}
                    value={bpm}
                    onChange={(e) => setBpm(e.target.value)}
                    placeholder="e.g. 132"
                  />
                </div>
              </div>

              <button type="button" className="btn-modern btn-primary studio-run-btn" onClick={() => void onGenerate()} disabled={busy}>
                <Sparkles size={18} />
                {busy ? "Generating…" : "Run Calliope"}
              </button>

              {meta && <p className="studio-meta">{meta}</p>}

              {out && (
                <div className="studio-output">
                  <div className="field-label">Architect output</div>
                  <div className="mono-block studio-mono">{out}</div>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "vocal_studio" && (
          <section className="studio-col studio-col--main stack">
            <div className="glass-panel studio-panel" style={{ padding: "1.35rem" }}>
              <AudioRecorder />
            </div>
          </section>
        )}

        {activeTab === "plugin_chain" && (
          <section className="studio-col studio-col--main stack">
            <div className="glass-panel studio-panel" style={{ padding: "1.35rem" }}>
              <PluginChainEditor
                chain={pluginChain}
                onChange={setPluginChain}
                onBypass={() => setPluginChain([])}
              />
            </div>
          </section>
        )}

        {activeTab === "clips" && (
          <section className="studio-col studio-col--main stack">
            <div className="glass-panel studio-panel" style={{ padding: "1.35rem" }}>
              <AudioClipsManager />
            </div>
          </section>
        )}

        <aside className="studio-col studio-col--rack studio-rack-stack">
          <div className="glass-panel studio-panel vocal-rack-outer" style={{ padding: "1.15rem 1.1rem 1.35rem" }}>
            <VocalRackPanel value={vocalRack} onChange={setVocalRack} injectEnabled={vocalInject} onInjectChange={setVocalInject} />
          </div>
          {activeTab === "architect" && <VoiceDspPanel rack={vocalRack} sampleRate={48_000} />}
        </aside>
      </div>
    </motion.div>
  );
}
