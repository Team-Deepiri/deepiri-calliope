/** Pure helpers: MediaPipe hand landmarks → performance signals (0–1). */

export type Landmark = { x: number; y: number; z: number };

export type HandSignals = {
  height: number;
  pinch: number;
  openness: number;
  fist: boolean;
  detected: boolean;
};

export const EMPTY_SIGNALS: HandSignals = {
  height: 0,
  pinch: 0,
  openness: 0,
  fist: false,
  detected: false,
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
export function deriveHandSignals(landmarks: Landmark[] | undefined | null): HandSignals {
  if (!landmarks || landmarks.length < 21) {
    return { ...EMPTY_SIGNALS };
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

  const fist = openness < 0.28 && pinch > 0.72;

  return {
    height,
    pinch,
    openness,
    fist,
    detected: true,
  };
}
