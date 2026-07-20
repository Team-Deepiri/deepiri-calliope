import type { HandSignals } from "./deriveSignals";

export type ConductSection = "verse" | "chorus" | "break";

export type ConductStemId = "drums" | "chords" | "melody";

export type ConductLevels = {
  master: number;
  drums: number;
  chords: number;
  melody: number;
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
    blurb: "132 BPM · minor · electronic",
    prompt: "neon pulse electronic gesture conductor arrangement",
    bpm: 132,
    key: "A",
    genre: "minor",
    duration: 2,
  },
  {
    id: "warm-keys",
    label: "Warm Keys",
    blurb: "96 BPM · warm pad feel",
    prompt: "warm keys pad gesture conductor arrangement",
    bpm: 96,
    key: "C",
    genre: "major",
    duration: 2,
  },
  {
    id: "classic-drive",
    label: "Classic Drive",
    blurb: "120 BPM · brighter lead",
    prompt: "classic drive bright lead gesture conductor arrangement",
    bpm: 120,
    key: "G",
    genre: "minor",
    duration: 2,
  },
];

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/** Section multiplies stem targets before hand expression. */
const SECTION_BIAS: Record<ConductSection, ConductLevels> = {
  verse: { master: 0.85, drums: 0.75, chords: 0.7, melody: 0.55 },
  chorus: { master: 1, drums: 1, chords: 0.85, melody: 0.95 },
  break: { master: 0.8, drums: 0.15, chords: 0.85, melody: 0.45 },
};

/**
 * Map left/right hand signals + section → stem gains for ConductEngine.
 */
export function mapConductControls(
  left: HandSignals,
  right: HandSignals,
  section: ConductSection,
): ConductLevels {
  const bias = SECTION_BIAS[section];

  const leftLive = left.detected && !left.fist;
  const rightLive = right.detected && !right.fist;

  // Defaults when a hand is missing: keep a quiet bed so loops don't vanish.
  const leftHeight = leftLive ? left.height : 0.45;
  const leftOpen = leftLive ? left.openness : 0.4;
  const rightHeight = rightLive ? right.height : 0.4;
  const rightOpen = rightLive ? right.openness : 0.4;

  let master = bias.master * lerp(0.2, 1, leftHeight);
  let drums = bias.drums * lerp(0.05, 1, leftOpen);
  let chords = bias.chords * lerp(0.05, 1, rightOpen);
  let melody = bias.melody * lerp(0.05, 1, rightHeight);

  // Fist ducks that hand's contributions.
  if (left.detected && left.fist) {
    master *= 0.25;
    drums *= 0.1;
  }
  if (right.detected && right.fist) {
    chords *= 0.1;
    melody *= 0.1;
  }

  // No hands at all → soft bed (still looping, quiet).
  if (!left.detected && !right.detected) {
    master *= 0.35;
    drums *= 0.35;
    chords *= 0.35;
    melody *= 0.35;
  }

  return {
    master: clamp01(master),
    drums: clamp01(drums),
    chords: clamp01(chords),
    melody: clamp01(melody),
  };
}

export function sectionFromSwipe(pose: "swipe_left" | "swipe_right"): ConductSection {
  return pose === "swipe_right" ? "chorus" : "break";
}
