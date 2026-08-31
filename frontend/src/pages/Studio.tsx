import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Cpu, Download, FilePlus2, FolderOpen, GitBranch, Keyboard, Mic, Music, Plus, Redo2, Undo2 } from "lucide-react";
import {
  alignAamati,
  analyzeBrief,
  composeFromAamati,
  generatePlan,
  createRecordingSession,
  uploadRecordingFile,
  commitRapTake,
  fetchGeneratedDrumsBlob,
  type CommitRapTakeResult,
  type RapStyle,
  type AamatiComposeResult,
  type GenerateDepth,
  type RouterProvider,
} from "../api/client";
import { AudioRecorder, type AudioRecorderHandle } from "../components/audio/AudioRecorder";
import { PluginChainEditor } from "../components/audio/PluginChainEditor";
import { ArrangementEditor, type ArrangementClip } from "../components/studio/ArrangementEditor";
import { AutomationLane } from "../components/studio/AutomationLane";
import { ExportDialog } from "../components/studio/ExportDialog";
import { KeyboardShortcuts } from "../components/studio/KeyboardShortcuts";
import { LiveRecScope } from "../components/studio/LiveRecScope";
import { MasterBus } from "../components/studio/MasterBus";
import { MixerConsole, type MixerTrack } from "../components/studio/MixerConsole";
import { SplashIntro } from "../components/studio/SplashIntro";
import { LlmOutput } from "../components/pipeline/LlmOutput";
import { AamatiSteerCard } from "../components/studio/AamatiSteerCard";
import { StudioTransport, type TransportState } from "../components/studio/StudioTransport";
import { TimelineView, type TimelineClip } from "../components/studio/TimelineView";
import { VocalRackPanel } from "../components/studio/VocalRackPanel";
import { RapSongPathPanel } from "../components/studio/RapSongPathPanel";
import { VoiceDspPanel } from "../components/studio/VoiceDspPanel";
import { VocalAIPanel } from "../components/studio/VocalAIPanel";
import {
  barsFromDuration,
  DEFAULT_MASTER_CHANNEL,
  StudioEngine,
  type EngineAutomationPoint,
  type EngineClip,
  type EngineMasterChannel,
} from "../audio/studioEngine";
import { downloadBlob, encodeWav } from "../audio/exportWav";
import { SynthEngine, getSharedSynthContext, type SynthConfig, DEFAULT_SYNTH } from "../audio/synthEngine";
import { PianoRoll, type PianoNote } from "../components/studio/PianoRoll";
import { InstrumentTab } from "../components/studio/InstrumentTab";
import { takeGesturesStudioImport } from "../gestures/studioHandoff";
import { DEFAULT_VOCAL_RACK, VOCAL_PRESETS, type VocalRackPayload } from "../types/vocalRack";
import type { AutomationPoint, PluginInstance, RecordingFile } from "../types/audio";

const PROVIDERS: { value: RouterProvider; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "ollama", label: "Ollama" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "gemini", label: "Gemini" },
];

const TRACK_COLORS = ["#6b7a99", "#8b6b9e", "#5b8def", "#3dd68c", "#e8b84a", "#f2555a", "#7dd3c0", "#c084fc"];

type InspectorTab = "vocal" | "fx" | "ai" | "pipeline" | "instrument";

const INITIAL_TRACKS: MixerTrack[] = [
  { id: "1", name: "Drums", type: "drum", volume: -3, pan: 0, muted: false, solo: false, color: "#6b7a99" },
  { id: "2", name: "Bass", type: "bass", volume: -6, pan: 0, muted: false, solo: false, color: "#8b6b9e" },
  { id: "3", name: "Synth", type: "lead", volume: -10, pan: -0.2, muted: false, solo: false, color: "#5b8def" },
  { id: "4", name: "Vocals", type: "vocal", volume: -4, pan: 0.05, muted: false, solo: false, color: "#3dd68c" },
];

const SECTIONS = [
  { name: "Intro", startBar: 0, bars: 8, color: "rgba(107, 122, 153, 0.35)" },
  { name: "Build", startBar: 8, bars: 8, color: "rgba(91, 141, 239, 0.28)" },
  { name: "Drop", startBar: 16, bars: 16, color: "rgba(61, 214, 140, 0.22)" },
];

type StudioSection = (typeof SECTIONS)[number];

type StudioClip = EngineClip & {
  name: string;
  color: string;
  durationSec: number;
  waveformPeaks?: number[];
};

const LIVE_CLIP_ID = "clip-live-recording";
const STORAGE_KEY = "calliope.project.v1";

type ProjectSnapshot = {
  bpm: number;
  tracks: MixerTrack[];
  clips: Omit<StudioClip, "waveformPeaks">[];
  pluginChain: PluginInstance[];
  trackPlugins: Record<string, PluginInstance[]>;
  sections: StudioSection[];
};

