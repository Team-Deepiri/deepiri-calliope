const base = "";

export type RouterProvider = "auto" | "ollama" | "openai" | "anthropic" | "openrouter";
export type GenerateDepth = "standard" | "deep";

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

export async function fetchRouterProviders() {
  const r = await fetch(`${base}/v1/router/providers`);
  if (!r.ok) throw new Error("router providers failed");
  return r.json() as Promise<{
    openai: boolean;
    anthropic: boolean;
    openrouter: boolean;
    ollama: boolean;
    defaults: Record<string, string>;
  }>;
}

export type MusicAnalyzeResult = {
  tempo_bpm: number | null;
  tempo_confidence: number;
  genres: string[];
  swing_bias: number;
  energy: number;
  valence: number;
  complexity: number;
  total_bars: number;
  sections: { name: string; bars: number; role: string }[];
};

export async function analyzeBrief(text: string) {
  const r = await fetch(`${base}/v1/music/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<MusicAnalyzeResult>;
}

export async function generatePlan(
  prompt: string,
  opts?: {
    model?: string;
    provider?: RouterProvider;
    depth?: GenerateDepth;
    genre?: string;
    bpm_hint?: number;
  },
) {
  const body: Record<string, unknown> = {
    prompt,
    provider: opts?.provider ?? "auto",
    depth: opts?.depth ?? "standard",
  };
  if (opts?.model?.trim()) body.model = opts.model.trim();
  if (opts?.genre?.trim()) body.genre = opts.genre.trim();
  if (opts?.bpm_hint != null && opts.bpm_hint > 0) body.bpm_hint = opts.bpm_hint;

  const r = await fetch(`${base}/v1/generate/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ model: string; response: string; provider: string; depth: GenerateDepth }>;
}
