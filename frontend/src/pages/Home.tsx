import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Brain,
  Cpu,
  GitBranch,
  Loader2,
  Mic2,
  Server,
  Sparkles,
  Waves,
  Zap,
} from "lucide-react";
import { fetchHealth, fetchOllamaStatus, fetchRouterProviders } from "../api/client";

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`home-status-chip ${ok ? "is-ok" : "is-warn"}`}>
      <span className="home-status-chip__dot" />
      {label}
    </span>
  );
}

export function Home() {
  const [health, setHealth] = useState<string>("…");
  const [ollama, setOllama] = useState<string>("…");
  const [router, setRouter] = useState<string>("…");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const h = await fetchHealth();
        setHealth(JSON.stringify(h, null, 2));
      } catch {
        setHealth("unreachable");
      }
      try {
        const o = await fetchOllamaStatus();
        setOllama(JSON.stringify(o, null, 2));
      } catch {
        setOllama("unreachable");
      }
      try {
        const r = await fetchRouterProviders();
        setRouter(JSON.stringify(r, null, 2));
      } catch {
        setRouter("unreachable");
      }
      setLoading(false);
    })();
  }, []);

  let routerParsed: { openai?: boolean; anthropic?: boolean; ollama?: boolean; openrouter?: boolean } | null = null;
  try {
    routerParsed = JSON.parse(router) as typeof routerParsed;
  } catch {
    routerParsed = null;
  }

  const healthOk = health !== "unreachable" && health !== "…";
  const routerOk = router !== "unreachable" && router !== "…";
  const ollamaOk = ollama !== "unreachable" && ollama !== "…";

  return (
    <motion.div className="home-overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <section className="home-hero">
        <div className="home-hero__glow" />
        <div className="gradient-strip home-hero__strip" />
        <h1 className="home-hero__title">
          Ship ideas with <span className="gradient-text">Calliope</span>
        </h1>
        <p className="home-hero__subtitle">
          A Deepiri-styled control room for music briefs: deterministic intel, arrangement scaffolding, harmony hints,
          optional Aamati mood priors, and a multi-provider LLM router. Studio pairs a modular vocal rack (warmth, brilliance,
          punch, predelay, motion, parallel grit, and more) with a live voice-DSP preview so you can hear the chain before
          you brief the architect.
        </p>
        <div className="home-hero__actions">
          <Link to="/studio" className="btn-modern btn-primary home-cta">
            Open Studio <ArrowRight size={18} />
          </Link>
          <Link to="/pipeline" className="btn-modern btn-ghost home-cta home-cta--ghost">
            Pipeline <GitBranch size={18} />
          </Link>
        </div>
        <div className="home-hero__chips">
          <StatusChip ok={healthOk} label="API" />
          <StatusChip ok={routerOk} label="Router" />
          <StatusChip ok={ollamaOk} label="Ollama" />
        </div>
      </section>

      <nav className="home-command-deck" aria-label="Primary destinations">
        <Link to="/studio" className="home-deck-card">
          <span className="home-deck-card__kicker">Console</span>
          <span className="home-deck-card__title">Studio</span>
          <span className="home-deck-card__text">
            Vocal rack modules, rotaries, presets, and voice-DSP waveform preview wired to the same payload the backend uses.
          </span>
        </Link>
        <Link to="/pipeline" className="home-deck-card">
          <span className="home-deck-card__kicker">Workflow</span>
          <span className="home-deck-card__title">Pipeline</span>
          <span className="home-deck-card__text">Analyze → Aamati priors → generate in stepped jobs with Postgres-backed runs.</span>
        </Link>
        <a href="#control-plane" className="home-deck-card">
          <span className="home-deck-card__kicker">Ops</span>
          <span className="home-deck-card__title">Control plane</span>
          <span className="home-deck-card__text">Live health JSON, router flags, and Ollama runtime without leaving the overview.</span>
        </a>
      </nav>

      <section className="home-bento">
        <article className="home-card home-card--wide glass-panel">
          <div className="home-card__icon">
            <Activity size={22} />
          </div>
          <h2 className="home-card__title">Live overview</h2>
          <p className="home-card__text">Health, model router flags, and local Ollama in one glance. Details stay in the panels below.</p>
        </article>

        <article className="home-card glass-panel">
          <div className="home-card__icon home-card__icon--cyan">
            <Brain size={22} />
          </div>
          <h2 className="home-card__title">Music intel</h2>
          <p className="home-card__text">
            Tempo inference, genre tags, swing bias, energy and section lengths — computed before any LLM call.
          </p>
        </article>

        <article className="home-card glass-panel">
          <div className="home-card__icon home-card__icon--violet">
            <Mic2 size={22} />
          </div>
          <h2 className="home-card__title">Vocal rack</h2>
          <p className="home-card__text">
            EQ and tone, dynamics, color and space, pitch — each as a mini module with rotaries. New macro knobs cover warmth,
            brilliance and air, punch, verb predelay, motion blur, and parallel grit alongside the classic targets.
          </p>
        </article>

        <article className="home-card glass-panel">
          <div className="home-card__icon home-card__icon--amber">
            <Zap size={22} />
          </div>
          <h2 className="home-card__title">Multi-LLM</h2>
          <p className="home-card__text">Ollama, OpenAI, Anthropic, or OpenRouter — pick a provider or let Auto route from the model id.</p>
        </article>

        <article className="home-card home-card--tall glass-panel">
          <div className="home-card__icon home-card__icon--indigo">
            <Sparkles size={22} />
          </div>
          <h2 className="home-card__title">Architect depth</h2>
          <p className="home-card__text">
            Standard mode returns tight markdown sections. Deep mode appends a machine-readable JSON tail for tooling and QA.
          </p>
          <ul className="home-mini-list">
            <li>Harmony palette lines from genre</li>
            <li>Bar scaffold from energy &amp; complexity</li>
            <li>Aamati mood block when priors are available</li>
          </ul>
        </article>

        <article className="home-card glass-panel">
          <div className="home-card__icon home-card__icon--teal">
            <Waves size={22} />
          </div>
          <h2 className="home-card__title">Router surface</h2>
          <p className="home-card__text">
            Keys surface only as booleans on <code className="home-code">/v1/router/providers</code>. Defaults show which model ids ship first.
          </p>
          {routerParsed && (
            <div className="home-router-pills">
              {routerParsed.openai !== undefined && (
                <span className={`home-pill ${routerParsed.openai ? "on" : ""}`}>OpenAI</span>
              )}
              {routerParsed.anthropic !== undefined && (
                <span className={`home-pill ${routerParsed.anthropic ? "on" : ""}`}>Anthropic</span>
              )}
              {routerParsed.openrouter !== undefined && (
                <span className={`home-pill ${routerParsed.openrouter ? "on" : ""}`}>OpenRouter</span>
              )}
              <span className={`home-pill ${routerParsed.ollama ? "on" : ""}`}>Ollama</span>
            </div>
          )}
        </article>
      </section>

      <div id="control-plane" className="grid-2 mt-lg home-status-grid">
        <div className="glass-panel stack home-status-panel" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Server size={20} color="#818cf8" />
            <h2 className="section-title" style={{ fontSize: "1.1rem", margin: 0 }}>
              Control plane
            </h2>
          </div>
          <p className="lead" style={{ fontSize: "0.85rem" }}>
            FastAPI + Postgres jobs + optional cloud keys. Studio is the single-shot console; Pipeline runs analyze → Aamati →
            generate in steps.
          </p>
          <div className="mono-block home-mono">{loading ? "Loading…" : health}</div>
        </div>

        <div className="glass-panel stack home-status-panel" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Cpu size={20} color="#22d3ee" />
            <h2 className="section-title" style={{ fontSize: "1.1rem", margin: 0 }}>
              Model router JSON
            </h2>
          </div>
          <p className="lead" style={{ fontSize: "0.85rem" }}>
            Configure providers in <code className="home-code">.env</code> for Docker Compose. This block is the raw router payload.
          </p>
          <div className="mono-block home-mono">{loading ? <Loader2 className="animate-spin" size={18} /> : router}</div>
        </div>
      </div>

      <div className="glass-panel mt-lg stack" style={{ padding: "1.25rem" }}>
        <h2 className="section-title" style={{ fontSize: "1.1rem" }}>
          Ollama runtime
        </h2>
        <div className="mono-block home-mono">{loading ? "…" : ollama}</div>
      </div>
    </motion.div>
  );
}
