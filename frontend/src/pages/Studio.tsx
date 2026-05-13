import { useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { generatePlan, type GenerateDepth, type RouterProvider } from "../api/client";

const PROVIDERS: { value: RouterProvider; label: string }[] = [
  { value: "auto", label: "Auto (infer from model id)" },
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
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="gradient-strip" style={{ maxWidth: 180, marginBottom: "1rem" }} />
      <h1 className="section-title">Studio</h1>
      <p className="lead mt-sm">
        Brief → enriched prompt (analysis + harmony palette + bar scaffold) → your chosen model provider.
      </p>

      <div className="glass-panel stack mt-lg" style={{ padding: "1.35rem" }}>
        <div>
          <div className="field-label">Producer brief</div>
          <textarea className="textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={7} />
        </div>

        <div className="grid-2">
          <div>
            <div className="field-label">Provider</div>
            <select className="select" value={provider} onChange={(e) => setProvider(e.target.value as RouterProvider)}>
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
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
            placeholder="mistral · gpt-4o-mini · claude-3-5-haiku-20241022 · anthropic/claude-3.5-sonnet"
          />
        </div>

        <div className="grid-2">
          <div>
            <div className="field-label">Genre override (comma-separated)</div>
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

        <button type="button" className="btn-modern btn-primary" onClick={() => void onGenerate()} disabled={busy}>
          <Sparkles size={18} />
          {busy ? "Generating…" : "Run Calliope"}
        </button>

        {meta && <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{meta}</p>}

        {out && (
          <div>
            <div className="field-label">Output</div>
            <div className="mono-block">{out}</div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
