import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Cpu, Sparkles, SlidersHorizontal, Mic, Music, Layout, Piano, Mic2, Save, FolderOpen, Undo2, Redo2, FilePlus2, Keyboard, History } from "lucide-react";
import { generatePlan, type GenerateDepth, type RouterProvider } from "../api/client";
import { VocalRackPanel } from "../components/studio/VocalRackPanel";
import { VoiceDspPanel } from "../components/studio/VoiceDspPanel";
import { DEFAULT_VOCAL_RACK, type VocalRackPayload } from "../types/vocalRack";
import { AudioRecorder } from "../components/audio/AudioRecorder";
import { AudioClipsManager } from "../components/audio/AudioClipsManager";
import { MixerConsole } from "../components/studio/MixerConsole";
import { MixerRoutingModal } from "../components/studio/MixerRoutingModal";
import { PianoRoll } from "../components/studio/PianoRoll";
import { VocalAIPanel } from "../components/studio/VocalAIPanel";
import { ProjectManager } from "../components/studio/ProjectManager";
import { useUndoRedo } from "../components/studio/useUndoRedo";
import { TransportBar } from "../components/studio/TransportBar";
import { StepSequencer } from "../components/studio/StepSequencer";
import { ArrangementEditor } from "../components/studio/ArrangementEditor";
import { MasterBus } from "../components/studio/MasterBus";
import { ExportDialog } from "../components/studio/ExportDialog";
import { KeyboardShortcuts } from "../components/studio/KeyboardShortcuts";
import { LoopBrowser, type LoopData } from "../components/studio/LoopBrowser";
import { LibraryPanel } from "../components/studio/LibraryPanel";
import { AudioDropTarget } from "../components/studio/AudioDropTarget";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import { useFileDragDrop } from "../hooks/useFileDragDrop";
import { RecordingPanel } from "../components/studio/RecordingPanel";
import { PerformanceMeter } from "../components/studio/PerformanceMeter";
import { UndoHistory } from "../components/studio/UndoHistory";
import { PluginRack } from "../components/studio/PluginRack";
import { MidiLearnPanel } from "../components/studio/MidiLearnPanel";
import { ModulationPanel } from "../components/studio/ModulationPanel";
import type { MixerChannel, RoutingNode } from "../types/audio";
import "../styles/knobs.css";

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

const DEMO_LOOPS: LoopData[] = [
  { id: "l1", name: "Deep Kick", bpm: 128, key: "C", category: "Drums", color: "#ef4444", duration: 4.2, bars: 4, tags: ["kick", "deep", "house"], dateAdded: "2025-01-15" },
  { id: "l2", name: "Trap Snare", bpm: 140, key: "G#", category: "Drums", color: "#f97316", duration: 2.1, bars: 2, tags: ["snare", "trap", "hiphop"], dateAdded: "2025-01-20" },
  { id: "l3", name: "Sub Bass", bpm: 128, key: "C", category: "Bass", color: "#8b5cf6", duration: 8.0, bars: 8, tags: ["bass", "sub", "deep"], dateAdded: "2025-02-01" },
  { id: "l4", name: "Pluck Lead", bpm: 128, key: "Am", category: "Synth", color: "#3b82f6", duration: 4.0, bars: 4, tags: ["pluck", "lead", "synth"], dateAdded: "2025-02-10" },
  { id: "l5", name: "Pad Swell", bpm: 90, key: "F", category: "Pads", color: "#06b6d4", duration: 8.0, bars: 8, tags: ["pad", "swell", "ambient"], dateAdded: "2025-02-15" },
  { id: "l6", name: "Hat Loop", bpm: 128, key: "C", category: "Drums", color: "#eab308", duration: 2.0, bars: 2, tags: ["hats", "groove", "house"], dateAdded: "2025-03-01" },
  { id: "l7", name: "Arp 140", bpm: 140, key: "Dm", category: "Arp", color: "#ec4899", duration: 4.0, bars: 4, tags: ["arp", "melodic", "techno"], dateAdded: "2025-03-05" },
  { id: "l8", name: "Vocal Chop", bpm: 128, key: "C", category: "Vocals", color: "#10b981", duration: 1.0, bars: 1, tags: ["vocal", "chop", "fx"], dateAdded: "2025-03-10" },
];

