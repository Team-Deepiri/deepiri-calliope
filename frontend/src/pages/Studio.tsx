import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Cpu, Download, GitBranch, Keyboard, Mic, Plus } from "lucide-react";
import {
  alignAamati,
  analyzeBrief,
  generatePlan,
  createRecordingSession,
  uploadRecordingFile,
  type GenerateDepth,
  type RouterProvider,
} from "../api/client";
import { AudioRecorder, type AudioRecorderHandle } from "../components/audio/AudioRecorder";
import { PluginChainEditor } from "../components/audio/PluginChainEditor";
import { ArrangementEditor, type ArrangementClip } from "../components/studio/ArrangementEditor";
import { AutomationLane } from "../components/studio/AutomationLane";
import { ExportDialog } from "../components/studio/ExportDialog";
import { KeyboardShortcuts } from "../components/studio/KeyboardShortcuts";
import { MasterBus } from "../components/studio/MasterBus";
import { MixerConsole, type MixerTrack } from "../components/studio/MixerConsole";
import { StudioTransport, type TransportState } from "../components/studio/StudioTransport";
import { TimelineView, type TimelineClip } from "../components/studio/TimelineView";
import { VocalRackPanel } from "../components/studio/VocalRackPanel";
import { VoiceDspPanel } from "../components/studio/VoiceDspPanel";
import {
  barsFromDuration,
  DEFAULT_MASTER_CHANNEL,
  StudioEngine,
  type EngineAutomationPoint,
  type EngineClip,
  type EngineMasterChannel,
} from "../audio/studioEngine";
import { downloadBlob, encodeWav } from "../audio/exportWav";
import { takeGesturesStudioImport } from "../gestures/studioHandoff";
import { DEFAULT_VOCAL_RACK, type VocalRackPayload } from "../types/vocalRack";
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

