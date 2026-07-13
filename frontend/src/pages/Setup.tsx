import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isDesktopRuntime, openLogsFolder, runPreflight, startStack, stopStack, type PreflightResult } from "../desktop/preflight";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120000;

export function Setup() {
  const navigate = useNavigate();
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiHealthy = result?.apiHealthy ?? false;
  const requiredPassed = result?.allRequiredPassed ?? false;

  const canOpenStudio = requiredPassed && apiHealthy;
  const primaryLabel = canOpenStudio ? "Open Studio" : "Start Calliope";

  async function refresh() {
    try {
      const next = await runPreflight();
      setResult(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run preflight checks.");
    }
  }

  async function runStartFlow() {
    if (canOpenStudio) {
      navigate("/");
      return;
    }

    setRunning(true);
    setError(null);
    try {
      await startStack();
      const startedAt = Date.now();
      while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
        const next = await runPreflight();
        setResult(next);
        if (next.allRequiredPassed && next.apiHealthy) {
          setRunning(false);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
      setError("Timed out while waiting for API health. Open logs for details.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the stack.");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const prerequisiteTitle = useMemo(() => {
    if (isDesktopRuntime()) return "Desktop prerequisites";
    return "Local prerequisites";
  }, []);

  return (
    <main className="setup-page">
      <section className="setup-card">
        <h1>Calliope setup</h1>
        <p>Before opening Studio, Calliope validates Docker, the local stack, and your LLM path.</p>

        <div className="setup-status">
          {(result?.checks ?? []).map((check) => (
            <div key={check.id} className="setup-status-row">
              <strong>{renderIcon(check.status)}</strong>
              <div>
                <div>{check.label}</div>
                <small>{check.detail}</small>
              </div>
            </div>
          ))}
        </div>

        <div className="setup-actions">
          <button type="button" onClick={() => void runStartFlow()} disabled={running}>
            {running ? "Starting..." : primaryLabel}
          </button>
          <button type="button" onClick={() => void refresh()} disabled={running}>
            Retry checks
          </button>
          <button type="button" onClick={() => void stopStack()} disabled={running}>
            Stop stack
          </button>
          <button type="button" onClick={() => void openLogsFolder()} disabled={running || !isDesktopRuntime()}>
            Open logs folder
          </button>
        </div>

        {error ? <p className="setup-error">{error}</p> : null}

        <details>
          <summary>{prerequisiteTitle}</summary>
          <ul>
            <li>Install Docker Desktop (or Docker Engine on Linux).</li>
            <li>Install Ollama and run `ollama pull mistral`.</li>
            <li>Cloud fallback works with one API key in `.env` (`OPENAI`, `ANTHROPIC`, `OPENROUTER`, or `GEMINI`).</li>
            <li>Allow localhost access to `127.0.0.1:8080`.</li>
          </ul>
          <p>
            Troubleshooting:{" "}
            <a href="https://docs.docker.com/" target="_blank" rel="noreferrer">
              Docker docs
            </a>{" "}
            and{" "}
            <a href="https://ollama.com/download" target="_blank" rel="noreferrer">
              Ollama install
            </a>
            .
          </p>
        </details>

        <p>
          Return to <Link to="/">home</Link>.
        </p>
      </section>
    </main>
  );
}

function renderIcon(status: "pass" | "fail" | "warn" | "skip") {
  if (status === "pass") return "✅";
  if (status === "warn") return "⚠️";
  if (status === "skip") return "➖";
  return "❌";
}
