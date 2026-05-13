import { useState } from "react";
import { generatePlan } from "../api/client";

export function Studio() {
  const [prompt, setPrompt] = useState("Dark UK garage, 132 BPM, swung hats, minor 9 chords");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);

  async function onGenerate() {
    setBusy(true);
    setOut("");
    try {
      const res = await generatePlan(prompt);
      setOut(res.response);
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
      <button
        type="button"
        onClick={() => void onGenerate()}
        disabled={busy}
        style={{ marginTop: "0.75rem", padding: "0.6rem 1.2rem", borderRadius: 8, border: "none", cursor: busy ? "wait" : "pointer", background: "#5c7cfa", color: "#fff", fontWeight: 600 }}
      >
        {busy ? "Generating…" : "Ask Calliope"}
      </button>
      {out && (
        <pre style={{ marginTop: "1rem", whiteSpace: "pre-wrap", background: "#16131f", padding: "1rem", borderRadius: 8 }}>
          {out}
        </pre>
      )}
    </section>
  );
}
