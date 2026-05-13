export interface RecordingSession {
  id: string;
  name: string;
  created_at: string;
  sample_rate: number;
  channels: number;
  status: string;
  file_count: number;
  duration_sec: number;
}

export interface RecordingFile {
  id: string;
  filename: string;
  original_name: string;
  format: string;
  duration_sec: number;
  track_type: string;
  uploaded_at: string;
}

export interface PluginParameter {
  name: string;
  min: number;
  max: number;
  default: number;
  unit: string;
  description: string;
}

export interface PluginInfo {
  name: string;
  version: string;
  category: string;
  description: string;
  author: string;
  parameters: PluginParameter[];
  sidechain_enabled: boolean;
  realtime_safe: boolean;
}

export interface PluginInstance {
  plugin_name: string;
  parameters: { name: string; value: number }[];
  enabled: boolean;
  mix: number;
}

export interface PluginChain {
  plugins: PluginInstance[];
}

export interface AutotuneConfig {
  mode: "auto" | "hard" | "soft" | "melodic";
  scale_type: "major" | "minor" | "harmonic_minor" | "melodic_minor" | "dorian" | "mixolydian" | "blues" | "pentatonic_major" | "pentatonic_minor" | "chromatic";
  root_midi: number;
  strength: number;
  speed: number;
  formant_correction: boolean;
  formant_preserve?: number;
}

export interface WaveformData {
  peaks: number[];
  duration: number;
  sampleRate: number;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  sessionId: string | null;
}

export const DEFAULT_AUTOTUNE_CONFIG: AutotuneConfig = {
  mode: "auto",
  scale_type: "major",
  root_midi: 60,
  strength: 1.0,
  speed: 0.5,
  formant_correction: true,
};

export const PLUGIN_CATEGORIES = [
  { value: "filter", label: "Filters" },
  { value: "dynamics", label: "Dynamics" },
  { value: "eq", label: "EQ" },
  { value: "reverb", label: "Reverb" },
  { value: "delay", label: "Delay" },
  { value: "distortion", label: "Distortion" },
  { value: "modulation", label: "Modulation" },
  { value: "pitch", label: "Pitch" },
  { value: "utility", label: "Utility" },
];

export const SCALE_TYPES = [
  { value: "major", label: "Major" },
  { value: "minor", label: "Minor" },
  { value: "harmonic_minor", label: "Harmonic Minor" },
  { value: "melodic_minor", label: "Melodic Minor" },
  { value: "dorian", label: "Dorian" },
  { value: "mixolydian", label: "Mixolydian" },
  { value: "blues", label: "Blues" },
  { value: "pentatonic_major", label: "Pentatonic Major" },
  { value: "pentatonic_minor", label: "Pentatonic Minor" },
  { value: "chromatic", label: "Chromatic" },
];

export const AUTOTUNE_MODES = [
  { value: "auto", label: "Auto", hint: "Natural correction" },
  { value: "hard", label: "Hard", hint: "Aggressive snap" },
  { value: "soft", label: "Soft", hint: "Gentle smoothing" },
  { value: "melodic", label: "Melodic", hint: "Vocal-friendly" },
];