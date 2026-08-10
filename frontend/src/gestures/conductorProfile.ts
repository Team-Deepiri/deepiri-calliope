import type { PatternBeat, PatternTarget } from "./patternConduct";

const STORAGE_KEY = "calliope.conductorProfile.v4";

/** Samples required per beat before the profile can be fit. */
export const CALIB_SAMPLES_PER_BEAT = 3;

export type TipSample = {
  beat: PatternBeat;
  x: number;
  y: number;
  t: number;
};

export type ConductorProfile = {
  version: 4;
  targets: PatternTarget[];
  /** How many samples contributed to each beat when fit. */
  sampleCounts: [number, number, number, number];
  updatedAt: number;
};

export type CalibProgress = {
  active: boolean;
  /** Samples gathered per beat 1–4. */
  counts: [number, number, number, number];
  needed: number;
  total: number;
  goal: number;
  ready: boolean;
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function emptyCalibProgress(active = false): CalibProgress {
  return {
    active,
    counts: [0, 0, 0, 0],
    needed: CALIB_SAMPLES_PER_BEAT,
    total: 0,
    goal: CALIB_SAMPLES_PER_BEAT * 4,
    ready: false,
  };
}

export function progressFromSamples(samples: TipSample[], active: boolean): CalibProgress {
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (const s of samples) {
    counts[s.beat - 1] += 1;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  const ready = counts.every((c) => c >= CALIB_SAMPLES_PER_BEAT);
  return {
    active,
    counts,
    needed: CALIB_SAMPLES_PER_BEAT,
    total,
    goal: CALIB_SAMPLES_PER_BEAT * 4,
    ready,
  };
}

function median(xs: number[]): number {
  if (!xs.length) return 0.5;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Few-shot personalization that preserves figure shape.
 * Independent per-beat medians collapse inward (hands rest mid-gesture), so we
 * fit a similarity transform (center + scale) of the prior diamond to the user's
 * sample cloud, then add a small asymmetric nudge from the medians.
 */
export function fitTargetsFromSamples(
  samples: TipSample[],
  prior: PatternTarget[],
): PatternTarget[] | null {
  if (prior.length !== 4) return null;
  const byBeat: Record<PatternBeat, TipSample[]> = { 1: [], 2: [], 3: [], 4: [] };
  for (const s of samples) {
    if (s.beat >= 1 && s.beat <= 4) byBeat[s.beat].push(s);
  }
  for (const b of [1, 2, 3, 4] as PatternBeat[]) {
    if (byBeat[b].length < 2) return null;
  }

  const userMedians = ([1, 2, 3, 4] as PatternBeat[]).map((beat) => ({
    beat,
    x: median(byBeat[beat].map((p) => p.x)),
    y: median(byBeat[beat].map((p) => p.y)),
  }));

  const priorCx = prior.reduce((s, t) => s + t.x, 0) / 4;
  const priorCy = prior.reduce((s, t) => s + t.y, 0) / 4;
  const userCx = userMedians.reduce((s, t) => s + t.x, 0) / 4;
  const userCy = userMedians.reduce((s, t) => s + t.y, 0) / 4;

  const priorSpread =
    prior.reduce((s, t) => s + Math.hypot(t.x - priorCx, t.y - priorCy), 0) / 4;
  const userSpread =
    userMedians.reduce((s, t) => s + Math.hypot(t.x - userCx, t.y - userCy), 0) / 4;

  // Prefer the user's scale, but never shrink below ~70% of the prior figure.
  const rawScale = priorSpread > 1e-4 ? userSpread / priorSpread : 1;
  const scale = clamp(Math.max(rawScale, 0.72), 0.72, 1.35);

  // Nudge weight: let medians skew slightly without collapsing the diamond.
  const nudgeW = 0.18;

  const fitted = ([1, 2, 3, 4] as PatternBeat[]).map((beat, i) => {
    const p = prior[i];
    const shaped = {
      x: userCx + (p.x - priorCx) * scale,
      y: userCy + (p.y - priorCy) * scale,
    };
    const m = userMedians[i];
    return {
      beat,
      label: String(beat),
      x: clamp(shaped.x * (1 - nudgeW) + m.x * nudgeW, 0.08, 0.92),
      y: clamp(shaped.y * (1 - nudgeW) + m.y * nudgeW, 0.08, 0.92),
    };
  });

  // Soft structural guards — keep classic 4/4 ordering in landmark space.
  // Beat 1 lowest (high y), 4 highest (low y); beat 2 right of 3 (high x).
  const t1 = fitted[0];
  const t2 = fitted[1];
  const t3 = fitted[2];
  const t4 = fitted[3];
  if (t1.y < t4.y) {
    const midY = (t1.y + t4.y) / 2;
    const halfY = Math.max(0.1, Math.abs(t1.y - t4.y) * 0.5);
    t1.y = clamp(midY + halfY, 0.08, 0.92);
    t4.y = clamp(midY - halfY, 0.08, 0.92);
  }
  if (t2.x < t3.x) {
    const midX = (t2.x + t3.x) / 2;
    const halfX = Math.max(0.1, Math.abs(t2.x - t3.x) * 0.5);
    t2.x = clamp(midX + halfX, 0.08, 0.92);
    t3.x = clamp(midX - halfX, 0.08, 0.92);
  }

  // Enforce a minimum span so the figure can't become a blob.
  // Tuned to the cue-screen diamond (~0.36 × 0.20), not the old mid-air figure.
  const minSpanX = 0.28;
  const minSpanY = 0.16;
  const xs = fitted.map((t) => t.x);
  const ys = fitted.map((t) => t.y);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  if (spanX < minSpanX || spanY < minSpanY) {
    const cx = fitted.reduce((s, t) => s + t.x, 0) / 4;
    const cy = fitted.reduce((s, t) => s + t.y, 0) / 4;
    const boost = Math.max(
      minSpanX / Math.max(spanX, 1e-4),
      minSpanY / Math.max(spanY, 1e-4),
      1,
    );
    for (const t of fitted) {
      t.x = clamp(cx + (t.x - cx) * boost, 0.08, 0.92);
      t.y = clamp(cy + (t.y - cy) * boost, 0.08, 0.92);
    }
  }

  return fitted;
}

export function loadConductorProfile(): ConductorProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConductorProfile;
    if (parsed?.version !== 4 || !Array.isArray(parsed.targets) || parsed.targets.length !== 4) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveConductorProfile(profile: ConductorProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearConductorProfile(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    // Drop superseded keys so stale mid-air figures don't linger.
    localStorage.removeItem("calliope.conductorProfile.v2");
    localStorage.removeItem("calliope.conductorProfile.v3");
  } catch {
    /* ignore */
  }
}

export function profileFromTargets(
  targets: PatternTarget[],
  sampleCounts: [number, number, number, number],
): ConductorProfile {
  return {
    version: 4,
    targets: targets.map((t) => ({ ...t })),
    sampleCounts,
    updatedAt: Date.now(),
  };
}
