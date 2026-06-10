import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Cpu, Sparkles, SlidersHorizontal, Mic, Music, Layout, Piano, Mic2, Save, FolderOpen, Undo2, Redo2, FilePlus2 } from "lucide-react";
import { generatePlan, type GenerateDepth, type RouterProvider } from "../api/client";
import { VocalRackPanel } from "../components/studio/VocalRackPanel";
import { VoiceDspPanel } from "../components/studio/VoiceDspPanel";
import { DEFAULT_VOCAL_RACK, type VocalRackPayload } from "../types/vocalRack";
import { AudioRecorder } from "../components/audio/AudioRecorder";
import { PluginChainEditor } from "../components/audio/PluginChainEditor";
import { AudioClipsManager } from "../components/audio/AudioClipsManager";
import { TimelineView } from "../components/studio/TimelineView";
import { MixerConsole } from "../components/studio/MixerConsole";
import { MixerRoutingModal } from "../components/studio/MixerRoutingModal";
import { PianoRoll } from "../components/studio/PianoRoll";
import { VocalAIPanel } from "../components/studio/VocalAIPanel";
import { ProjectManager } from "../components/studio/ProjectManager";
import { useUndoRedo } from "../components/studio/useUndoRedo";
import type { PluginInstance, MixerChannel, RoutingNode } from "../types/audio";

const PROVIDERS: { value: RouterProvider; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "ollama", label: "Ollama" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "gemini", label: "Gemini" },
];

type StudioTab = "architect" | "arrangement" | "sequencer" | "vocal_ai" | "vocal_studio" | "plugin_chain" | "clips";

interface TrackState {
  id: string;
  name: string;
  type: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  armed: boolean;
  color: string;
}

