import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowRight, GitBranch, Hand } from "lucide-react";
import { fetchHealth, fetchRouterProviders } from "../api/client";

export function Home() {
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
  const [model, setModel] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        await fetchHealth();
        setApiOk(true);
      } catch {
        setApiOk(false);
      }
      try {
        const r = await fetchRouterProviders();
        setOllamaOk(r.ollama ?? false);
        setModel((r.defaults as { ollama_model?: string })?.ollama_model ?? null);
      } catch {
        setOllamaOk(false);
      }
    })();
  }, []);

  return (
    <motion.div
      className="home-v2"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="home-v2__glow" />

      <header className="home-v2__hero">
        <div className="home-v2__status-row">
          <Dot ok={apiOk} label="API" />
          <Dot ok={ollamaOk} label={model ?? "Ollama"} />
        </div>

        <h1 className="home-v2__title">
          <span className="gradient-text">Calliope</span>
        </h1>
        <p className="home-v2__sub">AI music studio · Deepiri</p>

        <div className="home-v2__actions">
          <Link to="/studio" className="home-v2__cta">
            Open Studio <ArrowRight size={16} />
          </Link>
          <Link to="/gestures" className="home-v2__ghost">
            Gestures <Hand size={14} />
          </Link>
          <Link to="/pipeline" className="home-v2__ghost">
            Pipeline <GitBranch size={14} />
          </Link>
        </div>
      </header>

      <nav className="home-v2__nav">
        <Link to="/studio" className="home-v2__card">
          <span className="home-v2__card-label">Studio</span>
          <span className="home-v2__card-desc">Record, process, brief</span>
        </Link>
        <Link to="/gestures" className="home-v2__card">
          <span className="home-v2__card-label">Gestures</span>
          <span className="home-v2__card-desc">Hand-driven performance</span>
        </Link>
        <Link to="/pipeline" className="home-v2__card">
          <span className="home-v2__card-label">Pipeline</span>
          <span className="home-v2__card-desc">Analyze → generate</span>
        </Link>
      </nav>
    </motion.div>
  );
}

function Dot({ ok, label }: { ok: boolean | null; label: string }) {
  const color = ok === null ? "#475569" : ok ? "#4ade80" : "#f87171";
  return (
    <span className="home-v2__dot-chip">
      <span className="home-v2__dot" style={{ background: color, boxShadow: ok ? `0 0 8px ${color}` : "none" }} />
      {label}
    </span>
  );
}
