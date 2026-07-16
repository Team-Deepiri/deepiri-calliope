type CheckStatus = "pass" | "fail" | "warn" | "skip";

export type PreflightCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  required: boolean;
  blocksStudio: boolean;
};

export type PreflightResult = {
  checks: PreflightCheck[];
  allRequiredPassed: boolean;
  apiHealthy: boolean;
};

type TauriInternals = {
  invoke?: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
};

function getInvoke() {
  const internals = (window as Window & { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
  return internals?.invoke;
}

export function isDesktopRuntime(): boolean {
  return typeof getInvoke() === "function";
}

async function runWebPreflight(): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];

  checks.push({
    id: "docker-cli",
    label: "Docker CLI",
    status: "skip",
    detail: "Only available from desktop runtime preflight.",
    required: true,
    blocksStudio: true,
  });

  checks.push({
    id: "docker-daemon",
    label: "Docker daemon",
    status: "skip",
    detail: "Only available from desktop runtime preflight.",
    required: true,
    blocksStudio: true,
  });

  checks.push({
    id: "compose-v2",
    label: "Compose v2",
    status: "skip",
    detail: "Only available from desktop runtime preflight.",
    required: true,
    blocksStudio: true,
  });

  checks.push({
    id: "stack-data-dir",
    label: "Stack data directory",
    status: "skip",
    detail: "Managed by desktop runtime.",
    required: true,
    blocksStudio: true,
  });

  checks.push({
    id: "env-present",
    label: ".env present",
    status: "skip",
    detail: "Managed by desktop runtime.",
    required: true,
    blocksStudio: true,
  });

  let apiHealthy = false;
  try {
    const r = await fetch(`${import.meta.env.VITE_API_BASE ?? ""}/health`);
    apiHealthy = r.ok;
  } catch {
    apiHealthy = false;
  }

  checks.push({
    id: "api-container",
    label: "API health",
    status: apiHealthy ? "pass" : "fail",
    detail: apiHealthy ? "API responded at /health." : "Could not reach API at /health.",
    required: true,
    blocksStudio: true,
  });

  let ollamaRunning = false;
  let modelReady = false;
  try {
    const r = await fetch(`${import.meta.env.VITE_API_BASE ?? ""}/v1/ollama/status`);
    if (r.ok) {
      const data = (await r.json()) as { running?: boolean; models?: string[] };
      ollamaRunning = Boolean(data.running);
      const model = (import.meta.env.VITE_OLLAMA_MODEL ?? "mistral").trim();
      modelReady = Array.isArray(data.models) && data.models.includes(model);
    }
  } catch {
    ollamaRunning = false;
  }

  checks.push({
    id: "ollama-reachable",
    label: "Ollama reachable",
    status: ollamaRunning ? "pass" : "fail",
    detail: ollamaRunning ? "Ollama is reachable." : "Ollama is not reachable at localhost:11434.",
    required: true,
    blocksStudio: true,
  });

  checks.push({
    id: "model-available",
    label: "Model available",
    status: modelReady ? "pass" : "warn",
    detail: modelReady ? "Configured model is available." : "Configured model not found. Pull it with ollama pull mistral.",
    required: true,
    blocksStudio: false,
  });

  const requiredPassed = checks.every((c) => (c.required && c.blocksStudio ? c.status === "pass" || c.status === "skip" : true));
  return { checks, allRequiredPassed: requiredPassed, apiHealthy };
}

export async function runPreflight(): Promise<PreflightResult> {
  const invoke = getInvoke();
  if (!invoke) return runWebPreflight();
  return invoke<PreflightResult>("preflight_checks");
}

export async function startStack() {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke("start_stack");
}

export async function stopStack() {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke("stop_stack");
}

export async function openLogsFolder() {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke("open_logs_folder");
}