export function Studio() {
  const [prompt, setPrompt] = useState(
    "Dark UK garage, 132 BPM, swung hats, minor 9 chords, dubby chords on the offbeat, sing lyrics about neon skies",
  );
  const [model] = useState("");
  const [provider, setProvider] = useState<RouterProvider>("auto");
  const [depth, setDepth] = useState<GenerateDepth>("standard");
  const [genre, setGenre] = useState("");
  const [bpm, setBpm] = useState("132");
  const [vocalRack, setVocalRack] = useState<VocalRackPayload>({ ...DEFAULT_VOCAL_RACK });
  const [vocalInject, setVocalInject] = useState(true);
  const [, setOut] = useState("");
  const [, setMeta] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<StudioTab>("vocal_ai");
  const [pluginChain, setPluginChain] = useState<PluginInstance[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);

  const initialTracks: TrackState[] = [
    { id: "1", name: "Drums", type: "drum", volume: -3, pan: 0, muted: false, solo: false, armed: false, color: "#8b5cf6" },
    { id: "2", name: "Sub Bass", type: "bass", volume: -6, pan: 0, muted: false, solo: false, armed: false, color: "#ef4444" },
    { id: "3", name: "Synth Lead", type: "lead", volume: -10, pan: -0.2, muted: false, solo: false, armed: false, color: "#3b82f6" },
    { id: "4", name: "Vocals (AI)", type: "vocal", volume: -4, pan: 0.1, muted: false, solo: false, armed: true, color: "#10b981" },
  ];

  const { state: tracks, setState: setTracks, undo, redo, canUndo, canRedo } = useUndoRedo<TrackState[]>(initialTracks);

  const [mixerChannels, setMixerChannels] = useState<MixerChannel[]>([
    { id: "1", name: "Drums", type: "audio", volume: -3, pan: 0, muted: false, solo: false, color: "#8b5cf6", sends: [], pluginCount: 2, vuLevel: 0.6, eqActive: true, compActive: true, gainReduction: 0 },
    { id: "2", name: "Sub Bass", type: "audio", volume: -6, pan: 0, muted: false, solo: false, color: "#ef4444", sends: [], pluginCount: 1, vuLevel: 0.4, eqActive: true, compActive: false, gainReduction: 0 },
    { id: "3", name: "Synth Lead", type: "instrument", volume: -10, pan: -0.2, muted: false, solo: false, color: "#3b82f6", sends: [{ sendId: "send1", level: 0.3 }], pluginCount: 3, vuLevel: 0.5, eqActive: true, compActive: true, gainReduction: 2.1 },
    { id: "4", name: "Vocals (AI)", type: "audio", volume: -4, pan: 0.1, muted: false, solo: false, color: "#10b981", sends: [{ sendId: "send1", level: 0.15 }], pluginCount: 4, vuLevel: 0.7, eqActive: true, compActive: true, gainReduction: 3.5 },
    { id: "master", name: "Master", type: "master", volume: 0, pan: 0, muted: false, solo: false, color: "#3b82f6", sends: [], pluginCount: 0, vuLevel: 0.8, eqActive: false, compActive: false, gainReduction: 0 },
  ]);

  const [routingModalOpen, setRoutingModalOpen] = useState(false);
  const [routingNodes, setRoutingNodes] = useState<RoutingNode[]>([
    { id: "src1", type: "source", name: "Drums", connections: ["bus1"] },
    { id: "src2", type: "source", name: "Bass", connections: ["bus1"] },
    { id: "src3", type: "source", name: "Synth", connections: ["fx1"] },
    { id: "src4", type: "source", name: "Vocals", connections: ["fx1"] },
    { id: "fx1", type: "effect", name: "Reverb", connections: ["bus1"] },
    { id: "bus1", type: "bus", name: "Drums Bus", connections: ["out"] },
    { id: "out", type: "output", name: "Master", connections: [] },
  ]);

  const [busses] = useState([
    { id: "bus1", name: "Drums Bus", volume: 0.85 },
  ]);

  const [sends] = useState([
    { id: "send1", name: "Reverb Send", level: 0.5, source: "src3", destination: "fx1" },
  ]);

  const [vcaGroups] = useState([
    { id: "vca1", name: "Drums Group", volume: 0.9 },
  ]);

  const [vcaAssignments] = useState<Record<string, string>>({ "1": "vca1" });

  const handleUpdateChannel = useCallback((channelId: string, updates: Partial<MixerChannel>) => {
    setMixerChannels((prev) => prev.map((ch) => (ch.id === channelId ? { ...ch, ...updates } : ch)));
  }, []);

  const [sections] = useState([
    { name: "Intro", startBar: 0, bars: 8, color: "rgba(139, 92, 246, 0.3)" },
    { name: "Build", startBar: 8, bars: 8, color: "rgba(239, 68, 68, 0.3)" },
    { name: "Drop", startBar: 16, bars: 16, color: "rgba(59, 130, 246, 0.3)" },
  ]);

  const handleUpdateTrack = useCallback((trackId: string, updates: Record<string, unknown>) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, ...updates } as TrackState : t), `Update ${trackId}`);
  }, [setTracks]);

  const handleSessionLoaded = useCallback((session: { id: string; name: string; bpm: number; key: string }) => {
    setSessionId(session.id);
    setBpm(String(session.bpm));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        setProjectManagerOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

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
            <div className="flex items-center gap-4 mb-2">
               <h1 className="text-6xl font-black text-white tracking-tighter">CALLIOPE <span className="text-blue-500">PRO</span></h1>
               <div className="bg-blue-500/10 text-blue-500 text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border border-blue-500/20">Ultimate Edition</div>
            </div>
            <p className="text-xl text-gray-400 font-medium max-w-2xl leading-relaxed">
              Autonomous Music Production Suite. From prompt to master, architectural precision meets neural creative flow.
            </p>
          </div>
          <div className="flex gap-4">
             <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl flex flex-col items-end">
                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">Engine Status</span>
                <span className="text-blue-500 font-mono text-sm">CORES ACTIVE: 256</span>
             </div>
             <div className="bg-gray-900 border border-gray-800 p-4 rounded-2xl flex flex-col items-end">
                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">Neural Load</span>
                <span className="text-red-500 font-mono text-sm">OPTIMIZED</span>
             </div>
          </div>
        </div>
      </header>

      <div className="flex items-center justify-between mb-6">
        <nav className="flex items-center gap-3 bg-gray-900/50 p-2 rounded-2xl border border-gray-800/50 w-fit">
          {[
            { id: "arrangement", icon: Layout, label: "Arrangement", color: "bg-blue-600" },
            { id: "sequencer", icon: Piano, label: "Sequencer", color: "bg-indigo-600" },
            { id: "vocal_ai", icon: Mic2, label: "Vocal AI", color: "bg-red-600" },
            { id: "architect", icon: Cpu, label: "Architect", color: "bg-purple-600" },
            { id: "vocal_studio", icon: Mic, label: "Vocal Studio", color: "bg-orange-600" },
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

        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 size={16} />
          </button>
          <div className="w-px h-6 bg-gray-800" />
          <button
            onClick={() => setProjectManagerOpen(true)}
            className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white transition-all flex items-center gap-1.5"
            title="Save (Ctrl+S)"
          >
            <Save size={14} /> Save
          </button>
          <button
            onClick={() => { setProjectManagerOpen(true); }}
            className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white transition-all flex items-center gap-1.5"
          >
            <FolderOpen size={14} /> Open
          </button>
          <button
            onClick={() => { setProjectManagerOpen(true); }}
            className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white transition-all flex items-center gap-1.5"
          >
            <FilePlus2 size={14} /> New
          </button>
        </div>
      </div>

      <div className="studio-layout grid grid-cols-12 gap-8">
        <main className="col-span-9 space-y-8">
          {activeTab === "arrangement" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              <TimelineView
                bpm={parseInt(bpm) || 120}
                durationBars={32}
                sections={sections}
                tracks={tracks}
                onUpdateTrack={handleUpdateTrack}
              />
              <MixerConsole channels={mixerChannels} busses={busses} vcaGroups={vcaGroups} auxSends={sends} onUpdateChannel={handleUpdateChannel} onOpenRoutingModal={() => setRoutingModalOpen(true)} />
              <MixerRoutingModal open={routingModalOpen} onClose={() => setRoutingModalOpen(false)} channels={mixerChannels} routingNodes={routingNodes} busses={busses} sends={sends} vcaGroups={vcaGroups} vcaAssignments={vcaAssignments}
                onAddNode={(type, name) => { const newId = `node_${Date.now()}`; setRoutingNodes((prev) => [...prev, { id: newId, type: type as RoutingNode["type"], name, connections: [] }]); }}
                onRemoveNode={(id) => setRoutingNodes((prev) => prev.filter((n) => n.id !== id))}
                onConnect={(from, to) => setRoutingNodes((prev) => prev.map((n) => n.id === from ? { ...n, connections: [...n.connections.filter((c) => c !== to), to] } : n))}
                onDisconnect={(from, to) => setRoutingNodes((prev) => prev.map((n) => n.id === from ? { ...n, connections: n.connections.filter((c) => c !== to) } : n))}
                onAddBus={(name) => {}}
                onAddSend={(name) => {}}
                onRemoveSend={(id) => {}}
                onAddVCA={(name) => {}}
                onAssignVCA={(trackId, vcaId) => {}}
              />
            </motion.div>
          )}

          {activeTab === "sequencer" && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
               <PianoRoll />
             </motion.div>
          )}

          {activeTab === "vocal_ai" && (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
               <VocalAIPanel />
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
           {(activeTab === "architect" || activeTab === "vocal_ai") && (
             <div className="bg-gray-950 border border-gray-900 p-6 rounded-3xl">
                <VoiceDspPanel rack={vocalRack} sampleRate={48_000} />
             </div>
           )}
        </aside>
      </div>

      <ProjectManager
        open={projectManagerOpen}
        onClose={() => setProjectManagerOpen(false)}
        currentSessionId={sessionId}
        onSessionLoaded={handleSessionLoaded}
      />
    </motion.div>
  );
}
