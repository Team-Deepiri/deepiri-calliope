import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Server, Waves } from "lucide-react";
import { fetchHealth, fetchOllamaStatus, fetchRouterProviders } from "../api/client";

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

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div className="gradient-strip" style={{ maxWidth: 220, marginBottom: "1.25rem" }} />
      <h1 className="section-title">
        Ship ideas with <span className="gradient-text">Calliope</span>
      </h1>
      <p className="lead mt-sm">
        Deterministic brief analysis, arrangement scaffolding, harmony palettes, and a multi-provider LLM router
        (Ollama, OpenAI, Anthropic, OpenRouter) — styled after the Deepiri web shell.
      </p>

      <div className="grid-2 mt-lg">
        <div className="glass-panel stack" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Server size={20} color="#818cf8" />
            <h2 className="section-title" style={{ fontSize: "1.1rem", margin: 0 }}>
              Control plane
            </h2>
          </div>
          <p className="lead" style={{ fontSize: "0.85rem" }}>
            FastAPI + Postgres jobs + optional cloud keys. Use Studio for single-shot plans or Pipeline for analyze →
            deep generate.
          </p>
          <div className="mono-block">{loading ? "Loading…" : health}</div>
        </div>

        <div className="glass-panel stack" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Waves size={20} color="#22d3ee" />
            <h2 className="section-title" style={{ fontSize: "1.1rem", margin: 0 }}>
              Model router
            </h2>
          </div>
          <p className="lead" style={{ fontSize: "0.85rem" }}>
            Keys never leave booleans in <code>/v1/router/providers</code>. Configure in <code>.env</code> for Docker.
          </p>
          <div className="mono-block">{loading ? <Loader2 className="animate-spin" size={18} /> : router}</div>
        </div>
      </div>

      <div className="glass-panel mt-lg stack" style={{ padding: "1.25rem" }}>
        <h2 className="section-title" style={{ fontSize: "1.1rem" }}>
          Ollama runtime
        </h2>
        <div className="mono-block">{loading ? "…" : ollama}</div>
      </div>
    </motion.div>
  );
}
