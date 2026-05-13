import { useState } from "react";
import { motion } from "framer-motion";
import { Cpu, Sparkles, SlidersHorizontal } from "lucide-react";
import { generatePlan, type GenerateDepth, type RouterProvider } from "../api/client";
import { VocalRackPanel } from "../components/studio/VocalRackPanel";
import { DEFAULT_VOCAL_RACK, type VocalRackPayload } from "../types/vocalRack";

const PROVIDERS: { value: RouterProvider; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "ollama", label: "Ollama" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
];

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
              Brief plus deterministic analysis feeds the architect. Dial a vocal chain with the rack — values are
              injected into the prompt as production targets when inject is on.
            </p>
          </div>
          <div className="studio-hero__tags">
            <span className="studio-tag">
              <Cpu size={14} /> Router
            </span>
            <span className="studio-tag">
              <SlidersHorizontal size={14} /> Rack
            </span>
          </div>
        </div>
      </header>

      <div className="studio-layout">
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

        <aside className="studio-col studio-col--rack">
          <div className="glass-panel studio-panel vocal-rack-outer" style={{ padding: "1.15rem 1.1rem 1.35rem" }}>
            <VocalRackPanel value={vocalRack} onChange={setVocalRack} injectEnabled={vocalInject} onInjectChange={setVocalInject} />
          </div>
        </aside>
      </div>
    </motion.div>
  );
}
