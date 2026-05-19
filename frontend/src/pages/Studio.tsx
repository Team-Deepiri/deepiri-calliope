import { useCallback, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Mic } from "lucide-react";
import { generatePlan, type GenerateDepth, type RouterProvider } from "../api/client";
import { AudioRecorder, type AudioRecorderHandle } from "../components/audio/AudioRecorder";
import { PluginChainEditor } from "../components/audio/PluginChainEditor";
import { MixerConsole, type MixerTrack } from "../components/studio/MixerConsole";
import { StudioTransport, type TransportState } from "../components/studio/StudioTransport";
import { TimelineView } from "../components/studio/TimelineView";
import { VocalRackPanel } from "../components/studio/VocalRackPanel";
import { VoiceDspPanel } from "../components/studio/VoiceDspPanel";
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

type InspectorTab = "vocal" | "fx" | "ai";

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

export function Studio() {
  const recorderRef = useRef<AudioRecorderHandle>(null);
  const [tracks, setTracks] = useState<MixerTrack[]>(INITIAL_TRACKS);
  const [selectedTrackId, setSelectedTrackId] = useState("4");
  const [vocalTakes, setVocalTakes] = useState<RecordingFile[]>([]);
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
  const [provider, setProvider] = useState<RouterProvider>("auto");
  const [depth, setDepth] = useState<GenerateDepth>("standard");
  const [genre, setGenre] = useState("");
  const [vocalRack, setVocalRack] = useState<VocalRackPayload>({ ...DEFAULT_VOCAL_RACK });
  const [vocalInject, setVocalInject] = useState(true);
  const [planOut, setPlanOut] = useState("");
  const [planBusy, setPlanBusy] = useState(false);

  const vocalTrack = tracks.find((t) => t.type === "vocal");

  const onUpdateTrack = useCallback((id: string, updates: Partial<MixerTrack>) => {
    setTracks((t) => t.map((x) => (x.id === id ? { ...x, ...updates } : x)));
  }, []);

  const onPlay = () => setTransport((t) => ({ ...t, playing: !t.playing }));
  const onStop = () => setTransport((t) => ({ ...t, playing: false, bar: 1, beat: 0 }));

  const onRecord = () => {
    setSelectedTrackId("4");
    setVocalDockOpen(true);
    if (recorderRef.current?.isRecording()) {
      recorderRef.current.toggleRecord();
    } else {
      recorderRef.current?.toggleRecord();
    }
  };

  const onRecordingStateChange = (recording: boolean) => {
    setTransport((t) => ({ ...t, recording, armed: true }));
  };

  const onRecordingComplete = (file: RecordingFile) => {
    setVocalTakes((prev) => [...prev, file]);
  };

  async function onGeneratePlan() {
    setPlanBusy(true);
    setPlanOut("");
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
    } catch (e) {
      setPlanOut(String(e));
    } finally {
      setPlanBusy(false);
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
          onPlay={onPlay}
          onStop={onStop}
          onRecord={onRecord}
        />
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
          <div className="daw-tracks__head">Tracks</div>
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
                {track.type === "vocal" && (
                  <button
                    type="button"
                    className={`daw-track-row__arm${transport.armed ? " is-armed" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTransport((t) => ({ ...t, armed: !t.armed }));
                    }}
                    title="Arm vocal input"
                  >
                    R
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>

        <div className="daw-center">
          <div className="daw-arrange">
            <TimelineView
              bpm={bpm}
              durationBars={32}
              sections={SECTIONS}
              tracks={tracks}
              selectedTrackId={selectedTrackId}
              playheadBar={transport.bar}
              vocalTakes={vocalTakes}
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
                Vocal input · {vocalTrack?.name ?? "Vocals"}
              </h3>
              {vocalDockOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </div>
            {vocalDockOpen && (
              <div className="daw-vocal-dock__body">
                <AudioRecorder
                  ref={recorderRef}
                  variant="daw"
                  onRecordingComplete={(file) => onRecordingComplete(file)}
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
              <PluginChainEditor chain={pluginChain} onChange={setPluginChain} onBypass={() => setPluginChain([])} />
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
                  {planBusy ? "Generating…" : "Generate plan"}
                </button>
                {planOut && <pre className="daw-architect__out">{planOut}</pre>}
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
