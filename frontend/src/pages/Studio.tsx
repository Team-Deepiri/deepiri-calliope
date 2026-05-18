import { useState } from "react";
import { motion } from "framer-motion";
import { Cpu, Radio, Sparkles, SlidersHorizontal, Mic, Music, Layout, Piano } from "lucide-react";
import { generatePlan, type GenerateDepth, type RouterProvider } from "../api/client";
import { VocalRackPanel } from "../components/studio/VocalRackPanel";
import { VoiceDspPanel } from "../components/studio/VoiceDspPanel";
import { DEFAULT_VOCAL_RACK, type VocalRackPayload } from "../types/vocalRack";
import { AudioRecorder } from "../components/audio/AudioRecorder";
import { PluginChainEditor } from "../components/audio/PluginChainEditor";
import { AudioClipsManager } from "../components/audio/AudioClipsManager";
import { TimelineView } from "../components/studio/TimelineView";
import { MixerConsole } from "../components/studio/MixerConsole";
import { PianoRoll } from "../components/studio/PianoRoll";
import type { PluginInstance } from "../types/audio";

const PROVIDERS: { value: RouterProvider; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "ollama", label: "Ollama" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "gemini", label: "Gemini" },
];

type StudioTab = "architect" | "arrangement" | "sequencer" | "vocal_studio" | "plugin_chain" | "clips";

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
    <motion.div className="studio-page p-6 max-w-[1600px] mx-auto" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <header className="studio-hero mb-12">
        <div className="studio-hero__strip" />
        <div className="studio-hero__row flex justify-between items-end">
          <div>
            <h1 className="text-6xl font-black text-white tracking-tighter mb-2">CALLIOPE <span className="text-blue-500">PRO</span></h1>
            <p className="text-xl text-gray-400 font-medium max-w-2xl leading-relaxed">
              The world's most advanced autonomous AI DAW. From prompt to master, architectural precision meets creative flow.
            </p>
          </div>
          <div className="flex gap-4">
             <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl flex flex-col items-end">
                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">Engine Status</span>
                <span className="text-blue-500 font-mono text-sm">CORES ACTIVE: 128</span>
             </div>
          </div>
        </div>
      </header>

      <nav className="flex items-center gap-3 mb-8 bg-gray-900/50 p-2 rounded-2xl border border-gray-800/50 w-fit">
        {[
          { id: "arrangement", icon: Layout, label: "Arrangement", color: "bg-blue-600" },
          { id: "sequencer", icon: Piano, label: "Sequencer", color: "bg-indigo-600" },
          { id: "architect", icon: Cpu, label: "Architect", color: "bg-purple-600" },
          { id: "vocal_studio", icon: Mic, label: "Vocal Studio", color: "bg-red-600" },
          { id: "plugin_chain", icon: SlidersHorizontal, label: "FX Rack", color: "bg-teal-600" },
          { id: "clips", icon: Music, label: "Library", color: "bg-green-600" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as StudioTab)}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
              activeTab === tab.id ? `${tab.color} text-white shadow-lg` : "text-gray-500 hover:text-white hover:bg-gray-800"
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="studio-layout grid grid-cols-12 gap-8">
        <main className="col-span-9 space-y-8">
          {activeTab === "arrangement" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              <TimelineView bpm={parseInt(bpm) || 120} durationBars={32} sections={sections} tracks={tracks} />
              <MixerConsole tracks={tracks} onUpdateTrack={(id, updates) => setTracks(t => t.map(x => x.id === id ? { ...x, ...updates } : x))} />
            </motion.div>
          )}

          {activeTab === "sequencer" && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
               <PianoRoll />
             </motion.div>
          )}

          {activeTab === "architect" && (
            <div className="glass-panel studio-panel bg-gray-900/50 border border-gray-800 p-8 rounded-3xl space-y-8">
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Producer Brief</label>
                <textarea className="w-full bg-black/50 border border-gray-800 rounded-2xl p-6 text-gray-200 focus:border-purple-500 outline-none transition-colors" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} />
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-6">
                   <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest">AI Provider</label>
                    <select className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white font-bold" value={provider} onChange={(e) => setProvider(e.target.value as RouterProvider)}>
                      {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Architect Depth</label>
                    <select className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white font-bold" value={depth} onChange={(e) => setDepth(e.target.value as GenerateDepth)}>
                      <option value="standard">Standard (Tight Sections)</option>
                      <option value="deep">Deep (Full JSON Analysis)</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Style Overrides</label>
                    <input className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white font-bold" value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="e.g. Acid Techno" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Global Tempo</label>
                    <input className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white font-bold" type="number" value={bpm} onChange={(e) => setBpm(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="flex gap-6">
                <button onClick={() => void onGenerate()} disabled={busy} className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black py-6 rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                  <Layout size={24} />
                  {busy ? "ARCHITECTING..." : "GENERATE PRODUCTION PLAN"}
                </button>
                <button disabled={busy} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-black py-6 rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                  <Sparkles size={24} />
                  {busy ? "CONDUCTING..." : "CONDUCT FULL MASTER"}
                </button>
              </div>
            </div>
          )}

          {activeTab === "vocal_studio" && <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl"><AudioRecorder /></div>}
          {activeTab === "plugin_chain" && <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl"><PluginChainEditor chain={pluginChain} onChange={setPluginChain} onBypass={() => setPluginChain([])} /></div>}
          {activeTab === "clips" && <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl"><AudioClipsManager /></div>}
        </main>

        <aside className="col-span-3 space-y-8">
           <div className="bg-gray-900/50 border border-gray-800 p-6 rounded-3xl">
             <VocalRackPanel value={vocalRack} onChange={setVocalRack} injectEnabled={vocalInject} onInjectChange={setVocalInject} />
           </div>
           {activeTab === "architect" && (
             <div className="bg-gray-950 border border-gray-900 p-6 rounded-3xl">
                <VoiceDspPanel rack={vocalRack} sampleRate={48_000} />
             </div>
           )}
        </aside>
      </div>
    </motion.div>
  );
}
