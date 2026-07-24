/** Pure helpers: MediaPipe hand landmarks → performance signals (0–1). */

export type Landmark = { x: number; y: number; z: number };

export type HandLabel = "Left" | "Right" | "Unknown";

export type HandSignals = {
  height: number;
  pinch: number;
  openness: number;
  fist: boolean;
  detected: boolean;
  label: HandLabel;
};

export const EMPTY_SIGNALS: HandSignals = {
  height: 0,
  pinch: 0,
  openness: 0,
  fist: false,
  detected: false,
  label: "Unknown",
};

const TIP_IDS = [4, 8, 12, 16, 20] as const;
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Derive continuous instrument signals from one hand's landmarks.
 * Coordinates are MediaPipe normalized (origin top-left); we mirror-aware on height via y.
 */
export function deriveHandSignals(
  landmarks: Landmark[] | undefined | null,
  label: HandLabel = "Unknown",
): HandSignals {
  if (!landmarks || landmarks.length < 21) {
    return { ...EMPTY_SIGNALS, label };
  }

  const wrist = landmarks[WRIST];
  // Higher hand in frame → larger height (invert y)
  const height = clamp01(1 - wrist.y);

  const pinchRaw = dist(landmarks[THUMB_TIP], landmarks[INDEX_TIP]);
  // Typical pinch range ~0.02–0.18 in normalized space
  const pinch = clamp01(1 - (pinchRaw - 0.02) / 0.16);

  const palm = landmarks[MIDDLE_MCP];
  const tipSpread =
    TIP_IDS.reduce((sum, id) => sum + dist(landmarks[id], palm), 0) / TIP_IDS.length;
  const openness = clamp01((tipSpread - 0.05) / 0.2);

  const fist = openness < 0.18 && pinch > 0.85;

  return {
    height,
    pinch,
    openness,
    fist,
    detected: true,
    label,
  };
}

export type HandednessHint = { categoryName?: string; score?: number };

/**
 * Build stable [Left, Right] voice slots from MediaPipe handedness when possible.
 * Falls back to mirrored screen position. Always keeps both hands when two are present.
 */
export function deriveStereoHandSignals(
  hands: Landmark[][] | undefined | null,
  handedness?: HandednessHint[][] | null,
): { left: HandSignals; right: HandSignals; list: HandSignals[]; leftLandmarks: Landmark[] | null; rightLandmarks: Landmark[] | null } {
  const emptyLeft: HandSignals = { ...EMPTY_SIGNALS, label: "Left" };
  const emptyRight: HandSignals = { ...EMPTY_SIGNALS, label: "Right" };

  const valid = (hands ?? [])
    .map((lm, i) => ({
      lm,
      i,
      named: handedness?.[i]?.[0]?.categoryName,
      x: lm?.[WRIST]?.x ?? 0.5,
    }))
    .filter(({ lm }) => lm && lm.length >= 21);

  if (!valid.length) {
    return {
      left: emptyLeft,
      right: emptyRight,
      list: [emptyLeft, emptyRight],
      leftLandmarks: null,
      rightLandmarks: null,
    };
  }

  let leftLm: Landmark[] | null = null;
  let rightLm: Landmark[] | null = null;

  for (const h of valid) {
    if (h.named === "Left" && !leftLm) leftLm = h.lm;
    if (h.named === "Right" && !rightLm) rightLm = h.lm;
  }

  // If labels missing/duplicated, split by mirrored screen (high x → preview left).
  if (valid.length >= 2 && (!leftLm || !rightLm || leftLm === rightLm)) {
    const sorted = [...valid].sort((a, b) => b.x - a.x);
    leftLm = sorted[0].lm;
    rightLm = sorted[1].lm;
  } else if (valid.length === 1) {
    const only = valid[0];
    if (only.named === "Left") leftLm = only.lm;
    else if (only.named === "Right") rightLm = only.lm;
    else if (only.x >= 0.5) leftLm = only.lm;
    else rightLm = only.lm;
  }

  const left = leftLm ? deriveHandSignals(leftLm, "Left") : emptyLeft;
  const right = rightLm ? deriveHandSignals(rightLm, "Right") : emptyRight;
  return {
    left,
    right,
    list: [left, right],
    leftLandmarks: leftLm,
    rightLandmarks: rightLm,
  };
}

/** Derive one signal bundle per hand (detection order — prefer deriveStereoHandSignals). */
export function deriveHandsSignals(
  hands: Landmark[][] | undefined | null,
): HandSignals[] {
  if (!hands?.length) return [];
  return hands.map((h) => deriveHandSignals(h));
}

/**
 * Blend multiple hands into one voice for summary meters.
 */
export function mergeHandSignals(hands: HandSignals[]): HandSignals {
  const live = hands.filter((h) => h.detected);
  if (!live.length) return { ...EMPTY_SIGNALS };
  const n = live.length;
  return {
    detected: true,
    label: "Unknown",
    height: live.reduce((s, h) => s + h.height, 0) / n,
    pinch: Math.min(...live.map((h) => h.pinch)),
    openness: live.reduce((s, h) => s + h.openness, 0) / n,
    fist: live.every((h) => h.fist),
  };
}
