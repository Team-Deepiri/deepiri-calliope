import { useState } from "react";
import { generatePlan, type RouterProvider } from "../api/client";

const PROVIDERS: { value: RouterProvider; label: string }[] = [
  { value: "auto", label: "Auto (infer from model)" },
  { value: "ollama", label: "Ollama (local)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
];

export function Studio() {
  const [prompt, setPrompt] = useState("Dark UK garage, 132 BPM, swung hats, minor 9 chords");
  const [model, setModel] = useState("");
  const [provider, setProvider] = useState<RouterProvider>("auto");
  const [out, setOut] = useState("");
  const [meta, setMeta] = useState("");
  const [busy, setBusy] = useState(false);

  async function onGenerate() {
    setBusy(true);
    setOut("");
    setMeta("");
    try {
      const res = await generatePlan(prompt, {
        provider,
        model: model.trim() || undefined,
      });
      setOut(res.response);
      setMeta(`${res.provider} · ${res.model}`);
    } catch (e) {
      setOut(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Producer brief</h2>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={6}
        style={{ width: "100%", borderRadius: 8, padding: "0.75rem", background: "#16131f", color: "#f4f1ff", border: "1px solid #2a2438" }}
      />
      <div style={{ marginTop: "0.75rem", display: "grid", gap: "0.5rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.9rem" }}>
          Provider
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as RouterProvider)}
            style={{ padding: "0.5rem", borderRadius: 8, background: "#16131f", color: "#f4f1ff", border: "1px solid #2a2438" }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.9rem" }}>
          Model (optional — uses defaults when empty)
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. mistral, gpt-4o-mini, claude-3-5-haiku-20241022, anthropic/claude-3.5-sonnet"
            style={{ padding: "0.5rem", borderRadius: 8, background: "#16131f", color: "#f4f1ff", border: "1px solid #2a2438" }}
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => void onGenerate()}
        disabled={busy}
        style={{ marginTop: "0.75rem", padding: "0.6rem 1.2rem", borderRadius: 8, border: "none", cursor: busy ? "wait" : "pointer", background: "#5c7cfa", color: "#fff", fontWeight: 600 }}
      >
        {busy ? "Generating…" : "Ask Calliope"}
      </button>
      {meta && (
        <p style={{ marginTop: "0.75rem", opacity: 0.85, fontSize: "0.9rem" }}>{meta}</p>
      )}
      {out && (
        <pre style={{ marginTop: "1rem", whiteSpace: "pre-wrap", background: "#16131f", padding: "1rem", borderRadius: 8 }}>
          {out}
        </pre>
      )}
    </section>
  );
}