const EMPTY_STEP = { active: false, velocity: 100, ratchet: 1 };

const FAVORITES_STORAGE_KEY = "calliope_loop_favorites";

function loadLoopFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set(["l1", "l3", "l5"]);
}

const AVAILABLE_PLUGINS = [
  { id: "eq1", name: "Parametric EQ", category: "EQ", params: [{ name: "Low Gain", value: 0, min: -12, max: 12, step: 0.1, unit: "dB" }] },
  { id: "comp1", name: "Bus Compressor", category: "Compressor", params: [{ name: "Threshold", value: -18, min: -60, max: 0, step: 0.5, unit: "dB" }] },
  { id: "rev1", name: "Plate Reverb", category: "Reverb", params: [{ name: "Mix", value: 0.25, min: 0, max: 1, step: 0.01 }] },
  { id: "delay1", name: "Stereo Delay", category: "Delay", params: [{ name: "Time", value: 250, min: 1, max: 2000, step: 1, unit: "ms" }] },
  { id: "sat1", name: "Tape Saturation", category: "Distortion", params: [{ name: "Drive", value: 0.3, min: 0, max: 1, step: 0.01 }] },
];

function makePattern() {
  const rows = ["Kick", "Snare", "HH Closed", "HH Open", "Clap", "Tom", "Crash", "Perc"];
  const steps: Record<string, typeof EMPTY_STEP[]> = {};
  for (const row of rows) {
    steps[row] = Array.from({ length: 16 }, () => ({ ...EMPTY_STEP }));
  }
  return {
    id: "p1", name: "Main", steps, length: 16,
    swing: 0, rows: 8,
  };
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
  const [activeTab, setActiveTab] = useState<StudioTab>("arrangement");
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [undoHistoryOpen, setUndoHistoryOpen] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [sampleRate, setSampleRate] = useState(48000);
  const [bufferSize, setBufferSize] = useState(256);
  const [loopFavorites, setLoopFavorites] = useState<Set<string>>(loadLoopFavorites);
  const [rackPlugins, setRackPlugins] = useState<Array<{
    id: string; name: string; category: string; bypassed: boolean; wetDry: number;
    params: Array<{ name: string; value: number; min: number; max: number; step: number; unit?: string }>;
    sidechainSource?: string;
  }>>([
    { id: "p1", name: "Parametric EQ", category: "EQ", bypassed: false, wetDry: 1, params: [{ name: "Low Gain", value: 2, min: -12, max: 12, step: 0.1, unit: "dB" }] },
    { id: "p2", name: "Bus Compressor", category: "Compressor", bypassed: false, wetDry: 1, params: [{ name: "Threshold", value: -18, min: -60, max: 0, step: 0.5, unit: "dB" }], sidechainSource: "1" },
  ]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isMetronome, setIsMetronome] = useState(false);
  const [transportPosition, setTransportPosition] = useState({ bars: 1, beats: 1, sixteenths: 1 });
  const [currentBpm, setCurrentBpm] = useState(132);
  const [currentStep, setCurrentStep] = useState(0);
  const [libraryWidth] = useState(320);
  const [showLibrary] = useState(true);
  const [pattern] = useState(makePattern());

  const { isDragging, dragData, startDrag, endDrag } = useDragAndDrop();
  const { isDragOver, draggedFiles } = useFileDragDrop({
    accept: [".wav", ".mp3", ".flac", ".aiff", ".ogg"],
    onFilesDrop: (files) => console.log("Dropped files:", files.map((f) => f.name)),
  });

  const initialTracks: TrackState[] = [
    { id: "1", name: "Drums", type: "drum", volume: -3, pan: 0, muted: false, solo: false, armed: false, color: "#8b5cf6" },
    { id: "2", name: "Sub Bass", type: "bass", volume: -6, pan: 0, muted: false, solo: false, armed: false, color: "#ef4444" },
    { id: "3", name: "Synth Lead", type: "lead", volume: -10, pan: -0.2, muted: false, solo: false, armed: false, color: "#3b82f6" },
    { id: "4", name: "Vocals (AI)", type: "vocal", volume: -4, pan: 0.1, muted: false, solo: false, armed: true, color: "#10b981" },
  ];

  const { state: tracks, setState: setTracks, undo, redo, canUndo, canRedo, historyLog, currentHistoryIndex, jumpToHistoryIndex, clear: clearHistory } = useUndoRedo<TrackState[]>(initialTracks);

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

  const [busses] = useState([{ id: "bus1", name: "Drums Bus", volume: 0.85 }]);
  const [sends] = useState([{ id: "send1", name: "Reverb Send", level: 0.5, source: "src3", destination: "fx1" }]);
  const [vcaGroups] = useState([{ id: "vca1", name: "Drums Group", volume: 0.9 }]);
  const [vcaAssignments] = useState<Record<string, string>>({ "1": "vca1" });

  const [sections, setSections] = useState([
    { name: "Intro", startBar: 0, bars: 8, color: "rgba(139, 92, 246, 0.3)" },
    { name: "Build", startBar: 8, bars: 8, color: "rgba(239, 68, 68, 0.3)" },
    { name: "Drop", startBar: 16, bars: 16, color: "rgba(59, 130, 246, 0.3)" },
  ]);

  const [arrangementClips] = useState([
    { id: "c1", trackId: "1", name: "Kick Pattern", startBar: 0, duration: 16, color: "#8b5cf6", type: "audio" },
    { id: "c2", trackId: "2", name: "Sub Line", startBar: 4, duration: 12, color: "#ef4444", type: "audio" },
    { id: "c3", trackId: "3", name: "Synth Riff", startBar: 8, duration: 8, color: "#3b82f6", type: "midi" },
    { id: "c4", trackId: "4", name: "Vocal Phrase", startBar: 12, duration: 4, color: "#10b981", type: "audio" },
  ]);

  const handleUpdateChannel = useCallback((channelId: string, updates: Partial<MixerChannel>) => {
    setMixerChannels((prev) => prev.map((ch) => (ch.id === channelId ? { ...ch, ...updates } : ch)));
  }, []);

  const handleUpdateTrack = useCallback((trackId: string, updates: Record<string, unknown>) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, ...updates } as TrackState : t), `Update ${trackId}`);
  }, [setTracks]);

  const handleSessionLoaded = useCallback((session: { id: string; name: string; bpm: number; key: string }) => {
    setSessionId(session.id);
    setBpm(String(session.bpm));
  }, []);

  const handleLoopDrop = useCallback((_loop: LoopData, _trackId?: string) => {
    endDrag();
  }, [endDrag]);

  const handleToggleFavorite = useCallback((loopId: string) => {
    setLoopFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(loopId)) next.delete(loopId);
      else next.add(loopId);
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const [recordLevels] = useState({ left: 0.55, right: 0.48 });

  const handleExport = useCallback((_options: Record<string, unknown>) => {
    setExportDialogOpen(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); setProjectManagerOpen(true); }
      if (e.key === " " && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); setIsPlaying(p => !p); }
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) { setKeyboardShortcutsOpen(true); }
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
        provider, model: model.trim() || undefined, depth,
        genre: genre.trim() || undefined,
        bpm_hint: bpmN && bpmN > 0 ? bpmN : undefined,
        vocal_rack: vocalInject ? vocalRack : undefined,
      });
      setOut(res.response);
      setMeta(`${res.provider} · ${res.model} · depth=${res.depth}`);
    } catch (e) {
      setOut(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div className="studio-page p-4 max-w-[1600px] mx-auto flex flex-col h-screen" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <header className="studio-hero mb-2 flex-shrink-0">
        <div className="studio-hero__strip" />
        <div className="studio-hero__row flex justify-between items-end">
          <div>
            <div className="flex items-center gap-4 mb-1">
              <h1 className="text-4xl font-black text-white tracking-tighter">CALLIOPE <span className="text-blue-500">PRO</span></h1>
              <div className="bg-blue-500/10 text-blue-500 text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border border-blue-500/20">Ultimate Edition</div>
            </div>
            <p className="text-sm text-gray-400 font-medium max-w-2xl leading-relaxed">Autonomous Music Production Suite. From prompt to master.</p>
          </div>
          <div className="flex gap-4">
            <div className="bg-gray-900 border border-gray-800 p-3 rounded-2xl flex flex-col items-end">
              <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">Engine Status</span>
              <span className="text-blue-500 font-mono text-sm">CORES ACTIVE: 256</span>
            </div>
            <div className="bg-gray-900 border border-gray-800 p-3 rounded-2xl flex flex-col items-end">
              <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">Neural Load</span>
              <span className="text-red-500 font-mono text-sm">OPTIMIZED</span>
            </div>
          </div>
        </div>
      </header>

      <TransportBar
        isPlaying={isPlaying}
        isRecording={isRecording}
        isLooping={isLooping}
        isMetronomeOn={isMetronome}
        bpm={currentBpm}
        position={transportPosition}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onStop={() => { setIsPlaying(false); setIsRecording(false); setRecordingPaused(false); setTransportPosition({ bars: 1, beats: 1, sixteenths: 1 }); }}
        onRecord={() => setIsRecording(r => !r)}
        onBpmChange={setCurrentBpm}
        onPositionChange={setTransportPosition}
        onLoopToggle={() => setIsLooping(l => !l)}
        onMetronomeToggle={() => setIsMetronome(m => !m)}
      />

      <div className="flex items-center justify-between mb-2 flex-shrink-0 gap-3">
        <PerformanceMeter
          sampleRate={sampleRate}
          bufferSize={bufferSize}
          onSampleRateChange={setSampleRate}
          onBufferSizeChange={setBufferSize}
        />
        {(isDragOver || draggedFiles.length > 0) && (
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
            Drop {draggedFiles.length || ""} audio file{draggedFiles.length === 1 ? "" : "s"} to import
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <nav className="flex items-center gap-2 bg-gray-900/50 p-1.5 rounded-2xl border border-gray-800/50 w-fit">
          {([
            { id: "arrangement", icon: Layout, label: "Arrangement", color: "bg-blue-600" },
            { id: "sequencer", icon: Piano, label: "Sequencer", color: "bg-indigo-600" },
            { id: "vocal_ai", icon: Mic2, label: "Vocal AI", color: "bg-red-600" },
            { id: "architect", icon: Cpu, label: "Architect", color: "bg-purple-600" },
            { id: "vocal_studio", icon: Mic, label: "Vocal Studio", color: "bg-orange-600" },
            { id: "plugin_chain", icon: SlidersHorizontal, label: "FX Rack", color: "bg-teal-600" },
            { id: "clips", icon: Music, label: "Library", color: "bg-green-600" },
          ] as const).map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as StudioTab)}
              className={`px-4 py-2 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${activeTab === tab.id ? `${tab.color} text-white shadow-lg` : "text-gray-500 hover:text-white hover:bg-gray-800"}`}>
              <tab.icon size={15} /> {tab.label}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button onClick={undo} disabled={!canUndo} className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all" title="Undo (Ctrl+Z)"><Undo2 size={14} /></button>
          <button onClick={redo} disabled={!canRedo} className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all" title="Redo (Ctrl+Shift+Z)"><Redo2 size={14} /></button>
          <button onClick={() => setUndoHistoryOpen(true)} className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white transition-all" title="Undo History"><History size={14} /></button>
          <div className="w-px h-5 bg-gray-800" />
          <button onClick={() => setProjectManagerOpen(true)} className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white transition-all flex items-center gap-1.5" title="Save (Ctrl+S)"><Save size={14} /> Save</button>
          <button onClick={() => setProjectManagerOpen(true)} className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white transition-all flex items-center gap-1.5"><FolderOpen size={14} /> Open</button>
          <button onClick={() => setProjectManagerOpen(true)} className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white transition-all flex items-center gap-1.5"><FilePlus2 size={14} /> New</button>
          <div className="w-px h-5 bg-gray-800" />
          <button onClick={() => setExportDialogOpen(true)} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all flex items-center gap-1.5 text-sm">Export</button>
          <button onClick={() => setKeyboardShortcutsOpen(true)} className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white transition-all" title="Keyboard Shortcuts (?)"><Keyboard size={14} /></button>
        </div>
      </div>

      <div className="flex flex-1 gap-4 min-h-0">
        {showLibrary && (
          <LibraryPanel
            width={libraryWidth}
            loops={DEMO_LOOPS}
            favorites={loopFavorites}
            onToggleFavorite={handleToggleFavorite}
            onLoopSelect={(loop) => console.log("Selected:", loop.name)}
            onDropToTrack={handleLoopDrop}
          />
        )}

        <main className="flex-1 flex flex-col gap-4 min-w-0 overflow-auto">
          {activeTab === "arrangement" && (
            <div className="space-y-4">
              <RecordingPanel
                isRecording={isRecording}
                isPaused={recordingPaused}
                onStart={() => { setIsRecording(true); setRecordingPaused(false); }}
                onStop={() => { setIsRecording(false); setRecordingPaused(false); }}
                onPause={() => setRecordingPaused((p) => !p)}
                levels={recordLevels}
              />
              <ArrangementEditor
                tracks={tracks.map(t => ({ id: t.id, name: t.name, type: t.type === "drum" ? "audio" : t.type, color: t.color, height: 80 }))}
                clips={arrangementClips}
                sections={sections}
                isPlaying={isPlaying}
                currentPosition={transportPosition.bars + (transportPosition.beats - 1) / 4 + (transportPosition.sixteenths - 1) / 16}
                zoom={1}
                onZoomChange={() => {}}
                onClipMove={() => {}}
                onClipResize={() => {}}
                onSectionChange={setSections}
              />
              <AudioDropTarget trackId="drop" onDrop={(id) => console.log("Drop:", id)} onFileDrop={(files) => console.log("Files:", files.length)} isActive={isDragging || isDragOver} />
              <ModulationPanel />
              <MixerConsole channels={mixerChannels} busses={busses} vcaGroups={vcaGroups} auxSends={sends} onUpdateChannel={handleUpdateChannel} onOpenRoutingModal={() => setRoutingModalOpen(true)} />
              <MixerRoutingModal open={routingModalOpen} onClose={() => setRoutingModalOpen(false)} channels={mixerChannels} routingNodes={routingNodes} busses={busses} sends={sends} vcaGroups={vcaGroups} vcaAssignments={vcaAssignments}
                onAddNode={(type, name) => { const newId = `node_${Date.now()}`; setRoutingNodes((prev) => [...prev, { id: newId, type: type as RoutingNode["type"], name, connections: [] }]); }}
                onRemoveNode={(id) => setRoutingNodes((prev) => prev.filter((n) => n.id !== id))}
                onConnect={(from, to) => setRoutingNodes((prev) => prev.map((n) => n.id === from ? { ...n, connections: [...n.connections.filter((c) => c !== to), to] } : n))}
                onDisconnect={(from, to) => setRoutingNodes((prev) => prev.map((n) => n.id === from ? { ...n, connections: n.connections.filter((c) => c !== to) } : n))}
                onAddBus={() => {}} onAddSend={() => {}} onRemoveSend={() => {}} onAddVCA={() => {}} onAssignVCA={() => {}}
              />
              <MasterBus masterChannel={mixerChannels.find(c => c.type === "master")!} onUpdate={(updates) => handleUpdateChannel("master", updates)} metering={{ integrated: -14, shortTerm: -16, momentary: -12, correlation: 0.85, peak: -3 }} />
            </div>
          )}

          {activeTab === "sequencer" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PianoRoll />
              <StepSequencer pattern={pattern} onPatternChange={() => {}} isPlaying={isPlaying} currentStep={currentStep} bpm={currentBpm} onBpmChange={setCurrentBpm} />
            </div>
          )}

          {activeTab === "vocal_ai" && (
            <div className="space-y-4">
              <VocalAIPanel />
              <MidiLearnPanel />
            </div>
          )}

          {activeTab === "architect" && (
            <div className="glass-panel bg-gray-900/50 border border-gray-800 p-6 rounded-3xl space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Producer Brief</label>
                <textarea className="w-full bg-black/50 border border-gray-800 rounded-2xl p-5 text-gray-200 focus:border-purple-500 outline-none transition-colors" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest">AI Provider</label>
                    <select className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white font-bold" value={provider} onChange={(e) => setProvider(e.target.value as RouterProvider)}>
                      {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Architect Depth</label>
                    <select className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white font-bold" value={depth} onChange={(e) => setDepth(e.target.value as GenerateDepth)}>
                      <option value="standard">Standard</option>
                      <option value="deep">Deep</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-4">
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
              <div className="flex gap-4">
                <button onClick={() => void onGenerate()} disabled={busy} className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black py-4 rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 text-sm">
                  <Layout size={20} /> {busy ? "ARCHITECTING..." : "GENERATE PRODUCTION PLAN"}
                </button>
                <button disabled={busy} className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-black py-4 rounded-2xl shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 text-sm">
                  <Sparkles size={20} /> {busy ? "CONDUCTING..." : "CONDUCT FULL MASTER"}
                </button>
              </div>
            </div>
          )}

          {activeTab === "vocal_studio" && (
            <div className="space-y-4">
              <RecordingPanel
                isRecording={isRecording}
                isPaused={recordingPaused}
                onStart={() => { setIsRecording(true); setRecordingPaused(false); }}
                onStop={() => { setIsRecording(false); setRecordingPaused(false); }}
                onPause={() => setRecordingPaused((p) => !p)}
                levels={recordLevels}
              />
              <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl"><AudioRecorder /></div>
            </div>
          )}
          {activeTab === "plugin_chain" && (
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl">
              <PluginRack
                plugins={rackPlugins}
                availablePlugins={AVAILABLE_PLUGINS}
                onReorder={setRackPlugins}
                onAdd={(plugin) => setRackPlugins((prev) => [...prev, {
                  id: `p_${Date.now()}`,
                  name: plugin.name,
                  category: plugin.category,
                  bypassed: false,
                  wetDry: 1,
                  params: plugin.params ?? [],
                }])}
                onRemove={(id) => setRackPlugins((prev) => prev.filter((p) => p.id !== id))}
                onBypass={(id, bypassed) => setRackPlugins((prev) => prev.map((p) => p.id === id ? { ...p, bypassed } : p))}
                onParamChange={(pluginId, paramName, value) => setRackPlugins((prev) => prev.map((p) => p.id === pluginId ? {
                  ...p,
                  params: p.params.map((param) => param.name === paramName ? { ...param, value } : param),
                } : p))}
                onWetDry={(pluginId, mix) => setRackPlugins((prev) => prev.map((p) => p.id === pluginId ? { ...p, wetDry: mix } : p))}
              />
            </div>
          )}
          {activeTab === "clips" && <div className="bg-gray-900 border border-gray-800 p-6 rounded-3xl"><AudioClipsManager /></div>}
        </main>
      </div>

      <ProjectManager open={projectManagerOpen} onClose={() => setProjectManagerOpen(false)} currentSessionId={sessionId} onSessionLoaded={handleSessionLoaded} />
      <ExportDialog open={exportDialogOpen} onClose={() => setExportDialogOpen(false)} onExport={handleExport} sessionName="Untitled Session" trackCount={tracks.length} duration={120} />
      <KeyboardShortcuts open={keyboardShortcutsOpen} onClose={() => setKeyboardShortcutsOpen(false)} />
      <UndoHistory
        open={undoHistoryOpen}
        onClose={() => setUndoHistoryOpen(false)}
        history={historyLog}
        currentIndex={currentHistoryIndex}
        onJumpToIndex={jumpToHistoryIndex}
        onClear={clearHistory}
      />
    </motion.div>
  );
}
