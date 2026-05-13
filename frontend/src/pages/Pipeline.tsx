import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Cpu, Layers, Play } from "lucide-react";
import { alignAamati, analyzeBrief, generatePlan, type GenerateDepth } from "../api/client";

export function Pipeline() {
  const [text, setText] = useState("Neurofunk 174 BPM, reese bass, tight snare ghost layers");
  const [analysis, setAnalysis] = useState<string>("");
  const [aamati, setAamati] = useState<string>("");
  const [plan, setPlan] = useState("");
  const [meta, setMeta] = useState("");
  const [busyA, setBusyA] = useState(false);
  const [busyM, setBusyM] = useState(false);
  const [busyG, setBusyG] = useState(false);
  const [depth, setDepth] = useState<GenerateDepth>("deep");

  async function runAnalyze() {
    setBusyA(true);
    setAnalysis("");
    try {
      const r = await analyzeBrief(text);
      setAnalysis(JSON.stringify(r, null, 2));
    } catch (e) {
      setAnalysis(String(e));
    } finally {
      setBusyA(false);
    }
  }

  async function runAamatiAlign() {
    setBusyM(true);
    setAamati("");
    try {
      const r = await alignAamati(text);
      setAamati(JSON.stringify(r, null, 2));
    } catch (e) {
      setAamati(String(e));
    } finally {
      setBusyM(false);
    }
  }

  async function runFullGenerate() {
    setBusyG(true);
    setPlan("");
    setMeta("");
    try {
      const r = await generatePlan(text, { depth, provider: "auto" });
      setPlan(r.response);
      setMeta(`${r.provider} · ${r.model}`);
    } catch (e) {
      setPlan(String(e));
    } finally {
      setBusyG(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="gradient-strip" style={{ maxWidth: 200, marginBottom: "1rem" }} />
      <h1 className="section-title">Pipeline</h1>
      <p className="lead mt-sm">
        Step 1: deterministic <strong>music intel</strong> (no LLM). Step 1b: <strong>Aamati</strong> mood ontology
        alignment (ranked moods + optional ONNX). Step 2: full <strong>architect</strong> pass — prompts include the Aamati prior block automatically.
      </p>

      <div className="glass-panel stack mt-lg" style={{ padding: "1.35rem" }}>
        <div>
          <div className="field-label">Brief</div>
          <textarea className="textarea" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div style={{ maxWidth: 320 }}>
          <div className="field-label">Generate depth</div>
          <select className="select" value={depth} onChange={(e) => setDepth(e.target.value as GenerateDepth)}>
            <option value="standard">standard</option>
            <option value="deep">deep (JSON tail)</option>
          </select>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem" }}>
          <button type="button" className="btn-modern btn-ghost" onClick={() => void runAnalyze()} disabled={busyA}>
            <Cpu size={18} />
            {busyA ? "Analyzing…" : "1 · Analyze (deterministic)"}
          </button>
          <button type="button" className="btn-modern btn-ghost" onClick={() => void runAamatiAlign()} disabled={busyM}>
            <Layers size={18} />
            {busyM ? "Aligning…" : "1b · Aamati mood align"}
          </button>
          <button type="button" className="btn-modern btn-primary" onClick={() => void runFullGenerate()} disabled={busyG}>
            <Play size={18} />
            {busyG ? "Generating…" : "2 · Full LLM plan"}
          </button>
          <Link to="/studio" className="btn-modern btn-ghost" style={{ textDecoration: "none" }}>
            Open Studio instead
          </Link>
        </div>
      </div>

      {analysis && (
        <div className="glass-panel stack mt-lg" style={{ padding: "1.25rem" }}>
          <h2 className="section-title" style={{ fontSize: "1.05rem" }}>
            Analysis JSON
          </h2>
          <div className="mono-block">{analysis}</div>
        </div>
      )}

      {aamati && (
        <div className="glass-panel stack mt-lg" style={{ padding: "1.25rem" }}>
          <h2 className="section-title" style={{ fontSize: "1.05rem" }}>
            Aamati alignment
          </h2>
          <div className="mono-block">{aamati}</div>
        </div>
      )}

      {plan && (
        <div className="glass-panel stack mt-lg" style={{ padding: "1.25rem" }}>
          <h2 className="section-title" style={{ fontSize: "1.05rem" }}>
            LLM output
          </h2>
          {meta && <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{meta}</p>}
          <div className="mono-block">{plan}</div>
        </div>
      )}
    </motion.div>
  );
}
