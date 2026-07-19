import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Cpu, GitBranch, Mic, Plus } from "lucide-react";
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
import { MixerConsole, type MixerTrack } from "../components/studio/MixerConsole";
import { StudioTransport, type TransportState } from "../components/studio/StudioTransport";
import { TimelineView, type TimelineClip } from "../components/studio/TimelineView";
import { VocalRackPanel } from "../components/studio/VocalRackPanel";
import { VoiceDspPanel } from "../components/studio/VoiceDspPanel";
import { barsFromDuration, StudioEngine, type EngineClip } from "../audio/studioEngine";
import { DEFAULT_VOCAL_RACK, type VocalRackPayload } from "../types/vocalRack";
import type { PluginInstance, RecordingFile } from "../types/audio";

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
  const [depth, setDepth] = useState<GenerateDepth>("standard");
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
            <TimelineView
              bpm={bpm}
              durationBars={durationBars}
              sections={SECTIONS}
              tracks={tracks}
              selectedTrackId={selectedTrackId}
              playheadBar={transport.bar}
              clips={timelineClips}
              onFileDrop={(trackId, file) => void onTrackFileDrop(trackId, file)}
            />
          </div>

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
      </div>
    </div>
  );
}
