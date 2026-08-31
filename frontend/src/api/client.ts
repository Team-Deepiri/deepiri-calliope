import type { VocalRackPayload } from "../types/vocalRack";
import type { RecordingSession, RecordingFile, PluginInfo, AutotuneConfig } from "../types/audio";

const base = (import.meta.env.VITE_API_BASE ?? "").trim();

export type VoiceProcessResult = {
  channel_left: number[];
  channel_right: number[];
  sample_rate: number;
  metrics: Record<string, number>;
  truncated: boolean;
};

export type RouterProvider = "auto" | "ollama" | "openai" | "anthropic" | "openrouter" | "gemini";
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

export type AiVocalSynthesizeResult = {
  waveform: number[];
  sample_rate: number;
  duration_sec: number;
  output_file: string;
  recording_id: string | null;
  session_id: string | null;
  filename: string;
  source: "lyrics_svs" | "recording" | "demo_tone" | string;
  metrics: Record<string, unknown>;
  truncated: boolean;
};

export async function synthesizeAiVocal(body: {
  lyrics: string;
  voice_model?: string;
  tuning_strength?: number;
  arrangement_style?: string;
  vocal_style?: string;
  genre_preset?: string;
  genre_settings?: Record<string, unknown>;
  bpm?: number;
  session_id?: string | null;
  recording_id?: string | null;
  sample_rate?: number;
  signal?: AbortSignal;
}): Promise<AiVocalSynthesizeResult> {
  const { signal, ...payload } = body;
  const r = await fetch(`${base}/v1/ai-vocal/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<AiVocalSynthesizeResult>;
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
    signal: AbortSignal.timeout(180_000),
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(detail || `Generate failed (${r.status})`);
  }
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

export type AamatiMixSteer = {
  brightness: number;
  warmth: number;
  punch: number;
  stereo_width: number;
  target_lufs: number;
};

export type AamatiSteer = {
  mood: string;
  mood_score: number;
  source: string;
  bpm: number;
  key: string;
  scale_type: string;
  harmony_mood: string;
  drum_density: number;
  swing: number;
  fill_activity: number;
  mix: AamatiMixSteer;
  rationale: string;
};

export type AamatiArrangementSection = {
  name: string;
  start_bar: number;
  bars: number;
  instruments: string[];
  dynamics: string;
  chord_progression: number[][];
  energy: string;
  drum_density?: number;
};

export type AamatiArrangement = {
  prompt: string;
  bpm: number;
  key: string;
  scale: string;
  genre: string;
  mood: string;
  total_bars: number;
  estimated_duration_sec: number;
  drum_density: number;
  instrument_count: number;
  sections: AamatiArrangementSection[];
  chord_progression_summary: string[];
  melody_motif: Array<{ midi_note: number; start_beat: number; duration_beats: number }>;
};

export type AamatiComposeResult = {
  constrain: boolean;
  steer: AamatiSteer;
  ranked_moods: {
    mood: string;
    score: number;
    emoji?: string | null;
    table_summary?: string | null;
  }[];
  arrangement: AamatiArrangement;
  llm_block: string;
};

export async function composeFromAamati(text: string, constrain = true): Promise<AamatiComposeResult> {
  const r = await fetch(`${base}/v1/aamati/compose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, constrain }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<AamatiComposeResult>;
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

/** Autotune + dry-rap vocal chain; registers a new take in the session for timeline playback. */
export type RapStyle = "hard_tune" | "melodic_rap" | "natural";

export type BeatStyle =
  | "hiphop"
  | "trap"
  | "boom_bap"
  | "house"
  | "garage"
  | "lofi"
  | "breakbeat";

export type CommitRapTakeResult = {
  recording_id: string;
  session_id: string;
  filename: string;
  duration_sec: number;
  sample_rate: number;
  channels: number;
  detected_bpm?: number | null;
  bpm_confidence?: number;
  style?: RapStyle;
  applied_bpm?: number | null;
  stretched?: boolean;
  trimmed_leading_sec?: number;
};

export type CommitRapTakeOptions = {
  vocalRack?: VocalRackPayload;
  style?: RapStyle;
  targetBpm?: number;
  forceTargetBpm?: boolean;
  snapToTempo?: boolean;
  trimLeadingSilence?: boolean;
};

export async function commitRapTake(
  sessionId: string,
  sourceRecordingId: string,
  opts: CommitRapTakeOptions = {},
): Promise<CommitRapTakeResult> {
  const body: Record<string, unknown> = {
    source_recording_id: sourceRecordingId,
    style: opts.style ?? "melodic_rap",
  };
  if (opts.vocalRack) body.vocal_rack = opts.vocalRack;
  if (opts.targetBpm != null) body.target_bpm = opts.targetBpm;
  if (opts.forceTargetBpm != null) body.force_target_bpm = opts.forceTargetBpm;
  if (opts.snapToTempo != null) body.snap_to_tempo = opts.snapToTempo;
  if (opts.trimLeadingSilence != null) body.trim_leading_silence = opts.trimLeadingSilence;

  const r = await fetch(`${base}/v1/recordings/sessions/${sessionId}/commit-rap-take`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Generate a drum loop WAV via ai-generate and return as Blob. */
export async function fetchGeneratedDrumsBlob(
  bpm: number,
  durationBars = 16,
  genre: BeatStyle = "hiphop",
): Promise<Blob> {
  const gen = await fetch(`${base}/v1/ai-generate/drums`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: `${genre} beat`, bpm, duration: durationBars, genre }),
  });
  if (!gen.ok) throw new Error(await gen.text());
  const dl = await fetch(`${base}/v1/ai-generate/download/drums`);
  if (!dl.ok) throw new Error(await dl.text());
  return dl.blob();
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

export interface VocalEffectPreset {
  type: string;
  name: string;
  description: string;
  tags: string[];
  plugin_count: number;
}

export interface StudioSession {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  bpm: number;
  key: string;
  vocal_rack?: Record<string, unknown>;
  plugin_chain?: Array<{
    id: string;
    plugin_name: string;
    enabled: boolean;
    mix: number;
    parameters: Record<string, number>;
  }>;
  autotune_config?: Record<string, unknown>;
  recordings?: string[];
  audio_clips?: string[];
  prompt?: string;
  generation_settings?: Record<string, unknown>;
}

export async function listVocalEffectPresets(): Promise<{
  presets: VocalEffectPreset[];
  categories: string[];
}> {
  const r = await fetch(`${base}/v1/vocal-effects/presets`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function applyVocalEffect(
  recordingId: string,
  sessionId: string | undefined,
  effectType: string,
  dryWet = 1.0,
): Promise<{ output_file: string; duration_sec: number }> {
  const params = new URLSearchParams({
    recording_id: recordingId,
    effect_type: effectType,
    dry_wet: dryWet.toString(),
  });
  if (sessionId) params.append("session_id", sessionId);

  const r = await fetch(`${base}/v1/vocal-effects/apply?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function previewVocalEffect(
  samples: number[],
  effectType: string,
  sampleRate = 48000,
  dryWet = 1.0,
): Promise<{ samples: number[]; sample_rate: number; duration_sec: number }> {
  const r = await fetch(`${base}/v1/vocal-effects/preview?effect_type=${effectType}&dry_wet=${dryWet}&sample_rate=${sampleRate}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ samples }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createStudioSession(
  name: string,
  bpm = 120,
  key = "C",
): Promise<{ id: string; name: string; bpm: number; created_at?: string; track_count?: number }> {
  const r = await fetch(`${base}/v1/sessions/create?name=${encodeURIComponent(name)}&bpm=${bpm}&key=${key}`, {
    method: "POST",
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createSessionFromTemplate(
  name: string,
  template: string,
): Promise<{ id: string; name: string; created_at: string; bpm: number; key: string; track_count: number }> {
  const r = await fetch(`${base}/v1/sessions/create-from-template?name=${encodeURIComponent(name)}&template=${encodeURIComponent(template)}`, {
    method: "POST",
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function saveSession(
  sessionId: string,
): Promise<{ id: string; name: string; updated_at: string; saved: boolean }> {
  const r = await fetch(`${base}/v1/sessions/${sessionId}/save`, {
    method: "POST",
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getRecentSessions(limit = 10): Promise<{ recent: Array<{ id: string; name: string; bpm: number; key: string; track_count: number; updated_at: string }> }> {
  const r = await fetch(`${base}/v1/sessions/recent?limit=${limit}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getTemplates(): Promise<{ templates: Array<{ name: string; label: string; description: string; bpm: number; key: string; track_count: number }> }> {
  const r = await fetch(`${base}/v1/sessions/templates`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function freezeTrack(
  sessionId: string,
  trackId: string,
): Promise<{ id: string; track_id: string; frozen: boolean }> {
  const r = await fetch(`${base}/v1/sessions/${sessionId}/freeze-track?track_id=${trackId}`, {
    method: "POST",
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function exportStems(
  sessionId: string,
): Promise<{ session_id: string; session_name: string; stems: Array<{ track_id: string; track_name: string; track_type: string; clip_count: number }> }> {
  const r = await fetch(`${base}/v1/sessions/${sessionId}/export-stems`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function listStudioSessions(search?: string): Promise<{ sessions: StudioSession[] }> {
  const params = search ? `?search=${encodeURIComponent(search)}` : "";
  const r = await fetch(`${base}/v1/sessions/list${params}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getStudioSession(sessionId: string): Promise<StudioSession> {
  const r = await fetch(`${base}/v1/sessions/${sessionId}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<StudioSession>;
}

export async function updateStudioSession(
  sessionId: string,
  updates: { name?: string; bpm?: number; key?: string; prompt?: string },
): Promise<void> {
  const r = await fetch(`${base}/v1/sessions/${sessionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function deleteStudioSession(sessionId: string): Promise<{ status: string; session_id: string }> {
  const r = await fetch(`${base}/v1/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function visualizeRecording(
  recordingId: string,
  sessionId?: string,
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams({ recording_id: recordingId });
  if (sessionId) params.append("session_id", sessionId);
  
  const r = await fetch(`${base}/v1/visualize/recording/${recordingId}?${params}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function separateStems(
  recordingId: string,
  sessionId?: string,
  stemTypes?: string[],
): Promise<{ recording_id: string; stems: Record<string, string>; stem_count: number }> {
  const body: Record<string, unknown> = { recording_id: recordingId };
  if (sessionId) body.session_id = sessionId;
  if (stemTypes) body.stem_types = stemTypes;

  const r = await fetch(`${base}/v1/stems/separate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function extractVocals(
  recordingId: string,
  sessionId?: string,
): Promise<{ recording_id: string; output_file: string; duration_sec: number }> {
  const body: Record<string, unknown> = { recording_id: recordingId };
  if (sessionId) body.session_id = sessionId;

  const r = await fetch(`${base}/v1/stems/extract-vocals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export interface BatchProcessItem {
  recording_id: string;
  session_id?: string;
  vocal_rack?: Record<string, unknown>;
  plugins?: Array<{
    plugin_name: string;
    parameters?: Record<string, number>;
  }>;
  autotune?: Record<string, unknown>;
  effects?: string[];
}

export async function batchProcess(
  items: BatchProcessItem[],
  parallel = true,
): Promise<{
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    recording_id: string;
    status: string;
    output_files?: string[];
    error?: string;
  }>;
}> {
  const r = await fetch(`${base}/v1/batch/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, parallel }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function batchApplyPreset(
  recordingIds: string[],
  sessionId: string | undefined,
  presetId: string | undefined,
): Promise<{
  total: number;
  successful: number;
  failed: number;
  preset_name: string;
  results: Array<{
    recording_id: string;
    status: string;
    output_file?: string;
    error?: string;
  }>;
}> {
  const body: Record<string, unknown> = { recording_ids: recordingIds };
  if (sessionId) body.session_id = sessionId;
  if (presetId) body.preset_id = presetId;

  const r = await fetch(`${base}/v1/batch/apply-preset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function exportMidiFromRecording(
  recordingId: string,
  sessionId: string | undefined,
  threshold = 0.5,
): Promise<{
  recording_id: string;
  midi_file: string;
  note_count: number;
  duration_sec: number;
  notes: string[];
}> {
  const params = new URLSearchParams({ recording_id: recordingId, threshold: threshold.toString() });
  if (sessionId) params.append("session_id", sessionId);

  const r = await fetch(`${base}/v1/midi/export/audio?${params}`, { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function importMidiFile(
  fileId: string | undefined,
  filePath: string | undefined,
): Promise<{
  format: number;
  tracks: number;
  ticks_per_beat: number;
  track_data: Array<{
    events: Array<{
      time: number;
      note: number;
      velocity: number;
      duration: number;
    }>;
    note_count: number;
  }>;
}> {
  const body: Record<string, unknown> = {};
  if (fileId) body.file_id = fileId;
  if (filePath) body.file_path = filePath;

  const r = await fetch(`${base}/v1/midi/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export interface ExportPreset {
  type: string;
  format: string;
  sample_rate: number;
  bit_depth: number;
  channels: number;
  bitrate: number | null;
  loudness_target: number | null;
}

export async function listExportPresets(): Promise<{ presets: ExportPreset[] }> {
  const r = await fetch(`${base}/v1/export/presets`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function applyExportPreset(
  recordingId: string,
  presetType: string,
  sessionId?: string,
): Promise<{
  output_file: string;
  preset: string;
  format: string;
  sample_rate: number;
  duration_sec: number;
  size_bytes: number;
}> {
  const body: Record<string, unknown> = { recording_id: recordingId, preset_type: presetType };
  if (sessionId) body.session_id = sessionId;

  const r = await fetch(`${base}/v1/export/apply-preset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function autoMixRecording(
  recordingId: string,
  sessionId: string | undefined,
  targetLufs = -14,
  brightness = 0.5,
  warmth = 0.3,
  punch = 0.5,
  stereoWidth = 1.0,
): Promise<{
  output_file: string;
  input_rms_dbfs: number;
  output_rms_dbfs: number;
  dynamic_range_change_db: number;
}> {
  const body: Record<string, unknown> = {
    recording_id: recordingId,
    target_lufs: targetLufs,
    brightness,
    warmth,
    punch,
    stereo_width: stereoWidth,
  };
  if (sessionId) body.session_id = sessionId;

  const r = await fetch(`${base}/v1/ai-mix/auto-mix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function autoMasterRecording(
  recordingId: string,
  sessionId: string | undefined,
  style = "balanced",
): Promise<{
  output_file: string;
  input_lufs: number;
  output_lufs: number;
}> {
  const body: Record<string, unknown> = { recording_id: recordingId, style };
  if (sessionId) body.session_id = sessionId;

  const r = await fetch(`${base}/v1/ai-mix/auto-master`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export interface SynthPreset {
  name: string;
  oscillators: number;
  filter: string;
}

export async function listSynthPresets(): Promise<{ presets: SynthPreset[] }> {
  const r = await fetch(`${base}/v1/synth/presets`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function generateSynthNote(
  preset: string,
  midiNote: number,
  duration: number,
  velocity = 1.0,
): Promise<{
  frequency_hz: number;
  duration_sec: number;
  output_file: string;
}> {
  const r = await fetch(`${base}/v1/synth/generate/note`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preset, midi_note: midiNote, duration, velocity }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export interface MonitoringData {
  level: {
    level_dbfs: number;
    peak_dbfs: number;
    segments: string[];
    level_percent: number;
  };
  vu: {
    left_vu: number;
    right_vu: number;
  };
  loudness: {
    integrated_lufs: number;
    short_term_lufs: number;
    momentary_lufs: number;
  };
  stereo: {
    correlation: number;
    width: number;
  };
}

export async function getMonitoringData(
  recordingId: string,
  sessionId?: string,
): Promise<MonitoringData> {
  const params = new URLSearchParams({ recording_id: recordingId });
  if (sessionId) params.append("session_id", sessionId);

  const r = await fetch(`${base}/v1/monitor/recording/${recordingId}?${params}`);
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).monitoring as MonitoringData;
}

export async function sliceRecording(
  recordingId: string,
  sessionId: string | undefined,
  method: string,
  sensitivity: number,
): Promise<{
  recording_id: string;
  slices: Array<{ position_sec: number; type: string }>;
  slice_count: number;
}> {
  const body: Record<string, unknown> = {
    recording_id: recordingId,
    method,
    sensitivity,
  };
  if (sessionId) body.session_id = sessionId;

  const r = await fetch(`${base}/v1/loops/slice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function detectTempo(
  recordingId: string,
  sessionId: string | undefined,
): Promise<{
  recording_id: string;
  tempo_bpm: number;
  confidence: number;
  beat_count: number;
  swing: number;
}> {
  const body: Record<string, unknown> = { recording_id: recordingId };
  if (sessionId) body.session_id = sessionId;

  const r = await fetch(`${base}/v1/loops/detect-tempo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function warpTempo(
  recordingId: string,
  sourceTempo: number,
  targetTempo: number,
  mode: string,
  sessionId?: string,
): Promise<{
  output_file: string;
  source_tempo: number;
  target_tempo: number;
  stretch_factor: number;
}> {
  const body: Record<string, unknown> = {
    recording_id: recordingId,
    source_tempo: sourceTempo,
    target_tempo: targetTempo,
    mode,
  };
  if (sessionId) body.session_id = sessionId;

  const r = await fetch(`${base}/v1/loops/warp-tempo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createAutomationTrack(name: string, minValue = 0, maxValue = 1): Promise<{ status: string; track_name: string }> {
  const r = await fetch(`${base}/v1/automation/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, min_value: minValue, max_value: maxValue }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function addAutomationPoint(
  trackName: string,
  timeMs: number,
  value: number,
  curve = "linear",
): Promise<{ status: string; track_name: string }> {
  const r = await fetch(`${base}/v1/automation/track/${encodeURIComponent(trackName)}/point`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ time_ms: timeMs, value, curve }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getAutomationTrack(trackName: string): Promise<{
  name: string;
  min_value: number;
  max_value: number;
  points: { time_ms: number; value: number; curve: string }[];
}> {
  const r = await fetch(`${base}/v1/automation/track/${encodeURIComponent(trackName)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function generateEnvelope(
  trackName: string,
  durationMs: number,
  sampleRate = 48000,
): Promise<{ track_name: string; envelope: number[]; duration_ms: number; sample_rate: number }> {
  const r = await fetch(`${base}/v1/automation/track/${encodeURIComponent(trackName)}/envelope`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_name: trackName, duration_ms: durationMs, sample_rate: sampleRate }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function applyAutomation(
  trackName: string,
  samples: number[],
  sampleRate = 48000,
): Promise<{ samples: number[]; sample_rate: number }> {
  const r = await fetch(`${base}/v1/automation/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_name: trackName, samples, sample_rate: sampleRate }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function generateLFO(
  numSamples: number,
  frequency = 1.0,
  waveform = "sine",
  amplitude = 1.0,
  offset = 0.0,
): Promise<{ signal: number[] }> {
  const r = await fetch(`${base}/v1/automation/lfo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ num_samples: numSamples, frequency, waveform, amplitude, offset }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function generateADSR(
  numSamples: number,
  attackMs = 10,
  decayMs = 100,
  sustainLevel = 0.7,
  releaseMs = 200,
  gateOn?: number,
  gateOff?: number,
): Promise<{ envelope: number[] }> {
  const r = await fetch(`${base}/v1/automation/adsr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      num_samples: numSamples,
      attack_ms: attackMs,
      decay_ms: decayMs,
      sustain_level: sustainLevel,
      release_ms: releaseMs,
      gate_on: gateOn,
      gate_off: gateOff,
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function generateSidechain(
  audio: number[],
  attackMs = 5.0,
  releaseMs = 50.0,
  threshold = 0.1,
  depth = 0.5,
  ceiling = 1.0,
): Promise<{ envelope: number[] }> {
  const r = await fetch(`${base}/v1/automation/sidechain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio,
      attack_ms: attackMs,
      release_ms: releaseMs,
      threshold,
      depth,
      ceiling,
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function listAutomationTracks(): Promise<{
  tracks: { name: string; point_count: number; min_value: number; max_value: number }[];
}> {
  const r = await fetch(`${base}/v1/automation/tracks`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteAutomationTrack(trackName: string): Promise<{ status: string; track_name: string }> {
  const r = await fetch(`${base}/v1/automation/track/${encodeURIComponent(trackName)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function generateModulationLFO(
  numSamples: number,
  waveform = "sine",
  frequency = 1.0,
  amplitude = 1.0,
  offset = 0.0,
): Promise<{ signal: number[]; waveform: string }> {
  const r = await fetch(`${base}/v1/modulation/lfo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ num_samples: numSamples, waveform, frequency, amplitude, offset }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function applyModulation(
  audio: number[],
  carrier: number[],
  depth = 1.0,
  mode: "multiply" | "add" | "ring" = "multiply",
): Promise<{ samples: number[]; mode: string }> {
  const r = await fetch(`${base}/v1/modulation/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio, carrier, depth, mode }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function listModulationWaveforms(): Promise<{ waveforms: string[] }> {
  const r = await fetch(`${base}/v1/modulation/waveforms`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createSlicedRack(
  recordingId: string,
  targetTempo: number,
  sessionId?: string,
): Promise<{
  output_file: string;
  slice_count: number;
}> {
  const body: Record<string, unknown> = {
    recording_id: recordingId,
    target_tempo: targetTempo,
  };
  if (sessionId) body.session_id = sessionId;

  const r = await fetch(`${base}/v1/loops/create-sliced-rack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function addRoutingNode(sessionId: string, type: string, name: string): Promise<{ id: string; type: string; name: string }> {
  const r = await fetch(`${base}/v1/routing/node`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, type, name }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function removeRoutingNode(nodeId: string, sessionId = "default"): Promise<{ status: string; node_id: string }> {
  const r = await fetch(`${base}/v1/routing/node/${nodeId}?session_id=${sessionId}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function connectRoutingNodes(sessionId: string, fromId: string, toId: string): Promise<{ status: string; from: string; to: string }> {
  const r = await fetch(`${base}/v1/routing/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, from_id: fromId, to_id: toId }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function disconnectRoutingNodes(sessionId: string, fromId: string, toId: string): Promise<{ status: string; from: string; to: string }> {
  const r = await fetch(`${base}/v1/routing/disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, from_id: fromId, to_id: toId }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getRoutingGraph(sessionId = "default"): Promise<Record<string, unknown>> {
  const r = await fetch(`${base}/v1/routing/graph?session_id=${sessionId}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function renderAudioGraph(sessionId = "default", durationSec = 10.0): Promise<{ duration_sec: number; sample_rate: number; samples: number[]; channels: number }> {
  const r = await fetch(`${base}/v1/routing/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, duration_sec: durationSec }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createAudioBus(sessionId: string, name: string, volume = 1.0): Promise<{ id: string; name: string; volume: number }> {
  const r = await fetch(`${base}/v1/routing/bus`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, name, volume }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createFxSend(sessionId: string, name: string, level = 0.5, sourceId = "", destinationId = ""): Promise<{ id: string; name: string; level: number }> {
  const r = await fetch(`${base}/v1/routing/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, name, level, source_id: sourceId, destination_id: destinationId }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function removeFxSend(sendId: string, sessionId = "default"): Promise<{ status: string; send_id: string }> {
  const r = await fetch(`${base}/v1/routing/send/${sendId}?session_id=${sessionId}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createVCAGroup(sessionId: string, name: string, volume = 1.0): Promise<{ id: string; name: string; volume: number }> {
  const r = await fetch(`${base}/v1/routing/vca`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, name, volume }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function assignTrackToVCA(vcaId: string, trackId: string, sessionId = "default"): Promise<{ status: string; track_id: string; vca_id: string }> {
  const r = await fetch(`${base}/v1/routing/vca/${vcaId}/assign/${trackId}?session_id=${sessionId}`, { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── AI Generation ──────────────────────────────────────────────

export async function aiGenerateMelody(body: {
  prompt: string; bpm?: number; key?: string; scale?: string; genre?: string; duration_bars?: number;
}): Promise<{ samples: number[]; sample_rate: number; duration_sec: number }> {
  const r = await fetch(`${base}/v1/ai-generate/melody`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function aiGenerateChords(body: {
  prompt: string; bpm?: number; key?: string; genre?: string; length?: number; complexity?: string;
}): Promise<{ chords: string[]; progression: string[] }> {
  const r = await fetch(`${base}/v1/ai-generate/chords`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function aiGenerateDrums(body: {
  prompt: string; bpm?: number; pattern_type?: string; length?: number;
}): Promise<{ samples: number[]; sample_rate: number; pattern: string }> {
  const r = await fetch(`${base}/v1/ai-generate/drums`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function aiGenerateFull(body: {
  prompt: string; bpm?: number; key?: string; scale?: string; genre?: string; duration_bars?: number;
}): Promise<{ samples: number[]; sample_rate: number; duration_sec: number; stem_files?: Record<string, string> }> {
  const r = await fetch(`${base}/v1/ai-generate/full`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function aiGenerateStems(body: {
  prompt: string; bpm?: number; key?: string; stem_types?: string[];
}): Promise<{ stems: Record<string, number[]>; sample_rate: number }> {
  const r = await fetch(`${base}/v1/ai-generate/stems`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function aiTransferStyle(body: {
  content_base64?: string; style_base64?: string; strength?: number;
}): Promise<{ samples: number[]; sample_rate: number }> {
  const r = await fetch(`${base}/v1/ai-generate/transfer-style`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── Loop Library ───────────────────────────────────────────────

export interface LoopLibraryEntry {
  id: string; name: string; bpm: number; key: string; category: string; tags: string[];
  duration: number; path: string; bars: number;
}

export async function getLoopLibraryCategories(): Promise<{ categories: string[] }> {
  const r = await fetch(`${base}/v1/loops/library/categories`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function searchLoopLibrary(params: {
  query?: string; bpm_min?: number; bpm_max?: number; key?: string; category?: string; tags?: string[];
}): Promise<{ loops: LoopLibraryEntry[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.query) qs.append("query", params.query);
  if (params.bpm_min) qs.append("bpm_min", String(params.bpm_min));
  if (params.bpm_max) qs.append("bpm_max", String(params.bpm_max));
  if (params.key) qs.append("key", params.key);
  if (params.category) qs.append("category", params.category);
  if (params.tags) qs.append("tags", params.tags.join(","));
  const r = await fetch(`${base}/v1/loops/library/search?${qs}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getLoopLibraryEntry(loopId: string): Promise<LoopLibraryEntry> {
  const r = await fetch(`${base}/v1/loops/library/${loopId}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getLoopAudioUrl(loopId: string): Promise<string> {
  const r = await fetch(`${base}/v1/loops/library/${loopId}/audio`);
  if (!r.ok) throw new Error(await r.text());
  return r.url;
}

export async function getSimilarLoops(loopId: string): Promise<{ loops: LoopLibraryEntry[] }> {
  const r = await fetch(`${base}/v1/loops/library/similar/${loopId}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function scanLoopDirectory(): Promise<{ scanned: number; imported: number; loops: LoopLibraryEntry[] }> {
  const r = await fetch(`${base}/v1/loops/library/scan`, { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── Audio Formats ──────────────────────────────────────────────

export interface FormatInfo {
  format: string; extension: string; mime_type: string; lossless: boolean;
  default_sample_rates: number[]; default_bit_depths?: number[]; description: string;
}

export async function convertAudioFormat(body: {
  file: string; target_format: string; sample_rate?: number; bit_depth?: number;
}): Promise<{ output_file: string; format: string; sample_rate: number; size_bytes: number }> {
  const r = await fetch(`${base}/v1/formats/convert`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getSupportedFormats(): Promise<{ formats: FormatInfo[] }> {
  const r = await fetch(`${base}/v1/formats/supported`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function analyzeAudioFile(body: { file: string }): Promise<{
  format: string; duration_sec: number; sample_rate: number; channels: number;
  bit_depth?: number; bitrate?: number; size_bytes: number;
}> {
  const r = await fetch(`${base}/v1/formats/analyze`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── EQ Processing ──────────────────────────────────────────────

export interface EQBand {
  frequency: number; gain: number; q: number; type: "low_shelf" | "high_shelf" | "peaking" | "high_pass" | "low_pass";
}

export async function processEQ(body: {
  samples: number[]; sample_rate: number; bands: EQBand[];
}): Promise<{ samples: number[]; sample_rate: number; applied_bands: number }> {
  const r = await fetch(`${base}/v1/eq/process`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getEQPresets(): Promise<{ presets: Array<{ name: string; bands: EQBand[] }> }> {
  const r = await fetch(`${base}/v1/eq/presets`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function analyzeFrequencyContent(body: {
  samples: number[]; sample_rate: number;
}): Promise<{ low_ratio: number; mid_ratio: number; high_ratio: number; bands: Array<{ freq: number; magnitude: number }> }> {
  const r = await fetch(`${base}/v1/eq/analyze`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── Pitch Processing ───────────────────────────────────────────

export async function pitchShift(body: {
  samples: number[]; sample_rate: number; semitones: number; formant_correct?: boolean;
}): Promise<{ samples: number[]; sample_rate: number }> {
  const r = await fetch(`${base}/v1/pitch/shift`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function detectPitch(body: {
  samples: number[]; sample_rate: number;
}): Promise<{ f0: number[]; confidence: number[]; notes: string[] }> {
  const r = await fetch(`${base}/v1/pitch/detect`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function correctPitch(body: {
  samples: number[]; sample_rate: number; scale?: string; root_midi?: number; strength?: number;
}): Promise<{ samples: number[]; sample_rate: number; correction_amount: number[] }> {
  const r = await fetch(`${base}/v1/pitch/correct`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── MIDI Learn ─────────────────────────────────────────────────

export interface MidiMapping {
  id: string;
  controller_name: string;
  parameter_path: string;
  midi_channel: number;
  cc_number: number;
  min_range: number;
  max_range: number;
  curve_type: string;
}

export async function listMidiMappings(): Promise<{ mappings: MidiMapping[]; total: number }> {
  const r = await fetch(`${base}/v1/midi-learn/mappings`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createMidiMapping(body: {
  controller_name: string;
  parameter_path: string;
  midi_channel?: number;
  cc_number?: number;
  min_range?: number;
  max_range?: number;
  curve_type?: string;
}): Promise<MidiMapping> {
  const r = await fetch(`${base}/v1/midi-learn/map`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteMidiMapping(mappingId: string): Promise<{ status: string }> {
  const r = await fetch(`${base}/v1/midi-learn/map/${encodeURIComponent(mappingId)}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function setMidiLearnMode(enabled: boolean): Promise<{ learn_mode: boolean }> {
  const r = await fetch(`${base}/v1/midi-learn/learn-mode?enabled=${enabled}`, { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
