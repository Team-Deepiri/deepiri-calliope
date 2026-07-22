import type { HandSignals } from "./deriveSignals";

export type ConductSection = "verse" | "chorus" | "break";

export type ConductStemId = "drums" | "chords" | "melody" | "energy";

export type ConductLevels = {
  master: number;
  drums: number;
  chords: number;
  melody: number;
  energy: number;
  /** Shared brightness 0–1 → filter cutoff in the engine. */
  brightness: number;
};

export type ConductDriven = {
  drums: boolean;
  chords: boolean;
  melody: boolean;
  energy: boolean;
};

export type ConductPreset = {
  id: string;
  label: string;
  blurb: string;
  prompt: string;
  bpm: number;
  key: string;
  genre: string;
  duration: number;
};

export const CONDUCT_PRESETS: ConductPreset[] = [
  {
    id: "neon-pulse",
    label: "Neon Pulse",
    blurb: "132 BPM · dark techno bed",
    prompt: "dark neon techno pulse, tight kicks, glassy arp, night drive",
    bpm: 132,
    key: "A",
    genre: "minor",
    duration: 4,
  },
  {
    id: "warm-keys",
    label: "Warm Keys",
    blurb: "96 BPM · soft major pad",
    prompt: "warm major keys, soft Rhodes pad, gentle groove, sunset lounge",
    bpm: 96,
    key: "C",
    genre: "major",
    duration: 4,
  },
  {
    id: "classic-drive",
    label: "Classic Drive",
    blurb: "120 BPM · bright rock lead",
    prompt: "classic rock drive, bright lead synth, punchy drums, stadium energy",
    bpm: 120,
    key: "G",
    genre: "minor",
    duration: 4,
  },
];

/** Backend-generated stem kinds (energy is client-built). */
export const GENERATED_STEMS: Array<"drums" | "chords" | "melody"> = [
  "drums",
  "chords",
  "melody",
];

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

type SectionBias = ConductLevels;

/** Section changes mix architecture, not just overall volume. */
const SECTION_BIAS: Record<ConductSection, SectionBias> = {
  verse: {
    master: 0.88,
    drums: 0.72,
    chords: 0.7,
    melody: 0.5,
    energy: 0,
    brightness: 0.45,
  },
  chorus: {
    master: 1,
    drums: 1,
    chords: 0.8,
    melody: 0.95,
    energy: 0.85,
    brightness: 0.85,
  },
  break: {
    master: 0.82,
    drums: 0.08,
    chords: 0.9,
    melody: 0.4,
    energy: 0,
    brightness: 0.28,
  },
};

/**
 * Map left/right hand signals + section → stem gains / brightness.
 */
export function mapConductControls(
  left: HandSignals,
  right: HandSignals,
  section: ConductSection,
): ConductLevels {
  const bias = SECTION_BIAS[section];

  const leftLive = left.detected && !left.fist;
  const rightLive = right.detected && !right.fist;

  const leftHeight = leftLive ? left.height : 0.45;
  const leftOpen = leftLive ? left.openness : 0.4;
  const rightHeight = rightLive ? right.height : 0.4;
  const rightOpen = rightLive ? right.openness : 0.4;

  let master = bias.master * lerp(0.22, 1, leftHeight);
  let drums = bias.drums * lerp(0.05, 1, leftOpen);
  let chords = bias.chords * lerp(0.05, 1, rightOpen);
  let melody = bias.melody * lerp(0.05, 1, rightHeight);
  let energy = bias.energy * lerp(0.35, 1, (leftOpen + rightOpen) * 0.5);
  let brightness = bias.brightness * lerp(0.7, 1.15, (leftHeight + rightHeight) * 0.5);

  if (left.detected && left.fist) {
    master *= 0.25;
    drums *= 0.08;
    energy *= 0.2;
  }
  if (right.detected && right.fist) {
    chords *= 0.1;
    melody *= 0.1;
    energy *= 0.35;
  }

  if (!left.detected && !right.detected) {
    master *= 0.35;
    drums *= 0.35;
    chords *= 0.35;
    melody *= 0.35;
    energy *= 0.2;
  }

  return {
    master: clamp01(master),
    drums: clamp01(drums),
    chords: clamp01(chords),
    melody: clamp01(melody),
    energy: clamp01(energy),
    brightness: clamp01(brightness),
  };
}

/** Which stems are “hot” for spotlight UI. */
export function drivenStemsFromLevels(levels: ConductLevels): ConductDriven {
  return {
    drums: levels.drums > 0.45,
    chords: levels.chords > 0.45,
    melody: levels.melody > 0.45,
    energy: levels.energy > 0.35,
  };
}

/**
 * Swipe right toggles verse ↔ chorus.
 * Swipe left toggles verse ↔ break.
 */
export function sectionFromSwipe(
  current: ConductSection,
  pose: "swipe_left" | "swipe_right",
): ConductSection {
  if (pose === "swipe_right") {
    return current === "chorus" ? "verse" : "chorus";
  }
  return current === "break" ? "verse" : "break";
}
