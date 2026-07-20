/** Discrete pose detection from MediaPipe hand landmarks. */

import type { Landmark } from "./deriveSignals";

export type PoseId = "thumbs_up" | "open_palm" | "swipe_left" | "swipe_right";

export const POSE_VOCAB: Array<{ id: PoseId; label: string; action: string; hint: string }> = [
  {
    id: "thumbs_up",
    label: "Thumbs up",
    action: "Layer drums",
    hint: "Hold briefly — stacks with the other hand",
  },
  {
    id: "open_palm",
    label: "Open palm",
    action: "Layer melody",
    hint: "Hold briefly — stacks with the other hand",
  },
  {
    id: "swipe_right",
    label: "Swipe right",
    action: "Layer full clip",
    hint: "Quick flick — replaces only the full layer",
  },
  {
    id: "swipe_left",
    label: "Swipe left",
    action: "Layer chords",
    hint: "Quick flick — replaces only the chords layer",
  },
];

function tipExtended(landmarks: Landmark[], tip: number, pip: number): boolean {
  const wrist = landmarks[0];
  const dTip = Math.hypot(landmarks[tip].x - wrist.x, landmarks[tip].y - wrist.y);
  const dPip = Math.hypot(landmarks[pip].x - wrist.x, landmarks[pip].y - wrist.y);
  return dTip > dPip * 1.08;
}

function tipFolded(landmarks: Landmark[], tip: number, pip: number): boolean {
  return !tipExtended(landmarks, tip, pip);
}

export function classifyStaticPose(landmarks: Landmark[] | null | undefined): PoseId | null {
  if (!landmarks || landmarks.length < 21) return null;

  const thumbUp =
    landmarks[4].y < landmarks[3].y - 0.02 &&
    landmarks[4].y < landmarks[2].y &&
    tipFolded(landmarks, 8, 6) &&
    tipFolded(landmarks, 12, 10) &&
    tipFolded(landmarks, 16, 14) &&
    tipFolded(landmarks, 20, 18);

  if (thumbUp) return "thumbs_up";

  const openPalm =
    tipExtended(landmarks, 8, 6) &&
    tipExtended(landmarks, 12, 10) &&
    tipExtended(landmarks, 16, 14) &&
    tipExtended(landmarks, 20, 18) &&
    Math.hypot(landmarks[4].x - landmarks[8].x, landmarks[4].y - landmarks[8].y) > 0.08;

  if (openPalm) return "open_palm";

  return null;
}

type Sample = { t: number; x: number };

type HandHold = { pose: PoseId | null; since: number };

/**
 * Per-hand pose detector. Left and right can fire different poses in the same frame
 * so two composition layers can start together.
 */
export class PoseTriggerEngine {
  private holds: HandHold[] = [
    { pose: null, since: 0 },
    { pose: null, since: 0 },
  ];
  /** Per-hand cooldown so one fire doesn't block the other hand. */
  private cooldownUntil = [0, 0];
  private samplesByHand: Sample[][] = [[], []];
  private holdMs: number;
  private cooldownMs: number;
  private swipeWindowMs: number;
  private swipeDelta: number;

  constructor(holdMs = 480, cooldownMs = 2200, swipeWindowMs = 280, swipeDelta = 0.22) {
    this.holdMs = holdMs;
    this.cooldownMs = cooldownMs;
    this.swipeWindowMs = swipeWindowMs;
    this.swipeDelta = swipeDelta;
  }

  reset(): void {
    this.holds = [
      { pose: null, since: 0 },
      { pose: null, since: 0 },
    ];
    this.cooldownUntil = [0, 0];
    this.samplesByHand = [[], []];
  }

  /** Single-hand update (back-compat) — returns first fired pose or null. */
  update(landmarks: Landmark[] | null | undefined, now = performance.now()): PoseId | null {
    const fired = this.updateHands(landmarks && landmarks.length >= 21 ? [landmarks] : [], now);
    return fired[0] ?? null;
  }

  /**
   * Multi-hand update with stable slots: index 0 = left, index 1 = right.
   * Pass null for a missing hand. Returns every pose that fires this frame.
   */
  updateHands(
    hands: Array<Landmark[] | null | undefined>,
    now = performance.now(),
  ): PoseId[] {
    const fired: PoseId[] = [];
    const slots = [hands[0] ?? null, hands[1] ?? null];

    for (let i = 0; i < 2; i++) {
      const landmarks = slots[i];
      if (!landmarks || landmarks.length < 21) {
        this.holds[i] = { pose: null, since: 0 };
        this.samplesByHand[i] = [];
        continue;
      }

      if (now < this.cooldownUntil[i]) {
        this.holds[i] = { pose: null, since: 0 };
        continue;
      }

      const swipe = this.checkSwipe(i, landmarks, now);
      if (swipe) {
        this.holds[i] = { pose: null, since: 0 };
        this.samplesByHand[i] = [];
        this.cooldownUntil[i] = now + this.cooldownMs;
        fired.push(swipe);
        continue;
      }

      const hold = this.checkHold(i, landmarks, now);
      if (hold) {
        this.holds[i] = { pose: null, since: 0 };
        this.cooldownUntil[i] = now + this.cooldownMs;
        fired.push(hold);
      }
    }

    // Dedupe same pose if both hands somehow fire identical (keep one)
    return [...new Set(fired)];
  }

  private checkSwipe(handIndex: number, landmarks: Landmark[], now: number): PoseId | null {
    const wristX = landmarks[0].x;
    let samples = this.samplesByHand[handIndex] ?? [];
    samples.push({ t: now, x: wristX });
    samples = samples.filter((s) => now - s.t <= this.swipeWindowMs);
    this.samplesByHand[handIndex] = samples;

    if (samples.length < 3) return null;
    const oldest = samples[0];
    const newest = samples[samples.length - 1];
    const dx = newest.x - oldest.x;
    if (Math.abs(dx) < this.swipeDelta) return null;
    return dx > 0 ? "swipe_right" : "swipe_left";
  }

  private checkHold(handIndex: number, landmarks: Landmark[], now: number): PoseId | null {
    const staticPose = classifyStaticPose(landmarks);
    if (!staticPose || staticPose === "swipe_left" || staticPose === "swipe_right") {
      this.holds[handIndex] = { pose: null, since: 0 };
      return null;
    }

    const hold = this.holds[handIndex] ?? { pose: null, since: 0 };
    if (hold.pose !== staticPose) {
      this.holds[handIndex] = { pose: staticPose, since: now };
      return null;
    }

    if (now - hold.since >= this.holdMs) {
      return staticPose;
    }
    return null;
  }
}
