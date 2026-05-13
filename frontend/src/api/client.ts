import type { VocalRackPayload } from "../types/vocalRack";
import type { RecordingSession, RecordingFile, PluginInfo, AutotuneConfig } from "../types/audio";

const base = "";

export type VoiceProcessResult = {
  channel_left: number[];
  channel_right: number[];
  sample_rate: number;
  metrics: Record<string, number>;
  truncated: boolean;
};

export type RouterProvider = "auto" | "ollama" | "openai" | "anthropic" | "openrouter";
export type GenerateDepth = "standard" | "deep";

export async function processVoiceUnit(body: {
  samples: number[];
  sample_rate: number;
  demo_tone_hz?: number | null;
  rack: VocalRackPayload;
  output_stereo?: boolean;
  max_return_samples?: number;
}): Promise<VoiceProcessResult> {
  const r = await fetch(`${base}/v1/voice/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      samples: body.samples,
      sample_rate: body.sample_rate,
      demo_tone_hz: body.demo_tone_hz ?? null,
      rack: body.rack,
      output_stereo: body.output_stereo ?? true,
      max_return_samples: body.max_return_samples ?? 96_000,
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<VoiceProcessResult>;
}

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
    vocal_rack?: VocalRackPayload | null;
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
  if (opts?.vocal_rack) body.vocal_rack = opts.vocal_rack;

  const r = await fetch(`${base}/v1/generate/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ model: string; response: string; provider: string; depth: GenerateDepth }>;
}

export async function alignAamati(text: string) {
  const r = await fetch(`${base}/v1/aamati/align`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{
    brief: Record<string, unknown>;
    ranked_moods: {
      mood: string;
      score: number;
      emoji?: string | null;
      feature_targets: Record<string, string>;
      table_summary?: string | null;
    }[];
    ontology_version: string;
    onnx_mood: string | null;
    onnx_probabilities: Record<string, number> | null;
  }>;
}

export async function createRecordingSession(name: string, sampleRate = 48000, channels = 2): Promise<RecordingSession> {
  const r = await fetch(`${base}/v1/recordings/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, sample_rate: sampleRate, channels }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<RecordingSession>;
}

export async function getRecordingSession(sessionId: string): Promise<RecordingSession> {
  const r = await fetch(`${base}/v1/recordings/sessions/${sessionId}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<RecordingSession>;
}

export async function uploadRecordingFile(
  sessionId: string,
  file: File,
  trackType = "vocal",
): Promise<{ recording_id: string; filename: string; duration_sec: number }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("track_type", trackType);

  const r = await fetch(`${base}/v1/recordings/sessions/${sessionId}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function listSessionFiles(sessionId: string): Promise<RecordingFile[]> {
  const r = await fetch(`${base}/v1/recordings/sessions/${sessionId}/files`);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<RecordingFile[]>;
}

export async function processRecording(
  recordingId: string,
  sessionId: string,
  vocalRack?: VocalRackPayload,
): Promise<{
  output_file: string;
  duration_sec: number;
  sample_rate: number;
  metrics: Record<string, number>;
}> {
  const body: Record<string, unknown> = { recording_id: recordingId, session_id: sessionId };
  if (vocalRack) body.vocal_rack = vocalRack;

  const r = await fetch(`${base}/v1/recordings/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function applyAutotune(
  recordingId: string,
  sessionId: string,
  config: AutotuneConfig,
): Promise<{
  output_file: string;
  original_f0: number[];
  corrected_f0: number[];
  confidence: number[];
  correction_amount_cents: number[];
}> {
  const r = await fetch(`${base}/v1/plugins/autotune/process?recording_id=${recordingId}&session_id=${sessionId}&mode=${config.mode}&scale_type=${config.scale_type}&root_midi=${config.root_midi}&strength=${config.strength}&speed=${config.speed}&formant_correction=${config.formant_correction}`, {
    method: "POST",
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function listPlugins(category?: string): Promise<{ plugins: PluginInfo[]; categories: string[] }> {
  const url = category ? `${base}/v1/plugins/list?category=${category}` : `${base}/v1/plugins/list`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ plugins: PluginInfo[]; categories: string[] }>;
}

export async function processWithPluginChain(
  samples: number[],
  sr: number,
  plugins: { plugin_name: string; parameters: { name: string; value: number }[]; enabled: boolean; mix: number }[],
): Promise<{ samples: number[]; sample_rate: number; length: number }> {
  const r = await fetch(`${base}/v1/plugins/chain/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ samples, sr, chain: { plugins } }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function uploadAudioClip(
  file: File,
  name?: string,
  category = "reference",
  description?: string,
): Promise<{
  clip_id: string;
  name: string;
  filename: string;
  category: string;
  duration_sec: number;
  sample_rate: number;
  channels: number;
}> {
  const formData = new FormData();
  formData.append("file", file);
  if (name) formData.append("name", name);
  formData.append("category", category);
  if (description) formData.append("description", description);

  const r = await fetch(`${base}/v1/music/clips/upload`, {
    method: "POST",
    body: formData,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function listAudioClips(
  category?: string,
  search?: string,
): Promise<{ clips: AudioClip[]; total: number }> {
  const params = new URLSearchParams();
  if (category) params.append("category", category);
  if (search) params.append("search", search);

  const r = await fetch(`${base}/v1/music/clips?${params}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getAudioClip(clipId: string): Promise<AudioClip> {
  const r = await fetch(`${base}/v1/music/clips/${clipId}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteAudioClip(clipId: string): Promise<void> {
  const r = await fetch(`${base}/v1/music/clips/${clipId}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
}

export async function analyzeAudioClip(clipId: string): Promise<{
  clip_id: string;
  tempo_bpm: number;
  tempo_confidence: number;
  duration_sec: number;
  rms_dbfs: number;
  peak_dbfs: number;
  spectral_centroid: number;
  spectral_rolloff: number;
  spectral_flatness: number;
  zero_crossing_rate: number;
}> {
  const r = await fetch(`${base}/v1/music/clips/${clipId}/analyze`, { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function extractAudioFeatures(
  clipId: string,
  featureType: "melody" | "rhythm" | "timbre" = "melody",
): Promise<Record<string, unknown>> {
  const r = await fetch(`${base}/v1/music/clips/${clipId}/extract?feature_type=${featureType}`, {
    method: "POST",
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export interface AudioClip {
  id: string;
  name: string;
  category: string;
  description: string;
  duration_sec: number;
  sample_rate: number;
  channels: number;
  format: string;
}
