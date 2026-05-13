import { useEffect, useState } from "react";
import { fetchHealth, fetchOllamaStatus, fetchRouterProviders } from "../api/client";

export function Home() {
  const [health, setHealth] = useState<string>("…");
  const [ollama, setOllama] = useState<string>("…");
  const [router, setRouter] = useState<string>("…");

  useEffect(() => {
    void (async () => {
      try {
        const h = await fetchHealth();
        setHealth(JSON.stringify(h));
      } catch {
        setHealth("unreachable");
      }
      try {
        const o = await fetchOllamaStatus();
        setOllama(JSON.stringify(o));
      } catch {
        setOllama("unreachable");
      }
      try {
        const r = await fetchRouterProviders();
        setRouter(JSON.stringify(r, null, 2));
      } catch {
        setRouter("unreachable");
      }
    })();
  }, []);

  return (
    <section>
      <h2>System</h2>
      <pre style={{ background: "#16131f", padding: "1rem", borderRadius: 8, overflow: "auto" }}>
        {health}
      </pre>
      <h2>Model router</h2>
      <pre style={{ background: "#16131f", padding: "1rem", borderRadius: 8, overflow: "auto" }}>
        {router}
      </pre>
      <h2>Ollama</h2>
      <pre style={{ background: "#16131f", padding: "1rem", borderRadius: 8, overflow: "auto" }}>
        {ollama}
      </pre>
    </section>
  );
}
