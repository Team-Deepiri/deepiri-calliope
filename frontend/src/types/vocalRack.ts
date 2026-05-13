export type VocalRole =
  | "instrumental_focus"
  | "single_lead"
  | "stacked_doubles"
  | "call_and_response"
  | "choir_gang"
  | "whisper_layer"
  | "spoken_wordcut"
  | "vocoder_synth";

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
  },
  bedroom_lofi: {
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
  },
  hyperpop_gloss: {
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
  },
  dry_rap_punch: {
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
  },
};
