export type VocalRole =
  | "instrumental_focus"
  | "single_lead"
  | "stacked_doubles"
  | "call_and_response"
  | "choir_gang"
  | "whisper_layer"
  | "spoken_wordcut"
  | "vocoder_synth";

/** Full Calliope rack — architect prompt + Voice Unit DSP. */
export type VocalRackPayload = {
  role: VocalRole;
  breath_air: number;
  chest_body: number;
  presence_bite: number;
  de_esser: number;
  saturation_drive: number;
  width_stereo: number;
  room_send: number;
  delay_throw: number;
  tune_tightness: number;
  formant_shift: number;
  warmth_low: number;
  brilliance_air: number;
  punch_snap: number;
  verb_predelay: number;
  motion_blur: number;
  grit_parallel: number;
};

export const DEFAULT_VOCAL_RACK: VocalRackPayload = {
  role: "single_lead",
  breath_air: 32,
  chest_body: 58,
  presence_bite: 46,
  de_esser: 52,
  saturation_drive: 22,
  width_stereo: 42,
  room_send: 28,
  delay_throw: 18,
  tune_tightness: 74,
  formant_shift: 50,
  warmth_low: 50,
  brilliance_air: 48,
  punch_snap: 52,
  verb_predelay: 38,
  motion_blur: 22,
  grit_parallel: 26,
};

export const VOCAL_ROLE_OPTIONS: { value: VocalRole; label: string; hint: string }[] = [
  { value: "instrumental_focus", label: "Instrumental", hint: "Vocals sparse or off" },
  { value: "single_lead", label: "Lead", hint: "One centred voice" },
  { value: "stacked_doubles", label: "Stacks", hint: "Unison doubles & wideners" },
  { value: "call_and_response", label: "Call / rsp", hint: "Antiphonal phrases" },
  { value: "choir_gang", label: "Gang vox", hint: "Group shouts & pads" },
  { value: "whisper_layer", label: "Whisper", hint: "Intimate air layer" },
  { value: "spoken_wordcut", label: "Spoken", hint: "Dry talk / rap bias" },
  { value: "vocoder_synth", label: "Vocoder", hint: "Robot carrier + modulator" },
];

export const VOCAL_PRESETS: Record<string, VocalRackPayload> = {
  arena_belt: {
    ...DEFAULT_VOCAL_RACK,
    role: "single_lead",
    breath_air: 22,
    chest_body: 72,
    presence_bite: 68,
    de_esser: 48,
    saturation_drive: 35,
    width_stereo: 38,
    room_send: 42,
    delay_throw: 24,
    tune_tightness: 78,
    formant_shift: 52,
    warmth_low: 62,
    brilliance_air: 44,
    punch_snap: 72,
    verb_predelay: 28,
    motion_blur: 18,
    grit_parallel: 32,
  },
  bedroom_lofi: {
    ...DEFAULT_VOCAL_RACK,
    role: "whisper_layer",
    breath_air: 62,
    chest_body: 48,
    presence_bite: 32,
    de_esser: 58,
    saturation_drive: 38,
    width_stereo: 55,
    room_send: 48,
    delay_throw: 28,
    tune_tightness: 55,
    formant_shift: 44,
    warmth_low: 58,
    brilliance_air: 55,
    punch_snap: 35,
    verb_predelay: 55,
    motion_blur: 38,
    grit_parallel: 40,
  },
  hyperpop_gloss: {
    ...DEFAULT_VOCAL_RACK,
    role: "vocoder_synth",
    breath_air: 48,
    chest_body: 40,
    presence_bite: 72,
    de_esser: 62,
    saturation_drive: 28,
    width_stereo: 78,
    room_send: 22,
    delay_throw: 36,
    tune_tightness: 92,
    formant_shift: 68,
    warmth_low: 42,
    brilliance_air: 72,
    punch_snap: 68,
    verb_predelay: 22,
    motion_blur: 55,
    grit_parallel: 22,
  },
  dry_rap_punch: {
    ...DEFAULT_VOCAL_RACK,
    role: "spoken_wordcut",
    breath_air: 18,
    chest_body: 64,
    presence_bite: 58,
    de_esser: 68,
    saturation_drive: 42,
    width_stereo: 28,
    room_send: 12,
    delay_throw: 10,
    tune_tightness: 62,
    formant_shift: 48,
    warmth_low: 55,
    brilliance_air: 32,
    punch_snap: 78,
    verb_predelay: 15,
    motion_blur: 12,
    grit_parallel: 48,
  },
};
