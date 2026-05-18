import { useState } from "react";
import { motion } from "framer-motion";
import { Cpu, Radio, Sparkles, SlidersHorizontal, Mic, Music, Layout } from "lucide-react";
import { generatePlan, type GenerateDepth, type RouterProvider } from "../api/client";
import { VocalRackPanel } from "../components/studio/VocalRackPanel";
import { VoiceDspPanel } from "../components/studio/VoiceDspPanel";
import { DEFAULT_VOCAL_RACK, type VocalRackPayload } from "../types/vocalRack";
import { AudioRecorder } from "../components/audio/AudioRecorder";
import { PluginChainEditor } from "../components/audio/PluginChainEditor";
import { AudioClipsManager } from "../components/audio/AudioClipsManager";
import { TimelineView } from "../components/studio/TimelineView";
import { MixerConsole } from "../components/studio/MixerConsole";
import type { PluginInstance } from "../types/audio";

const PROVIDERS: { value: RouterProvider; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "ollama", label: "Ollama" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "gemini", label: "Gemini" },
];

type StudioTab = "architect" | "arrangement" | "vocal_studio" | "plugin_chain" | "clips";

export function Studio() {
  const [prompt, setPrompt] = useState(
    "Dark UK garage, 132 BPM, swung hats, minor 9 chords, dubby chords on the offbeat",
  );
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState<RouterProvider>("auto");
  const [depth, setDepth] = useState<GenerateDepth>("standard");
  const [genre, setGenre] = useState("");
  const [bpm, setBpm] = useState("132");
  const [vocalRack, setVocalRack] = useState<VocalRackPayload>({ ...DEFAULT_VOCAL_RACK });
  const [vocalInject, setVocalInject] = useState(true);
  const [out, setOut] = useState("");
  const [meta, setMeta] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<StudioTab>("arrangement");
  const [pluginChain, setPluginChain] = useState<PluginInstance[]>([]);

  // DAW State Mock for Arrangement View
  const [tracks, setTracks] = useState([
    { id: "1", name: "Drums", type: "drum", volume: -3, pan: 0, muted: false, solo: false, color: "#8b5cf6" },
    { id: "2", name: "Sub Bass", type: "bass", volume: -6, pan: 0, muted: false, solo: false, color: "#ef4444" },
    { id: "3", name: "Synth Lead", type: "lead", volume: -10, pan: -0.2, muted: false, solo: false, color: "#3b82f6" },
    { id: "4", name: "Vocals", type: "vocal", volume: -4, pan: 0.1, muted: false, solo: false, color: "#10b981" },
  ]);

  const [sections] = useState([
    { name: "Intro", startBar: 0, bars: 8, color: "rgba(139, 92, 246, 0.3)" },
    { name: "Build", startBar: 8, bars: 8, color: "rgba(239, 68, 68, 0.3)" },
    { name: "Drop", startBar: 16, bars: 16, color: "rgba(59, 130, 246, 0.3)" },
  ]);

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
            <h1 className="section-title studio-hero__title">Calliope DAW</h1>
            <p className="lead mt-sm studio-hero__lead">
              Autonomous Music Production Suite. Architect, Conduct, and Mix in one unified AI-driven environment.
            </p>
          </div>
          <div className="studio-hero__tags">
            <span className="studio-tag bg-blue-500/10 text-blue-400">
              <Cpu size={14} /> AI Conductor
            </span>
            <span className="studio-tag bg-purple-500/10 text-purple-400">
              <Radio size={14} /> Advanced DSP
            </span>
          </div>
        </div>
      </header>

      <div className="flex items-center gap-2 mb-6 px-4">
        <button
          onClick={() => setActiveTab("arrangement")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "arrangement" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          <Layout className="w-4 h-4 inline mr-2" />
          Arrangement
        </button>
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
            activeTab === "plugin_chain" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 inline mr-2" />
          FX Rack
        </button>
        <button
          onClick={() => setActiveTab("clips")}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeTab === "clips" ? "bg-green-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          <Music className="w-4 h-4 inline mr-2" />
          Library
        </button>
      </div>

      <div className="studio-layout">
        {activeTab === "arrangement" && (
          <section className="studio-col studio-col--main stack col-span-2">
            <TimelineView
              bpm={parseInt(bpm) || 120}
              durationBars={32}
              sections={sections}
              tracks={tracks}
            />
            <div className="mt-6">
              <MixerConsole
                tracks={tracks}
                onUpdateTrack={(id, updates) => setTracks(t => t.map(x => x.id === id ? { ...x, ...updates } : x))}
              />
            </div>
          </section>
        )}

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

              <div className="flex gap-4">
                <button type="button" className="btn-modern btn-primary flex-1 py-4" onClick={() => void onGenerate()} disabled={busy}>
                  <Layout size={18} />
                  {busy ? "Architecting…" : "Generate Plan"}
                </button>
                <button type="button" className="btn-modern bg-blue-600 text-white flex-1 py-4 hover:bg-blue-500" disabled={busy}>
                  <Sparkles size={18} />
                  {busy ? "Conducting…" : "Conduct Full Song"}
                </button>
              </div>

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
