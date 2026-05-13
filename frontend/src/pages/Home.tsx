import { useEffect, useState } from "react";
import { fetchHealth, fetchOllamaStatus } from "../api/client";

export function Home() {
  const [health, setHealth] = useState<string>("…");
  const [ollama, setOllama] = useState<string>("…");

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
    })();
  }, []);

  return (
    <section>
      <h2>System</h2>
      <pre style={{ background: "#16131f", padding: "1rem", borderRadius: 8, overflow: "auto" }}>
        {health}
      </pre>
      <h2>Ollama</h2>
      <pre style={{ background: "#16131f", padding: "1rem", borderRadius: 8, overflow: "auto" }}>
        {ollama}
      </pre>
    </section>
  );
}