type InspectorTab = "vocal" | "fx" | "ai" | "pipeline";

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
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("vocal");
  const [viewMode, setViewMode] = useState<"arrange" | "edit">("arrange");
  const [pluginChain, setPluginChain] = useState<PluginInstance[]>([]);
  const [sections, setSections] = useState<StudioSection[]>(SECTIONS);
  const [zoom, setZoom] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [masterCh, setMasterCh] = useState<EngineMasterChannel>({ ...DEFAULT_MASTER_CHANNEL });
  const [automation, setAutomation] = useState<Record<string, AutomationPoint[]>>({});
  const [meter, setMeter] = useState({ peak: 0, rms: 0 });

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

  const [playHint, setPlayHint] = useState("");

  const onPlayRef = useRef<() => void>(() => {});
  const onRecordRef = useRef<() => void>(() => {});

  tracksRef.current = tracks;
  clipsRef.current = clips;

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
        void onPlayRef.current();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        onRecordRef.current();
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        setExportOpen(true);
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const vocalTrack = tracks.find((t) => t.type === "vocal");

  const timelineClips: TimelineClip[] = useMemo(
    () =>
      clips.map((c) => ({
        id: c.id,
        trackId: c.trackId,
        name: c.name,
        startBar: c.startBar,
        durationBars: barsFromDuration(c.durationSec, bpm),
        color: c.color,
      })),
    [clips, bpm],
  );

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
      onBar: (bar, beat) => setTransport((t) => ({ ...t, playing: true, bar, beat })),
    });
    setTransport((t) => ({ ...t, playing: true }));
  };

  const onStop = () => {
    ensureEngine().stop();
    setTransport((t) => ({ ...t, playing: false, bar: 1, beat: 0 }));
  };

  const onRecord = () => {
    const armed = tracks.find((t) => t.id === selectedTrackId) ?? vocalTrack;
    if (armed) setSelectedTrackId(armed.id);
    setVocalDockOpen(true);
    recorderRef.current?.toggleRecord();
  };
  onPlayRef.current = () => void onPlay();
  onRecordRef.current = onRecord;

  const onClipMove = useCallback((clipId: string, newTrackId: string, newStartBar: number) => {
    setClips((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, trackId: newTrackId, startBar: Math.max(0, newStartBar) } : c)),
    );
  }, []);

  const onClipResize = useCallback(
    (clipId: string, newDurationBars: number) => {
      const barSec = (60 / bpm) * 4;
      setClips((prev) =>
        prev.map((c) => (c.id === clipId ? { ...c, durationSec: Math.max(0.25, newDurationBars) * barSec } : c)),
      );
    },
    [bpm],
  );

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

  const onRecordingStateChange = (recording: boolean) => {
    setTransport((t) => ({ ...t, recording, armed: true }));
  };

  const placeClipFromFile = useCallback(
    (file: RecordingFile, sessionId: string, trackId: string, startBar: number, durationHint?: number) => {
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
      void ensureEngine().loadClip(clip);
    },
    [],
  );

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

  const onRecordingComplete = (file: RecordingFile, sessionId: string, durationHint?: number) => {
    const trackId = selectedTrackId || vocalTrack?.id || "4";
    const startBar = Math.max(0, transport.bar - 1);
    placeClipFromFile(file, sessionId, trackId, startBar, durationHint);
    setPlayHint("");
  };

  const onTrackFileDrop = useCallback(
    async (trackId: string, file: File) => {
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
        placeClipFromFile(newFile, sessionIdRef.current!, trackId, Math.max(0, transport.bar - 1));
      } catch (e) {
        console.error("Track drop upload failed:", e);
      }
    },
    [placeClipFromFile, transport.bar],
  );

  const addTrack = () => {
    const id = String(Date.now());
    const color = TRACK_COLORS[tracks.length % TRACK_COLORS.length];
    const track: MixerTrack = {
      id,
      name: `Track ${tracks.length + 1}`,
      type: "audio",
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

  return (
    <div className="daw">
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
        />
        {playHint && <span className="daw-toolbar__hint">{playHint}</span>}
        <span className="daw-toolbar__spacer" />
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

      <div className="daw__workspace">
        <aside className="daw-tracks">
          <div className="daw-tracks__head">
            <span>Tracks</span>
            <button type="button" className="daw-tracks__add" onClick={addTrack} title="Add track">
              <Plus size={14} />
              Add
            </button>
          </div>
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
                  }),
                )}
                sections={sections}
                isPlaying={transport.playing}
                currentPosition={transport.bar - 1}
                zoom={zoom}
                onZoomChange={setZoom}
                onClipMove={onClipMove}
                onClipResize={onClipResize}
                onSectionChange={setSections}
              />
            ) : (
              <TimelineView
                bpm={bpm}
                durationBars={durationBars}
                sections={sections}
                tracks={tracks}
                selectedTrackId={selectedTrackId}
                playheadBar={transport.bar}
                clips={timelineClips}
                onFileDrop={(trackId, file) => void onTrackFileDrop(trackId, file)}
              />
            )}
          </div>

          {viewMode === "edit" && (
            <div className="daw-automation">
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

        <aside className="daw-inspector">
          <div className="daw-inspector__tabs">
            {(
              [
                ["vocal", "Vocal"],
                ["fx", "FX"],
                ["ai", "AI"],
                ["pipeline", "Pipeline"],
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
                <VocalRackPanel
                  value={vocalRack}
                  onChange={setVocalRack}
                  injectEnabled={vocalInject}
                  onInjectChange={setVocalInject}
                />
                <div style={{ marginTop: "0.75rem" }}>
                  <VoiceDspPanel rack={vocalRack} sampleRate={48_000} />
                </div>
              </>
            )}
            {inspectorTab === "fx" && (
              <PluginChainEditor
                chain={pluginChain}
                onChange={setPluginChain}
                onBypass={() => setPluginChain((c) => c.map((p) => ({ ...p, enabled: false })))}
              />
            )}
            {inspectorTab === "ai" && (
              <div className="daw-architect">
                <div>
                  <label>Brief</label>
                  <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} />
                </div>
                <div>
                  <label>Provider</label>
                  <select value={provider} onChange={(e) => setProvider(e.target.value as RouterProvider)}>
                    {PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Genre</label>
                  <input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="UK garage" />
                </div>
                <button type="button" className="daw-architect__run" disabled={planBusy} onClick={() => void onGeneratePlan()}>
                  {planBusy ? "Generating…" : "Generate plan (Ollama)"}
                </button>
                {planMeta && <p className="daw-architect__meta">{planMeta}</p>}
                {planOut && <pre className="daw-architect__out">{planOut}</pre>}
              </div>
            )}
            {inspectorTab === "pipeline" && (
              <div className="daw-pipeline">
                <div className="daw-pipeline__intro">
                  <GitBranch size={14} />
                  Embedded pipeline — analyze → Aamati → LLM
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
                  <button type="button" className="is-primary" disabled={busyG} onClick={() => void runFullGenerate()}>
                    {busyG ? "…" : "Full LLM"}
                  </button>
                </div>
                {pipeMeta && <p className="daw-architect__meta">{pipeMeta}</p>}
                {pipeAnalysis && <pre className="daw-architect__out">{pipeAnalysis}</pre>}
                {pipeAamati && <pre className="daw-architect__out">{pipeAamati}</pre>}
                {pipePlan && <pre className="daw-architect__out">{pipePlan}</pre>}
              </div>
            )}
          </div>
        </aside>
      </div>

      <div className="daw__mixer-wrap">
        <MixerConsole tracks={tracks} onUpdateTrack={onUpdateTrack} />
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