export function Studio() {
  const recorderRef = useRef<AudioRecorderHandle>(null);
  const engineRef = useRef<StudioEngine | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const tracksRef = useRef<MixerTrack[]>(INITIAL_TRACKS);
  const clipsRef = useRef<StudioClip[]>([]);
  const [tracks, setTracks] = useState<MixerTrack[]>(INITIAL_TRACKS);
  const [clips, setClips] = useState<StudioClip[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState("4");
  const [vocalDockOpen, setVocalDockOpen] = useState(true);
  const [tracksOpen, setTracksOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mixerOpen, setMixerOpen] = useState(true);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("vocal");
  const [viewMode, setViewMode] = useState<"arrange" | "edit">("arrange");
  const [pluginChain, setPluginChain] = useState<PluginInstance[]>([]);
  const [sections, setSections] = useState<StudioSection[]>(SECTIONS);
  const [zoom, setZoom] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [trackPlugins, setTrackPlugins] = useState<Record<string, PluginInstance[]>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const selectedClipRef = useRef<string | null>(null);
  const [recordedSamples, setRecordedSamples] = useState<Float32Array | null>(null);
  const [recordedSampleRate, setRecordedSampleRate] = useState<number>(48000);
  const [lastRecordingFile, setLastRecordingFile] = useState<{ id: string; sessionId: string } | null>(null);
  const [rapPathBusy, setRapPathBusy] = useState(false);
  const [rapPathStatus, setRapPathStatus] = useState<string | null>(null);
  const [rapStyle, setRapStyle] = useState<RapStyle>("melodic_rap");
  const importInputRef = useRef<HTMLInputElement>(null);
  const liveGrowRef = useRef<number | null>(null);
  const liveStartRef = useRef<{ bar: number; atMs: number } | null>(null);
  const synthRef = useRef<SynthEngine | null>(null);
  const [synthConfig, setSynthConfig] = useState<SynthConfig>({ ...DEFAULT_SYNTH });
  const [pianoNotes, setPianoNotes] = useState<PianoNote[]>([]);
  const [seqPattern, setSeqPattern] = useState(() => {
    const empty = (len: number) => Array.from({ length: len }, () => ({ active: false, velocity: 100, ratchet: 1 }));
    const rows = ["Kick","Snare","HH Closed","HH Open","Clap","Tom","Crash","Perc"] as const;
    const steps: Record<string, { active: boolean; velocity: number; ratchet: number }[]> = {};
    rows.forEach((r) => { steps[r] = empty(16); });
    // Default pattern: 4-on-the-floor kick
    steps["Kick"][0].active = true;
    steps["Kick"][4].active = true;
    steps["Kick"][8].active = true;
    steps["Kick"][12].active = true;
    // Snare on 2 and 4
    steps["Snare"][4].active = true;
    steps["Snare"][12].active = true;
    // Hi-hats on every 8th
    for (let i = 0; i < 16; i += 2) steps["HH Closed"][i].active = true;
    return { id: "default", name: "Beat 1", steps, length: 16 };
  });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [masterCh, setMasterCh] = useState<EngineMasterChannel>({ ...DEFAULT_MASTER_CHANNEL });
  const [automation, setAutomation] = useState<Record<string, AutomationPoint[]>>({});
  const [meter, setMeter] = useState({ peak: 0, rms: 0 });
  const [booted, setBooted] = useState(false);

  const [bpm, setBpm] = useState(132);
  const [transport, setTransport] = useState<TransportState>({
    playing: false,
    recording: false,
    armed: true,
    bar: 1,
    beat: 0,
  });

  const [prompt, setPrompt] = useState(
    "Dark UK garage, 132 BPM, swung hats, minor 9 chords, dubby chords on the offbeat",
  );
  const [provider, setProvider] = useState<RouterProvider>("ollama");
  const [depth] = useState<GenerateDepth>("standard");
  const [genre, setGenre] = useState("");
  const [vocalRack, setVocalRack] = useState<VocalRackPayload>({ ...DEFAULT_VOCAL_RACK });
  const [vocalInject, setVocalInject] = useState(true);
  const [planOut, setPlanOut] = useState("");
  const [planMeta, setPlanMeta] = useState("");
  const [planBusy, setPlanBusy] = useState(false);

  const [pipeText, setPipeText] = useState("Neurofunk 174 BPM, reese bass, tight snare ghost layers");
  const [pipeDepth, setPipeDepth] = useState<GenerateDepth>("deep");
  const [pipeAnalysis, setPipeAnalysis] = useState("");
  const [pipeAamati, setPipeAamati] = useState("");
  const [pipePlan, setPipePlan] = useState("");
  const [pipeMeta, setPipeMeta] = useState("");
  const [busyA, setBusyA] = useState(false);
  const [busyM, setBusyM] = useState(false);
  const [busyG, setBusyG] = useState(false);
  const [busyC, setBusyC] = useState(false);
  const [pipeLocked, setPipeLocked] = useState<AamatiComposeResult | null>(null);
  const [pipeFree, setPipeFree] = useState<AamatiComposeResult | null>(null);

  const [playHint, setPlayHint] = useState("");

  const onPlayRef = useRef<() => void>(() => {});
  const onRecordRef = useRef<() => void>(() => {});
  const onStopRef = useRef<() => void>(() => {});
  const onSeekBarRef = useRef<(barZero: number) => void>(() => {});
  const undoRef = useRef<() => void>(() => {});
  const redoRef = useRef<() => void>(() => {});
  const deleteClipRef = useRef<(clipId: string) => void>(() => {});
  const selectedTrackIdRef = useRef(selectedTrackId);
  const transportRef = useRef(transport);

  tracksRef.current = tracks;
  clipsRef.current = clips;
  selectedClipRef.current = selectedClipId;
  selectedTrackIdRef.current = selectedTrackId;
  transportRef.current = transport;

  // —— Undo/redo history (snapshots of the arrangement) ——
  const pastRef = useRef<Array<Pick<ProjectSnapshot, "tracks" | "clips">>>([]);
  const futureRef = useRef<Array<Pick<ProjectSnapshot, "tracks" | "clips">>>([]);
  const lastPushRef = useRef<{ tag: string; t: number } | null>(null);
  const [hist, setHist] = useState({ past: 0, future: 0 });
  const pushHistory = useCallback((tag: string) => {
    const now = performance.now();
    const last = lastPushRef.current;
    if (last && last.tag === tag && now - last.t < 900) {
      last.t = now; // coalesce drag streams into one undo step
      return;
    }
    const snap: ProjectSnapshot = {
      bpm,
      tracks: tracksRef.current.map((t) => ({ ...t })),
      clips: clipsRef.current.map((c) => ({ ...c })),
      pluginChain: pluginChain.map((p) => ({ ...p, parameters: p.parameters.map((pp) => ({ ...pp })) })),
      trackPlugins: Object.fromEntries(
        Object.entries(trackPlugins).map(([k, v]) => [k, v.map((p) => ({ ...p, parameters: p.parameters.map((pp) => ({ ...pp })) }))]),
      ),
      sections: sections.map((sec) => ({ ...sec })),
    };
    pastRef.current.push(snap);
    if (pastRef.current.length > 80) pastRef.current.shift();
    futureRef.current = [];
    lastPushRef.current = { tag, t: now };
    setHist({ past: pastRef.current.length, future: 0 });
  }, [bpm, pluginChain, trackPlugins, sections]);

  const applySnapshot = useCallback(
    (snap: { tracks: MixerTrack[]; clips: StudioClip[] }) => {
      setTracks(snap.tracks.map((t) => ({ ...t })));
      setClips(snap.clips.map((c) => ({ ...c })));
    },
    [],
  );

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push({ tracks: tracksRef.current, clips: clipsRef.current });
    applySnapshot(prev);
    lastPushRef.current = null;
    setHist({ past: pastRef.current.length, future: futureRef.current.length });
  }, [applySnapshot]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    const snap: ProjectSnapshot = {
      bpm,
      tracks: tracksRef.current.map((t) => ({ ...t })),
      clips: clipsRef.current.map((c) => ({ ...c })),
      pluginChain: pluginChain.map((p) => ({ ...p, parameters: p.parameters.map((pp) => ({ ...pp })) })),
      trackPlugins: Object.fromEntries(
        Object.entries(trackPlugins).map(([k, v]) => [k, v.map((p) => ({ ...p, parameters: p.parameters.map((pp) => ({ ...pp })) }))]),
      ),
      sections: sections.map((sec) => ({ ...sec })),
    };
    pastRef.current.push(snap);
    applySnapshot(next);
    lastPushRef.current = null;
    setHist({ past: pastRef.current.length, future: futureRef.current.length });
  }, [applySnapshot]);

  // —— Project persistence (localStorage autosave) ——
  const restoredRef = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as ProjectSnapshot;
      if (!Array.isArray(p.clips) || !Array.isArray(p.tracks)) return;
      setBpm(p.bpm ?? 120);
      setTracks(p.tracks);
      setClips(p.clips);
      setPluginChain(p.pluginChain ?? []);
      setTrackPlugins(p.trackPlugins ?? {});
      setSections(p.sections ?? SECTIONS);
      restoredRef.current = true;
      setPlayHint("Restored your last project");
      void (async () => {
        const engine = ensureEngine();
        for (const c of p.clips) {
          try {
            await engine.loadClip(c);
            const peaks = engine.getClipPeaks(c.sessionId, c.recordingId);
            if (peaks) {
              setClips((prev) => prev.map((x) => (x.id === c.id ? { ...x, waveformPeaks: peaks } : x)));
            }
          } catch {
            /* clip source unavailable — keep placeholder */
          }
        }
      })();
    } catch {
      /* corrupt save — start fresh */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (transport.recording) return; // don't persist live-take churn
    const id = window.setTimeout(() => {
      try {
        const snap: ProjectSnapshot = {
          bpm,
          tracks,
          clips: clips.map(({ waveformPeaks: _wp, ...rest }) => rest),
          pluginChain,
          trackPlugins,
          sections,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
        setSavedAt(Date.now());
      } catch {
        /* storage full/unavailable */
      }
    }, 800);
    return () => window.clearTimeout(id);
  }, [bpm, tracks, clips, pluginChain, trackPlugins, sections, transport.recording]);

  const newSession = useCallback(() => {
    engineRef.current?.stop();
    setTransport((t) => ({ ...t, playing: false, bar: 1, beat: 0 }));
    setSelectedClipId(null);
    localStorage.removeItem(STORAGE_KEY);
    setTracks(INITIAL_TRACKS);
    setClips([]);
    setSections(SECTIONS);
    setPluginChain([]);
    setTrackPlugins({});
    pastRef.current = [];
    futureRef.current = [];
    lastPushRef.current = null;
    setHist({ past: 0, future: 0 });
    setSavedAt(null);
    restoredRef.current = true;
    setPlayHint("New session");
  }, []);

  useEffect(() => {
    engineRef.current = new StudioEngine();
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setPluginChain(pluginChain);
  }, [pluginChain]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    for (const [trackId, chain] of Object.entries(trackPlugins)) {
      engine.setTrackPluginChain(trackId, chain);
    }
  }, [trackPlugins]);

  useEffect(() => {
    engineRef.current?.applyTracks(tracks);
  }, [tracks]);

  useEffect(() => {
    engineRef.current?.setMasterChannel(masterCh);
  }, [masterCh]);

  useEffect(() => {
    const barSec = (60 / bpm) * 4;
    const converted: Record<string, EngineAutomationPoint[]> = {};
    for (const [trackId, pts] of Object.entries(automation)) {
      converted[trackId] = pts.map((p) => ({ bar: p.time_ms / 1000 / barSec, value: p.value }));
    }
    engineRef.current?.setTrackAutomation(converted);
  }, [automation, bpm]);

  // Real master metering off the analyser after the fader (10 fps is plenty for UI).
  useEffect(() => {
    if (!transport.playing) return;
    const id = window.setInterval(() => {
      setMeter(engineRef.current?.readMasterMeter() ?? { peak: 0, rms: 0 });
    }, 100);
    return () => {
      window.clearInterval(id);
      setMeter({ peak: 0, rms: 0 });
    };
  }, [transport.playing]);

  // Global shortcuts: Space play/stop · R record · E export · ? shortcut map
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (e.shiftKey) onStopRef.current();
        else void onPlayRef.current();
      } else if (e.key === "Home") {
        e.preventDefault();
        onStopRef.current();
      } else if (e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onSeekBarRef.current(Math.max(0, transportRef.current.bar - 2));
      } else if (e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onSeekBarRef.current(transportRef.current.bar);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        onRecordRef.current();
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setExportOpen(true);
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redoRef.current();
        else undoRef.current();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redoRef.current();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const sel = selectedClipRef.current;
        if (sel && sel !== LIVE_CLIP_ID) {
          e.preventDefault();
          deleteClipRef.current(sel);
        }
      } else if (e.key === "Escape") {
        setSelectedClipId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const vocalTrack = tracks.find((t) => t.type === "vocal");

  const rapTakeTarget = useMemo(() => {
    const sel = selectedClipId ? clips.find((c) => c.id === selectedClipId) : null;
    if (sel?.recordingId && sel.recordingId !== "live") {
      return {
        clipId: sel.id,
        recordingId: sel.recordingId,
        sessionId: sel.sessionId,
        trackId: sel.trackId,
        label: sel.name,
      };
    }
    if (lastRecordingFile) {
      const clip = clips.find((c) => c.recordingId === lastRecordingFile.id);
      return {
        clipId: clip?.id,
        recordingId: lastRecordingFile.id,
        sessionId: lastRecordingFile.sessionId,
        trackId: clip?.trackId ?? vocalTrack?.id,
        label: clip?.name ?? "Last recording",
      };
    }
    const vocalClip = [...clips]
      .reverse()
      .find((c) => {
        const tr = tracks.find((t) => t.id === c.trackId);
        return tr?.type === "vocal" && c.recordingId && c.recordingId !== "live";
      });
    if (vocalClip) {
      return {
        clipId: vocalClip.id,
        recordingId: vocalClip.recordingId,
        sessionId: vocalClip.sessionId,
        trackId: vocalClip.trackId,
        label: vocalClip.name,
      };
    }
    return null;
  }, [clips, selectedClipId, lastRecordingFile, tracks, vocalTrack?.id]);

  const timelineClips: TimelineClip[] = useMemo(
    () =>
      clips.map((c) => ({
        id: c.id,
        trackId: c.trackId,
        name: c.name,
        startBar: c.startBar,
        durationBars: barsFromDuration(c.durationSec, bpm),
        color: c.color,
        waveformPeaks: c.waveformPeaks,
      })),
    [clips, bpm],
  );

  const getPlayheadBar = useCallback(() => {
    const engine = engineRef.current;
    if (engine?.isPlaying()) return engine.currentBar() + 1;
    return transport.bar;
  }, [transport.bar]);

  const durationBars = useMemo(() => {
    const fromClips = timelineClips.reduce((m, c) => Math.max(m, c.startBar + c.durationBars), 32);
    return Math.max(32, Math.ceil(fromClips + 4));
  }, [timelineClips]);

  const onUpdateTrack = useCallback((id: string, updates: Partial<MixerTrack>) => {
    setTracks((t) => t.map((x) => (x.id === id ? { ...x, ...updates } : x)));
  }, []);

  const ensureEngine = () => {
    if (!engineRef.current) engineRef.current = new StudioEngine();
    return engineRef.current;
  };

  const onPlay = async () => {
    const engine = ensureEngine();
    if (engine.isPlaying()) {
      engine.pause();
      setTransport((t) => ({ ...t, playing: false, bar: Math.floor(engine.currentBar()) + 1 }));
      return;
    }
    if (clipsRef.current.length === 0) {
      setPlayHint("Record or drop audio onto a track first — then Play will audition timeline clips.");
      setVocalDockOpen(true);
      return;
    }
    setPlayHint("");
    const startBar = Math.max(0, transport.bar - 1);
    await engine.play({
      bpm,
      startBar,
      clips: clipsRef.current,
      tracks: tracksRef.current,
      onBar: (bar, beat) => {
        setTransport((t) => ({ ...t, playing: true, bar, beat }));
        // Play piano roll notes at the current beat
        if (pianoNotes.length > 0 && synthRef.current) {
          const stepsPerBeat = 4;
          const currentStep = (bar - 1) * 4 * stepsPerBeat + (beat - 1) * stepsPerBeat;
          const note = pianoNotes.find((n) => Math.floor(n.start) === Math.floor(currentStep));
          if (note) {
            synthRef.current.noteOn(note.midi ?? 60, note.velocity ?? 100, `play-${note.id}`);
            const durSec = note.duration * 60 / bpm / stepsPerBeat;
            setTimeout(() => synthRef.current?.noteOff(note.midi ?? 60, `play-${note.id}`), durSec * 1000);
          }
        }
      },
    });
    setTransport((t) => ({ ...t, playing: true }));
  };

  const onStop = () => {
    ensureEngine().stop();
    synthRef.current?.disconnect();
    synthRef.current = null;
    setTransport((t) => ({ ...t, playing: false, bar: 1, beat: 0 }));
  };

  /** Seek playhead to a 0-based bar. Continues playback from the new position if already playing. */
  const onSeekBar = useCallback(
    async (barZero: number) => {
      const bar = Math.max(0, Math.floor(barZero));
      const engine = ensureEngine();
      const wasPlaying = engine.isPlaying();
      if (wasPlaying) {
        engine.pause();
      }
      setTransport((t) => ({ ...t, playing: false, bar: bar + 1, beat: 0 }));
      if (!wasPlaying || clipsRef.current.length === 0) return;
      setPlayHint("");
      await engine.play({
        bpm,
        startBar: bar,
        clips: clipsRef.current,
        tracks: tracksRef.current,
        onBar: (b, beat) => {
          setTransport((t) => ({ ...t, playing: true, bar: b, beat }));
        },
      });
      setTransport((t) => ({ ...t, playing: true, bar: bar + 1, beat: 0 }));
    },
    [bpm],
  );

  const onRecord = () => {
    const armed = tracks.find((t) => t.id === selectedTrackId) ?? vocalTrack;
    if (armed) setSelectedTrackId(armed.id);
    setVocalDockOpen(true);
    // Transport rolls with the take; the live clip appears at the playhead.
    recorderRef.current?.toggleRecord();
  };
  onPlayRef.current = () => void onPlay();
  onRecordRef.current = onRecord;
  onStopRef.current = onStop;
  onSeekBarRef.current = (bar) => void onSeekBar(bar);
  undoRef.current = undo;
  redoRef.current = redo;
  // MIDI keyboard input — map QWERTY keys to piano roll notes
  // QWERTY mapping: Q=C4, 2=C#4, W=D4, 3=D#4, E=E4, R=F4, 5=F#4, T=G4, 6=G#4, Y=A4, 7=A#4, U=B4, I=C5
  const keyToMidi: Record<string, number> = {
    KeyQ: 60, // C4
    Key2: 61, // C#4
    KeyW: 62, // D4
    Key3: 63, // D#4
    KeyE: 64, // E4
    KeyR: 65, // F4
    Key5: 66, // F#4
    KeyT: 67, // G4
    Key6: 68, // G#4
    KeyY: 69, // A4
    Key7: 70, // A#4
    KeyU: 71, // B4
    KeyI: 72, // C5
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const midi = keyToMidi[e.code];
      if (midi && synthRef.current) {
        synthRef.current.noteOn(midi, 100, `keyboard-${midi}`);
        setTimeout(() => synthRef.current?.noteOff(midi, `keyboard-${midi}`), 400);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [synthRef.current]);

  const onClipMove = useCallback(
    (clipId: string, newTrackId: string, newStartBar: number) => {
      pushHistory("move");
      setClips((prev) =>
        prev.map((c) =>
          c.id === clipId ? { ...c, trackId: newTrackId, startBar: Math.max(0, newStartBar) } : c,
        ),
      );
    },
    [pushHistory],
  );

  const onClipResize = useCallback(
    (clipId: string, newDurationBars: number) => {
      pushHistory("resize");
      const barSec = (60 / bpm) * 4;
      setClips((prev) =>
        prev.map((c) => (c.id === clipId ? { ...c, durationSec: Math.max(0.25, newDurationBars) * barSec } : c)),
      );
    },
    [bpm, pushHistory],
  );

  const onDeleteClip = useCallback(
    (clipId: string) => {
      pushHistory("delete");
      setClips((prev) => prev.filter((c) => c.id !== clipId));
      setSelectedClipId((cur) => (cur === clipId ? null : cur));
    },
    [pushHistory],
  );
  deleteClipRef.current = onDeleteClip;

  const onDuplicateClip = useCallback(
    (clipId: string) => {
      pushHistory("duplicate");
      const barSec = (60 / bpm) * 4;
      setClips((prev) => {
        const src = prev.find((c) => c.id === clipId);
        if (!src) return prev;
        const durBars = Math.max(1, Math.round(src.durationSec / barSec));
        return [
          ...prev,
          {
            ...src,
            id: `clip-dup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            startBar: src.startBar + durBars,
          },
        ];
      });
    },
    [bpm, pushHistory],
  );

  const onSplitClip = useCallback(
    (clipId: string, atBar: number) => {
      pushHistory("split");
      const barSec = (60 / bpm) * 4;
      setClips((prev) => {
        const idx = prev.findIndex((c) => c.id === clipId);
        if (idx < 0) return prev;
        const c = prev[idx];
        const cutSec = atBar * barSec - c.startBar * barSec;
        if (cutSec <= 0.05 || cutSec >= c.durationSec - 0.05) return prev;
        const left = { ...c, durationSec: cutSec };
        const right: StudioClip = {
          ...c,
          id: `clip-split-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          startBar: atBar,
          durationSec: c.durationSec - cutSec,
          waveformPeaks: c.waveformPeaks
            ? c.waveformPeaks.slice(Math.floor((cutSec / c.durationSec) * c.waveformPeaks.length))
            : undefined,
        };
        return [...prev.slice(0, idx), left, right, ...prev.slice(idx + 1)];
      });
    },
    [bpm, pushHistory],
  );

  const onRenameClip = useCallback(
    (clipId: string, name: string) => {
      pushHistory("rename");
      setClips((prev) => prev.map((c) => (c.id === clipId ? { ...c, name } : c)));
    },
    [pushHistory],
  );

  const onRenderClipAudio = useCallback(
    async (clipId: string) => {
      const engine = engineRef.current;
      const clip = clipsRef.current.find((c) => c.id === clipId);
      if (!engine || !clip || exporting) return;
      try {
        setExporting(true);
        const barSec = (60 / bpm) * 4;
        const endBar = clip.startBar + Math.max(1, Math.ceil(clip.durationSec / barSec));
        const buf = await engine.renderMix({
          bpm,
          clips: [clip],
          tracks: tracksRef.current,
          rangeBars: { startBar: clip.startBar, endBar },
          tailSec: 0.4,
        });
        downloadBlob(encodeWav(buf, 24), `${clip.name.replace(/[^a-z0-9_-]+/gi, "_") || "clip"}.wav`);
      } catch (e) {
        console.error("clip render failed", e);
        window.alert("Failed to render this clip as audio.");
      } finally {
        setExporting(false);
      }
    },
    [bpm, exporting],
  );

  const onRenameTrackName = useCallback(
    (trackId: string, name: string) => onUpdateTrack(trackId, { name }),
    [onUpdateTrack],
  );

  const onDeleteTrackWithClips = useCallback(
    (trackId: string) => {
    if (!window.confirm("Delete this track and every clip on it?")) return;
    pushHistory("track-delete");
    if (tracksRef.current.length <= 1) {
      window.alert("The mixer needs at least one track.");
      return;
    }
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    setClips((prev) => prev.filter((c) => c.trackId !== trackId));
    },
    [pushHistory],
  );

  const onToggleMetronome = useCallback(() => {
    setMetronomeOn((prev) => {
      const next = !prev;
      ensureEngine().setMetronome(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedAutomation: AutomationPoint[] = automation[selectedTrackId] ?? [];
  const onUpdateSelectedAutomation = useCallback(
    (points: AutomationPoint[]) => {
      setAutomation((prev) => ({ ...prev, [selectedTrackId]: points }));
    },
    [selectedTrackId],
  );

  const handleExport = async (options: {
    format: string;
    sampleRate: number;
    bitDepth: number;
    stemExport: boolean;
    normalize: boolean;
    fileNameTemplate: string;
  }) => {
    if (exporting) return;
    setExporting(true);
    const sessionName = sessionIdRef.current
      ? `session-${sessionIdRef.current.slice(0, 8)}`
      : "calliope-session";
    try {
      const engine = ensureEngine();
      const renderOpts = {
        bpm,
        clips: clipsRef.current,
        tracks: tracksRef.current,
        tailSec: 2.5,
        targetSampleRate: options.sampleRate,
      };
      let rendered = await engine.renderMix(renderOpts);
      if (options.normalize && rendered.length > 0) {
        let peak = 0;
        for (let c = 0; c < rendered.numberOfChannels; c++) {
          const data = rendered.getChannelData(c);
          for (let i = 0; i < data.length; i++) {
            const a = Math.abs(data[i]);
            if (a > peak) peak = a;
          }
        }
        if (peak > 0 && Math.abs(peak - 1) > 1e-3) {
          // Re-render through a normalized master fader.
          const gainDb = -20 * Math.log10(peak);
          engine.setMasterChannel({ ...masterCh, volumeDb: masterCh.volumeDb + gainDb });
          rendered = await engine.renderMix(renderOpts);
          engine.setMasterChannel(masterCh);
        }
      }
      const depth = options.bitDepth === 16 || options.bitDepth === 24 ? options.bitDepth : 24;
      const baseName = (options.fileNameTemplate || "{session}_mixdown").replace("{session}", sessionName);

      if (options.stemExport) {
        // One WAV per track that actually has clips, plus the mixdown.
        const stemTracks = tracksRef.current.filter((t) =>
          clipsRef.current.some((c) => c.trackId === t.id),
        );
        downloadBlob(encodeWav(rendered, depth), `${baseName}.wav`);
        for (const t of stemTracks) {
          const stem = await engine.renderMix({ ...renderOpts, onlyTrackId: t.id });
          const safeName = t.name.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();
          downloadBlob(encodeWav(stem, depth), `${baseName}_${safeName}.wav`);
        }
        setPlayHint(`Exported ${baseName}.wav + ${stemTracks.length} stem(s) (${depth}-bit PCM @ ${options.sampleRate} Hz)`);
      } else {
        downloadBlob(encodeWav(rendered, depth), `${baseName}.wav`);
        setPlayHint(`Exported ${baseName}.wav (${depth}-bit PCM @ ${options.sampleRate} Hz)`);
      }
      setExportOpen(false);
    } catch (err) {
      console.error("Export failed", err);
      setPlayHint(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExporting(false);
    }
  };

  const onRecordingStateChange = useCallback((recording: boolean) => {
    setTransport((t) =>
      t.recording === recording && t.armed ? t : { ...t, recording, armed: true },
    );
    if (recording) {
      // Roll the transport with the take and grow a live clip in real time.
      const engine = ensureEngine();
      if (!engine.isPlaying()) void onPlayRef.current();
      const trackId =
        selectedTrackIdRef.current ||
        tracksRef.current.find((t) => t.type === "vocal")?.id ||
        tracksRef.current[0]?.id ||
        "1";
      const track = tracksRef.current.find((t) => t.id === trackId);
      const engineBar = engine.isPlaying()
        ? engine.currentBar() + 1
        : transportRef.current.bar;
      const bar = Math.max(0, Math.floor(engineBar));
      liveStartRef.current = { bar, atMs: performance.now() };
      setClips((prev) => [
        ...prev.filter((c) => c.id !== LIVE_CLIP_ID),
        {
          id: LIVE_CLIP_ID,
          trackId,
          sessionId: sessionIdRef.current ?? "live",
          recordingId: "live",
          name: "● Recording…",
          startBar: bar,
          durationSec: 0.2,
          color: "#ff5252",
        },
      ]);
      if (liveGrowRef.current == null) {
        liveGrowRef.current = window.setInterval(() => {
          const s = liveStartRef.current;
          if (!s) return;
          const sec = (performance.now() - s.atMs) / 1000;
          setClips((prev) =>
            prev.map((c) =>
              c.id === LIVE_CLIP_ID
                ? { ...c, durationSec: sec, color: track?.color ?? "#ff5252" }
                : c,
            ),
          );
        }, 250);
      }
    } else if (liveGrowRef.current != null) {
      window.clearInterval(liveGrowRef.current);
      liveGrowRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (liveGrowRef.current != null) window.clearInterval(liveGrowRef.current);
    };
  }, []);

  const placeClipFromFile = useCallback(
    (file: RecordingFile, sessionId: string, trackId: string, startBar: number, durationHint?: number) => {
      if (!file.id.startsWith("clip-")) pushHistory("place");
      sessionIdRef.current = sessionId;
      const track = tracksRef.current.find((t) => t.id === trackId);
      const durationSec = file.duration_sec > 0 ? file.duration_sec : durationHint ?? 1;
      const clip: StudioClip = {
        id: `clip-${file.id}-${Date.now()}`,
        trackId,
        sessionId,
        recordingId: file.id,
        name: file.original_name || file.filename,
        startBar,
        durationSec,
        color: track?.color ?? "#3dd68c",
      };
      setClips((prev) => [...prev, clip]);
      void ensureEngine()
        .loadClip(clip)
        .then(() => {
          const peaks = engineRef.current?.getClipPeaks(clip.sessionId, clip.recordingId);
          if (peaks) {
            setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, waveformPeaks: peaks } : c)));
          }
        });
    },
    [pushHistory],
  );

  const replaceClipAudio = useCallback(
    async (
      clipId: string,
      newRecordingId: string,
      sessionId: string,
      name: string,
      durationSec: number,
    ) => {
      pushHistory("rap-take");
      let updated: StudioClip | null = null;
      setClips((prev) =>
        prev.map((c) => {
          if (c.id !== clipId) return c;
          updated = {
            ...c,
            sessionId,
            recordingId: newRecordingId,
            name,
            durationSec,
            waveformPeaks: undefined,
          };
          return updated;
        }),
      );
      if (!updated) return;
      await ensureEngine().loadClip(updated);
      const peaks = engineRef.current?.getClipPeaks(sessionId, newRecordingId);
      if (peaks) {
        setClips((prev) =>
          prev.map((c) => (c.id === clipId ? { ...c, waveformPeaks: peaks } : c)),
        );
      }
    },
    [pushHistory],
  );

  const processRapTake = useCallback(async (): Promise<CommitRapTakeResult | null> => {
    const target = rapTakeTarget;
    if (!target) return null;
    setRapPathStatus(null);
    const preset = VOCAL_PRESETS.dry_rap_punch;
    setVocalRack(preset);
    const result = await commitRapTake(target.sessionId, target.recordingId, preset, rapStyle);
    const name = `${target.label.replace(/\.[^.]+$/, "")} (autotuned).wav`;
    if (target.clipId) {
      await replaceClipAudio(
        target.clipId,
        result.recording_id,
        target.sessionId,
        name,
        result.duration_sec,
      );
    } else {
      const trackId = target.trackId ?? vocalTrack?.id;
      if (!trackId) throw new Error("No vocal track");
      placeClipFromFile(
        {
          id: result.recording_id,
          filename: result.filename,
          original_name: name,
          format: "wav",
          duration_sec: result.duration_sec,
          track_type: "vocal",
          uploaded_at: new Date().toISOString(),
        },
        target.sessionId,
        trackId,
        0,
        result.duration_sec,
      );
    }
    setLastRecordingFile({ id: result.recording_id, sessionId: target.sessionId });
    return result;
  }, [rapTakeTarget, rapStyle, replaceClipAudio, placeClipFromFile, vocalTrack?.id]);

  const addBeatToTimeline = useCallback(
    async (opts?: { bpm?: number; durationSec?: number }) => {
      const useBpm = opts?.bpm ?? bpm;
      const barSec = (60 / useBpm) * 4;
      const durationBars = opts?.durationSec
        ? Math.max(4, Math.min(64, Math.ceil(opts.durationSec / barSec)))
        : 16;
      const blob = await fetchGeneratedDrumsBlob(useBpm, durationBars, "hiphop");
      if (!sessionIdRef.current) {
        const s = await createRecordingSession(`Session ${new Date().toLocaleTimeString()}`);
        sessionIdRef.current = s.id;
      }
      const sessionId = sessionIdRef.current!;
      const file = new File([blob], "beat.wav", { type: "audio/wav" });
      const drumsTrack = tracksRef.current.find((t) => t.type === "drum") ?? tracksRef.current[0];
      if (!drumsTrack) throw new Error("No drums track");
      const result = await uploadRecordingFile(sessionId, file, "drum");
      const durationSec = result.duration_sec > 0 ? result.duration_sec : durationBars * barSec;
      pushHistory("beat");
      setClips((prev) => prev.filter((c) => !(c.trackId === drumsTrack.id && c.startBar === 0)));
      placeClipFromFile(
        {
          id: result.recording_id,
          filename: result.filename,
          original_name: "beat.wav",
          format: "wav",
          duration_sec: durationSec,
          track_type: "drum",
          uploaded_at: new Date().toISOString(),
        },
        sessionId,
        drumsTrack.id,
        0,
        durationSec,
      );
    },
    [bpm, placeClipFromFile, pushHistory],
  );

  const onMakeRapTake = useCallback(async () => {
    setRapPathBusy(true);
    setRapPathStatus(null);
    try {
      await processRapTake();
      setPlayHint("Autotuned rap take is on the timeline — hit Play, then Export.");
      setRapPathStatus("Autotuned take ready on timeline.");
    } catch (e) {
      setRapPathStatus(e instanceof Error ? e.message : String(e));
      if (String(e).includes("404") || String(e).includes("Session not found")) {
        setPlayHint("Session expired after server reload — record or import your vocal again.");
      }
    } finally {
      setRapPathBusy(false);
    }
  }, [processRapTake]);

  const onAddBeat = useCallback(async () => {
    setRapPathBusy(true);
    setRapPathStatus(null);
    try {
      await addBeatToTimeline();
      setPlayHint("Beat on Drums — play the timeline and Export when ready.");
      setRapPathStatus("Beat placed on Drums track.");
    } catch (e) {
      setRapPathStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setRapPathBusy(false);
    }
  }, [addBeatToTimeline]);

  const onMakeRapSong = useCallback(async () => {
    setRapPathBusy(true);
    setRapPathStatus(null);
    try {
      const result = await processRapTake();
      if (!result) return;
      const detected = result.detected_bpm;
      const conf = result.bpm_confidence ?? 0;
      const useBpm =
        detected != null && conf > 0.25 ? Math.round(Math.min(200, Math.max(60, detected))) : bpm;
      if (detected != null && conf > 0.25 && useBpm !== bpm) {
        setBpm(useBpm);
      }
      await addBeatToTimeline({ bpm: useBpm, durationSec: result.duration_sec });
      const bpmNote =
        detected != null && conf > 0.25 ? ` at ~${useBpm} BPM` : "";
      setPlayHint(`Rap song ready${bpmNote} — play the timeline and Export.`);
      setRapPathStatus(`Autotuned vocal + matched beat on timeline${bpmNote}.`);
    } catch (e) {
      setRapPathStatus(e instanceof Error ? e.message : String(e));
      if (String(e).includes("404") || String(e).includes("Session not found")) {
        setPlayHint("Session expired after server reload — record or import your vocal again.");
      }
    } finally {
      setRapPathBusy(false);
    }
  }, [processRapTake, addBeatToTimeline, bpm]);

  // Gestures → Studio: place the conducted take on an audio track at bar 1
  useEffect(() => {
    const incoming = takeGesturesStudioImport();
    if (!incoming) return;

    const audioTrack =
      tracksRef.current.find((t) => t.type === "lead") ??
      tracksRef.current.find((t) => t.type === "audio") ??
      tracksRef.current[2] ??
      tracksRef.current[0];
    if (!audioTrack) return;

    const file: RecordingFile = {
      id: incoming.recordingId,
      filename: incoming.name,
      original_name: incoming.name,
      format: "wav",
      duration_sec: incoming.durationSec,
      track_type: "audio",
      uploaded_at: new Date().toISOString(),
    };
    placeClipFromFile(file, incoming.sessionId, audioTrack.id, 0, incoming.durationSec);
    setSelectedTrackId(audioTrack.id);
    setPlayHint(`Imported from Gestures: ${incoming.scoreLabel ?? incoming.name}`);
  }, [placeClipFromFile]);

  // Instrument clip placement from PianoRoll selection
  const placeInstrumentClip = useCallback((midiNotes: PianoNote[], trackId: string, startBar: number, durationSec: number) => {
    if (!trackId) return;
    pushHistory("place");
    const track = tracksRef.current.find((t) => t.id === trackId);
    const clip: StudioClip = {
      id: `clip-piano-${Date.now()}`,
      trackId,
      sessionId: sessionIdRef.current ?? "",
      recordingId: "",
      name: `Piano Clip ${tracksRef.current.length + 1}`,
      startBar,
      durationSec,
      color: track?.color ?? "#3dd68c",
      clipType: "instrument" as const,
      midiNotes,
    };
    setClips((prev) => [...prev, clip]);
    void ensureEngine().preload([clip]);
  }, [pushHistory]);

  const onRecordingComplete = async (file: RecordingFile, sessionId: string, durationHint?: number) => {
    const trackId = selectedTrackId || vocalTrack?.id || tracksRef.current[0]?.id;
    if (!trackId) return;
    const startBar = liveStartRef.current?.bar ?? Math.max(0, transport.bar - 1);
    liveStartRef.current = null;
    setClips((prev) => prev.filter((c) => c.id !== LIVE_CLIP_ID));
    placeClipFromFile(file, sessionId, trackId, startBar, durationHint);
    setLastRecordingFile({ id: file.id, sessionId });
    setPlayHint("");
    // Decode the uploaded WAV for real-time DSP processing
    try {
      const resp = await fetch(`/v1/recordings/sessions/${sessionId}/files/${file.id}/download`);
      if (resp.ok) {
        const blob = await resp.blob();
        const audioCtx = new AudioContext();
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        setRecordedSamples(audioBuffer.getChannelData(0));
        setRecordedSampleRate(audioBuffer.sampleRate);
        audioCtx.close();
      }
    } catch (e) {
      console.warn("Could not decode recording for DSP preview:", e);
    }
  };

  const onTrackFileDropRef = useRef<
    ((trackId: string, file: File, startBar?: number) => Promise<void>) | null
  >(null);

  const onImportFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const barSec = (60 / bpm) * 4;
      let nextBar = clipsRef.current.reduce(
        (m, c) => Math.max(m, c.startBar + Math.ceil(c.durationSec / barSec)),
        0,
      );
      const target =
        tracksRef.current.find((t) => t.type !== "vocal") ?? tracksRef.current[0];
      if (!target) return;
      for (const file of Array.from(files)) {
        try {
          await onTrackFileDropRef.current?.(target.id, file, nextBar);
          nextBar += 8; // stagger until the real duration is known
        } catch (e) {
          console.error("import failed", file.name, e);
        }
      }
    },
    [bpm],
  );

  const onTrackFileDrop = useCallback(
    async (trackId: string, file: File, startBar?: number) => {
      try {
        if (!sessionIdRef.current) {
          const s = await createRecordingSession("Session " + new Date().toLocaleTimeString());
          sessionIdRef.current = s.id;
        }
        const track = tracksRef.current.find((t) => t.id === trackId);
        const result = await uploadRecordingFile(sessionIdRef.current!, file, track?.type ?? "audio");
        const newFile: RecordingFile = {
          id: result.recording_id,
          filename: result.filename,
          original_name: file.name,
          format: file.name.split(".").pop()?.toLowerCase() ?? "audio",
          duration_sec: result.duration_sec,
          track_type: track?.type ?? "audio",
          uploaded_at: new Date().toISOString(),
        };
        placeClipFromFile(newFile, sessionIdRef.current!, trackId, startBar ?? Math.max(0, transport.bar - 1));
      } catch (e) {
        console.error("Track drop upload failed:", e);
      }
    },
    [placeClipFromFile, transport.bar],
  );
  onTrackFileDropRef.current = onTrackFileDrop;

  const addTrack = (trackType: "audio" | "instrument" = "audio") => {
    const id = String(Date.now());
    const color = TRACK_COLORS[tracks.length % TRACK_COLORS.length];
    const track: MixerTrack = {
      id,
      name: trackType === "instrument" ? `Instrument ${tracks.length + 1}` : `Track ${tracks.length + 1}`,
      type: trackType,
      volume: -6,
      pan: 0,
      muted: false,
      solo: false,
      color,
    };
    setTracks((t) => [...t, track]);
    setSelectedTrackId(id);
  };

  async function onGeneratePlan() {
    setPlanBusy(true);
    setPlanOut("");
    setPlanMeta("");
    try {
      const res = await generatePlan(prompt, {
        provider,
        model: undefined,
        depth,
        genre: genre.trim() || undefined,
        bpm_hint: bpm,
        vocal_rack: vocalInject ? vocalRack : undefined,
      });
      setPlanOut(res.response);
      setPlanMeta(`${res.provider} · ${res.model}`);
      } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("TimeoutError") || msg.includes("aborted") || msg.includes("signal timed out")) {
        setPlanOut("Timed out waiting for local Ollama. Keep Ollama running, prefer gemma2:9b, and retry with a shorter brief.");
      } else {
        setPlanOut(msg);
      }
    } finally {
      setPlanBusy(false);
    }
  }

  async function runAnalyze() {
    setBusyA(true);
    setPipeAnalysis("");
    try {
      const r = await analyzeBrief(pipeText);
      setPipeAnalysis(JSON.stringify(r, null, 2));
    } catch (e) {
      setPipeAnalysis(String(e));
    } finally {
      setBusyA(false);
    }
  }

  async function runAamatiAlign() {
    setBusyM(true);
    setPipeAamati("");
    try {
      const r = await alignAamati(pipeText);
      setPipeAamati(JSON.stringify(r, null, 2));
    } catch (e) {
      setPipeAamati(String(e));
    } finally {
      setBusyM(false);
    }
  }

  async function runComposeAb() {
    setBusyC(true);
    setPipeLocked(null);
    setPipeFree(null);
    try {
      const [a, b] = await Promise.all([composeFromAamati(pipeText, true), composeFromAamati(pipeText, false)]);
      setPipeLocked(a);
      setPipeFree(b);
      setBpm(a.steer.bpm);
    } catch (e) {
      setPipeAamati(String(e));
    } finally {
      setBusyC(false);
    }
  }

  async function runFullGenerate() {
    setBusyG(true);
    setPipePlan("");
    setPipeMeta("");
    try {
      const r = await generatePlan(pipeText, { depth: pipeDepth, provider: "ollama" });
      setPipePlan(r.response);
      setPipeMeta(`${r.provider} · ${r.model}`);
    } catch (e) {
      setPipePlan(String(e));
    } finally {
      setBusyG(false);
    }
  }

  const readTrackMeter = useCallback(
    (trackId: string) => engineRef.current?.readTrackMeter(trackId) ?? { peak: 0, rms: 0 },
    [],
  );

  return (
    <div className="daw">
      {!booted && <SplashIntro onDone={() => setBooted(true)} />}
      <header className="daw__toolbar">
        <span className="daw-toolbar__brand">
          <strong>CALLIOPE</strong> Studio
        </span>
        <StudioTransport
          bpm={bpm}
          onBpmChange={setBpm}
          transport={transport}
          onPlay={() => void onPlay()}
          onStop={onStop}
          onRecord={onRecord}
          metronomeOn={metronomeOn}
          onToggleMetronome={onToggleMetronome}
          getPlayheadBar={getPlayheadBar}
        />
        {playHint && <span className="daw-toolbar__hint">{playHint}</span>}
        {transport.recording && (
          <span className="daw-recscope-wrap">
            <span className="daw-recscope-badge">REC</span>
            <LiveRecScope getAnalyser={() => recorderRef.current?.getAnalyser?.() ?? null} />
          </span>
        )}
        <span className="daw-toolbar__spacer" />
        <button
          type="button"
          className="daw-toolbar__mode"
          onClick={() => importInputRef.current?.click()}
          title="Import audio files"
        >
          <FolderOpen size={14} />
          Import
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.webm"
          multiple
          hidden
          onChange={(e) => {
            void onImportFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="daw-toolbar__mode"
          onClick={undo}
          disabled={hist.past === 0}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          className="daw-toolbar__mode"
          onClick={redo}
          disabled={hist.future === 0}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          <Redo2 size={14} />
        </button>
        <button type="button" className="daw-toolbar__mode" onClick={newSession} title="New session">
          <FilePlus2 size={14} />
          New
        </button>
        {savedAt != null && (
          <span className="daw-toolbar__saved" title="Project autosaved locally">
            saved {new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <button
          type="button"
          className="daw-toolbar__mode"
          onClick={() => setExportOpen(true)}
          disabled={clips.length === 0}
          title="Export mixdown (E)"
        >
          <Download size={14} />
          Export
        </button>
        <button
          type="button"
          className="daw-toolbar__mode"
          onClick={() => setShortcutsOpen(true)}
          title="Keyboard shortcuts (?)"
        >
          <Keyboard size={14} />
        </button>
        <div className="daw-toolbar__modes">
          <button
            type="button"
            className={`daw-toolbar__mode${viewMode === "arrange" ? " is-active" : ""}`}
            onClick={() => setViewMode("arrange")}
          >
            Arrange
          </button>
          <button
            type="button"
            className={`daw-toolbar__mode${viewMode === "edit" ? " is-active" : ""}`}
            onClick={() => setViewMode("edit")}
          >
            Edit
          </button>
        </div>
      </header>

      <div
        className={`daw__workspace${tracksOpen ? "" : " is-tracks-collapsed"}${inspectorOpen ? "" : " is-inspector-collapsed"}`}
      >
        <aside className={`daw-tracks${tracksOpen ? "" : " is-collapsed"}`}>
          <div className="daw-tracks__head">
            <button
              type="button"
              className="daw-tracks__collapse"
              onClick={() => setTracksOpen((o) => !o)}
              title={tracksOpen ? "Collapse tracks" : "Expand tracks"}
              aria-expanded={tracksOpen}
            >
              {tracksOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>
            {tracksOpen && (
              <>
                <span>Tracks</span>
                <div className="daw-tracks__head-actions" style={{ display: "flex", gap: 2 }}>
                  <button type="button" className="daw-tracks__add" onClick={() => addTrack("audio")} title="Add audio track">
                    <Plus size={14} />
                    Audio
                  </button>
                  <button type="button" className="daw-tracks__add" onClick={() => addTrack("instrument")} title="Add instrument track" style={{ background: "var(--daw-accent)", color: "#fff" }}>
                    <Music size={14} />
                    MIDI
                  </button>
                </div>
              </>
            )}
            {!tracksOpen && <span>Tracks</span>}
          </div>
          {tracksOpen && (
          <div className="daw-tracks__list">
            {tracks.map((track) => (
              <div
                key={track.id}
                role="button"
                tabIndex={0}
                className={`daw-track-row${selectedTrackId === track.id ? " is-selected" : ""}`}
                onClick={() => setSelectedTrackId(track.id)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedTrackId(track.id)}
              >
                <span className="daw-track-row__swatch" style={{ background: track.color }} />
                <div className="daw-track-row__info">
                  <div className="daw-track-row__name">{track.name}</div>
                  <div className="daw-track-row__type">{track.type}</div>
                </div>
                <button
                  type="button"
                  className={`daw-track-row__arm${
                    selectedTrackId === track.id && transport.armed ? " is-armed" : ""
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTrackId(track.id);
                    setTransport((t) => ({ ...t, armed: true }));
                    setVocalDockOpen(true);
                  }}
                  title="Arm track for record"
                >
                  R
                </button>
              </div>
            ))}
          </div>
          )}
        </aside>

        <div className="daw-center">
          <div className="daw-arrange">
            {viewMode === "edit" ? (
              <ArrangementEditor
                tracks={tracks.map((t) => ({ ...t, height: 72 }))}
                clips={clips.map(
                  (c): ArrangementClip => ({
                    id: c.id,
                    trackId: c.trackId,
                    name: c.name,
                    startBar: c.startBar,
                    duration: barsFromDuration(c.durationSec, bpm),
                    color: c.color,
                    type: "audio",
                    waveformPeaks: c.waveformPeaks,
                  }),
                )}
                sections={sections}
                isPlaying={transport.playing}
                currentPosition={transport.bar - 1}
                getPlayheadBar={getPlayheadBar}
                zoom={zoom}
                onZoomChange={setZoom}
                onClipMove={onClipMove}
                onClipResize={onClipResize}
                onSectionChange={setSections}
                onDeleteClip={onDeleteClip}
                onDuplicateClip={onDuplicateClip}
                onSplitClip={onSplitClip}
                onRenameClip={onRenameClip}
                onRenderClip={onRenderClipAudio}
                onTrackColorChange={(trackId, color) => {
                  pushHistory("color");
                  onUpdateTrack(trackId, { color });
                }}
                onSeek={(bar) => void onSeekBar(bar)}
              />
            ) : (
              <TimelineView
                bpm={bpm}
                durationBars={durationBars}
                sections={sections}
                tracks={tracks}
                selectedTrackId={selectedTrackId}
                playheadBar={transport.bar}
                isPlaying={transport.playing}
                getPlayheadBar={getPlayheadBar}
                clips={timelineClips}
                onFileDrop={(trackId, file) => void onTrackFileDrop(trackId, file)}
                onSelectClip={setSelectedClipId}
                selectedClipId={selectedClipId}
                onSeek={(bar) => void onSeekBar(bar)}
              />
            )}
          </div>

          {viewMode === "edit" && (
            <div className={`daw-automation${automationOpen ? "" : " is-collapsed"}`}>
              <div className="daw-automation__head">
                <span>Automation</span>
                <button
                  type="button"
                  className="daw-automation__collapse"
                  onClick={() => setAutomationOpen((o) => !o)}
                  title={automationOpen ? "Collapse automation" : "Expand automation"}
                  aria-expanded={automationOpen}
                >
                  {automationOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
              </div>
              {automationOpen && (
                <div className="daw-automation__body">
                  <AutomationLane
                    track={{
                      name: `${tracks.find((t) => t.id === selectedTrackId)?.name ?? "Track"} · volume`,
                      points: selectedAutomation,
                      min_value: 0,
                      max_value: 1,
                    }}
                    onChange={onUpdateSelectedAutomation}
                    durationMs={durationBars * ((60 / bpm) * 4) * 1000}
                    height={150}
                  />
                </div>
              )}
            </div>
          )}

          <div className={`daw-vocal-dock${vocalDockOpen ? "" : " is-collapsed"}`}>
            <div
              className="daw-vocal-dock__head"
              onClick={() => setVocalDockOpen((o) => !o)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setVocalDockOpen((o) => !o)}
            >
              <h3>
                <Mic size={14} />
                Input · {tracks.find((t) => t.id === selectedTrackId)?.name ?? vocalTrack?.name ?? "Track"}
              </h3>
              {vocalDockOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </div>
            {vocalDockOpen && (
              <div className="daw-vocal-dock__body">
                <AudioRecorder
                  ref={recorderRef}
                  variant="daw"
                  onRecordingComplete={(file, sessionId, durationHint) =>
                    onRecordingComplete(file, sessionId, durationHint)
                  }
                  onRecordingStateChange={onRecordingStateChange}
                />
              </div>
            )}
          </div>
        </div>

        <aside className={`daw-inspector${inspectorOpen ? "" : " is-collapsed"}`}>
          <button
            type="button"
            className="daw-inspector__rail"
            onClick={() => setInspectorOpen(true)}
            title="Expand inspector"
          >
            Inspector
          </button>
          <div className="daw-inspector__tabs">
            <button
              type="button"
              className="daw-inspector__collapse"
              onClick={() => setInspectorOpen(false)}
              title="Collapse inspector"
              aria-expanded={inspectorOpen}
            >
              <ChevronRight size={14} />
            </button>
            {(
              [
                ["vocal", "Vocal"],
                ["fx", "FX"],
                ["ai", "AI"],
                ["pipeline", "Pipeline"],
                ["instrument", "Keys"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`daw-inspector__tab${inspectorTab === id ? " is-active" : ""}`}
                onClick={() => setInspectorTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="daw-inspector__content">
            {inspectorTab === "vocal" && (
              <>
                <RapSongPathPanel
                  targetLabel={rapTakeTarget?.label ?? null}
                  canProcess={rapTakeTarget != null}
                  busy={rapPathBusy}
                  status={rapPathStatus}
                  style={rapStyle}
                  onStyleChange={setRapStyle}
                  onMakeRapSong={() => void onMakeRapSong()}
                  onMakeRapTake={() => void onMakeRapTake()}
                  onAddBeat={() => void onAddBeat()}
                />
                <VocalRackPanel
                  value={vocalRack}
                  onChange={setVocalRack}
                  injectEnabled={vocalInject}
                  onInjectChange={setVocalInject}
                />
                <div style={{ marginTop: "0.75rem" }}>
                  <VoiceDspPanel
                    rack={vocalRack}
                    sampleRate={recordedSampleRate}
                    recordedSamples={recordedSamples ?? undefined}
                    recordedSampleRate={recordedSampleRate}
                    lastRecordingFile={lastRecordingFile}
                  />
                </div>
              </>
            )}
            {inspectorTab === "fx" && (
              (() => {
                const selClip = clips.find((c) => c.id === selectedClipId);
                const scopeTrackId = selClip?.trackId ?? null;
                const scopeChain = scopeTrackId ? trackPlugins[scopeTrackId] ?? [] : pluginChain;
                const scopeName = scopeTrackId ? tracks.find((t) => t.id === scopeTrackId)?.name : null;
                return (
                  <div>
                    <p className="daw-inspector__scope">
                      {scopeName
                        ? `Insert FX · ${scopeName} — "${selClip?.name.replace(/\.[^.]+$/, "") ?? ""}"`
                        : "Master FX — click a clip to edit that track's inserts"}
                    </p>
                    <PluginChainEditor
                      chain={scopeChain}
                      onChange={(next) => {
                        if (scopeTrackId) setTrackPlugins((prev) => ({ ...prev, [scopeTrackId]: next }));
                        else setPluginChain(next);
                      }}
                      onBypass={() => {
                        if (scopeTrackId) {
                          setTrackPlugins((prev) => ({
                            ...prev,
                            [scopeTrackId]: (prev[scopeTrackId] ?? []).map((p) => ({ ...p, enabled: false })),
                          }));
                        } else {
                          setPluginChain((c) => c.map((p) => ({ ...p, enabled: false })));
                        }
                      }}
                    />
                  </div>
                );
              })()
            )}
            {inspectorTab === "ai" && (
              <div className="daw-ai-tab">
                <VocalAIPanel />
                <details className="daw-ai-tab__composer">
                  <summary>LLM Composer</summary>
                  <div className="daw-architect">
                    <div>
                      <label>Brief</label>
                      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <select value={provider} onChange={(e) => setProvider(e.target.value as RouterProvider)} style={{ flex: 1 }}>
                        {PROVIDERS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                      <input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Genre" style={{ flex: 1 }} />
                    </div>
                    <button type="button" className="daw-architect__run" disabled={planBusy} onClick={() => void onGeneratePlan()}>
                      {planBusy ? "Generating…" : "Generate plan"}
                    </button>
                    {planMeta && <p className="daw-architect__meta">{planMeta}</p>}
                    {planOut && <LlmOutput text={planOut} compact />}
                  </div>
                </details>
              </div>
            )}
            {inspectorTab === "pipeline" && (
              <div className="daw-pipeline">
                <div className="daw-pipeline__intro">
                  <GitBranch size={14} />
                  Embedded pipeline — analyze → Aamati → lock knobs → LLM
                </div>
                <div>
                  <label>Brief</label>
                  <textarea value={pipeText} onChange={(e) => setPipeText(e.target.value)} rows={4} />
                </div>
                <div>
                  <label>Depth</label>
                  <select value={pipeDepth} onChange={(e) => setPipeDepth(e.target.value as GenerateDepth)}>
                    <option value="standard">standard</option>
                    <option value="deep">deep</option>
                  </select>
                </div>
                <div className="daw-pipeline__actions">
                  <button type="button" disabled={busyA} onClick={() => void runAnalyze()}>
                    <Cpu size={14} />
                    {busyA ? "…" : "Analyze"}
                  </button>
                  <button type="button" disabled={busyM} onClick={() => void runAamatiAlign()}>
                    {busyM ? "…" : "Aamati"}
                  </button>
                  <button type="button" disabled={busyC} onClick={() => void runComposeAb()}>
                    {busyC ? "…" : "A/B compose"}
                  </button>
                  <button type="button" className="is-primary" disabled={busyG} onClick={() => void runFullGenerate()}>
                    {busyG ? "…" : "Full LLM"}
                  </button>
                </div>
                {pipeMeta && <p className="daw-architect__meta">{pipeMeta}</p>}
                {pipeAnalysis && <pre className="daw-architect__out">{pipeAnalysis}</pre>}
                {pipeAamati && <pre className="daw-architect__out">{pipeAamati}</pre>}
                {(pipeLocked || pipeFree) && (
                  <div className="aamati-steer-row aamati-steer-row--daw">
                    {pipeLocked && <AamatiSteerCard title="Aamati-locked" result={pipeLocked} />}
                    {pipeFree && <AamatiSteerCard title="Brief-only" result={pipeFree} />}
                  </div>
                )}
                {pipePlan && <LlmOutput text={pipePlan} compact />}
              </div>
            )}
            {inspectorTab === "instrument" && (
              <InstrumentTab
                synthConfig={synthConfig}
                setSynthConfig={setSynthConfig}
                synthRef={synthRef}
                pianoNotes={pianoNotes}
                setPianoNotes={setPianoNotes}
                seqPattern={seqPattern}
                setSeqPattern={setSeqPattern}
                transport={transport}
              />
            )}
          </div>
        </aside>
      </div>

      <div className={`daw__mixer-wrap${mixerOpen ? "" : " is-collapsed"}`}>
        <button
          type="button"
          className="daw-mixer-collapse"
          onClick={() => setMixerOpen((o) => !o)}
          title={mixerOpen ? "Collapse mixer" : "Expand mixer"}
          aria-expanded={mixerOpen}
        >
          {mixerOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        {mixerOpen && (
          <>
        <MixerConsole
          tracks={tracks}
          onUpdateTrack={onUpdateTrack}
          onRenameTrack={onRenameTrackName}
          onDeleteTrack={onDeleteTrackWithClips}
          readMeter={readTrackMeter}
        />
        <MasterBus
          masterChannel={{
            volume: masterCh.volumeDb,
            pan: 0,
            muted: masterCh.muted,
            eqLow: { freq: masterCh.eqLow.freq, gain: masterCh.eqLow.gain },
            eqMid: { freq: masterCh.eqMid.freq, gain: masterCh.eqMid.gain, q: masterCh.eqMid.q },
            eqHigh: { freq: masterCh.eqHigh.freq, gain: masterCh.eqHigh.gain },
            compressor: {
              threshold: masterCh.compressor.threshold,
              ratio: masterCh.compressor.ratio,
              makeup: masterCh.compressor.makeup,
              attack: masterCh.compressor.attack,
              release: masterCh.compressor.release,
            },
            limiter: { threshold: masterCh.limiter.threshold, ceiling: masterCh.limiter.ceiling },
            outputMode: "stereo",
            sampleRate: 48000,
            dithering: false,
          }}
          onUpdate={(updates) =>
            setMasterCh((m) => ({
              ...m,
              volumeDb: updates.volume ?? m.volumeDb,
              muted: updates.muted ?? m.muted,
              eqLow: updates.eqLow ? { ...m.eqLow, ...updates.eqLow } : m.eqLow,
              eqMid: updates.eqMid ? { ...m.eqMid, ...updates.eqMid } : m.eqMid,
              eqHigh: updates.eqHigh ? { ...m.eqHigh, ...updates.eqHigh } : m.eqHigh,
              compressor: updates.compressor ? { ...m.compressor, ...updates.compressor } : m.compressor,
              limiter: updates.limiter ? { ...m.limiter, ...updates.limiter } : m.limiter,
            }))
          }
          metering={{
            integrated: 20 * Math.log10(Math.max(1e-4, meter.rms)),
            shortTerm: 20 * Math.log10(Math.max(1e-4, meter.rms)),
            momentary: 20 * Math.log10(Math.max(1e-4, meter.rms)),
            correlation: 1,
            peak: 20 * Math.log10(Math.max(1e-4, meter.peak)),
          }}
        />
          </>
        )}
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => !exporting && setExportOpen(false)}
        onExport={(options) => void handleExport(options)}
        sessionName={sessionIdRef.current ? `session-${sessionIdRef.current.slice(0, 8)}` : "calliope-session"}
        trackCount={tracks.length}
        duration={durationBars * (60 / bpm) * 4}
      />
      <KeyboardShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
