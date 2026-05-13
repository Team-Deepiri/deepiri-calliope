const base = "";

export async function fetchHealth() {
  const r = await fetch(`${base}/health`);
  if (!r.ok) throw new Error("health failed");
  return r.json() as Promise<{ status: string; service: string }>;
}

export async function fetchOllamaStatus() {
  const r = await fetch(`${base}/v1/ollama/status`);
  if (!r.ok) throw new Error("ollama status failed");
  return r.json() as Promise<Record<string, unknown>>;
}

export async function generatePlan(prompt: string) {
  const r = await fetch(`${base}/v1/generate/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ model: string; response: string }>;
}
