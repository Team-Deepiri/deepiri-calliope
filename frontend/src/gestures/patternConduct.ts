import {
  CALIB_SAMPLES_PER_BEAT,
  fitTargetsFromSamples,
  profileFromTargets,
  progressFromSamples,
  type CalibProgress,
  type ConductorProfile,
  type TipSample,
} from "./conductorProfile";
import type { Landmark } from "./deriveSignals";

export type PatternBeat = 1 | 2 | 3 | 4;

export type PatternTarget = {
  beat: PatternBeat;
  /** Landmark space (same as tip.x / tip.y). */
  x: number;
  y: number;
  label: string;
};

export type ConductGradeBreakdown = {
  timing: number;
  accuracy: number;
  continuity: number;
  shape: number;
  expression: number;
};

export type ConductGrade = {
  /** Live 0–100. */
  score: number;
  letter: string;
  breakdown: ConductGradeBreakdown;
  coach: string;
  frozen: boolean;
};

export type PatternConductState = {
  tempoRate: number;
  dynamics: number;
  sync: number;
  phrase: number;
  beat: boolean;
  pulse: boolean;
  beatPhase: number;
  measurePhase: number;
  guideX: number;
  guideY: number;
  tipX: number;
  tipY: number;
  active: boolean;
  nextBeat: PatternBeat;
  targets: PatternTarget[];
  /** Active path edges for this measure (variable cycle). */
  pathEdges: Array<[PatternBeat, PatternBeat]>;
  grade: ConductGrade;
  calib: CalibProgress;
};

export type { CalibProgress, ConductorProfile };

export type PatternUpdateOpts = {
  baseBpm: number;
  scoreTime: number;
  duration: number;
  playing: boolean;
  now?: number;
};

const INDEX_TIP = 8;
/** Generous disk — webcam jitter + tip smoothing need headroom. */
const HIT_RADIUS = 0.22;
const HIT_COOLDOWN_MS = 100;
const TIP_LEAD_SEC = 0.065;
const TIP_LEAD_MAX = 0.038;
const TIP_SMOOTH_STILL = 0.28;
const TIP_SMOOTH_MOVE = 0.72;
const TIP_SPEED_REF = 1.1;
const VEL_SMOOTH = 0.28;

/** Fixed ictus points in landmark space (mirrored on screen via 1−x). */
export const PATTERN_4_4: PatternTarget[] = [
  { beat: 1, x: 0.5, y: 0.78, label: "1" },
  { beat: 2, x: 0.74, y: 0.52, label: "2" },
  { beat: 3, x: 0.26, y: 0.52, label: "3" },
  { beat: 4, x: 0.5, y: 0.22, label: "4" },
];

export function cloneDefaultTargets(): PatternTarget[] {
  return PATTERN_4_4.map((t) => ({ ...t }));
}

/**
 * Variable conducting cycles — waypoints stay fixed, but the guide route
 * through them changes each measure so the pattern isn't one locked loop.
 * Each path has 5 nodes (4 segments) so one measure maps evenly to 4 beats.
 */
const CYCLE_PATHS: PatternBeat[][] = [
  [1, 2, 3, 4, 1], // classic
  [1, 2, 4, 3, 1], // diamond
  [1, 3, 2, 4, 1], // mirror cross
  [1, 4, 3, 2, 1], // reverse diamond
  [1, 3, 4, 2, 1], // right-first
  [1, 4, 2, 3, 1], // up then left-cross
];

/** All unique edges among the four ictus points (faint mesh). */
export const FIGURE_EDGES: Array<[PatternBeat, PatternBeat]> = [
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 3],
  [2, 4],
  [3, 4],
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function pathForMeasure(measureIndex: number): PatternBeat[] {
  const i = ((measureIndex % CYCLE_PATHS.length) + CYCLE_PATHS.length) % CYCLE_PATHS.length;
  return CYCLE_PATHS[i];
}

function edgesFromPath(order: PatternBeat[]): Array<[PatternBeat, PatternBeat]> {
  const edges: Array<[PatternBeat, PatternBeat]> = [];
  for (let i = 0; i < order.length - 1; i++) {
    const a = order[i];
    const b = order[i + 1];
    if (a !== b) edges.push([a, b]);
  }
  return edges;
}

function coordsForPath(
  order: PatternBeat[],
  targets: PatternTarget[],
): Array<{ x: number; y: number }> {
  return order.map((b) => {
    const t = targets[b - 1] ?? PATTERN_4_4[b - 1];
    return { x: t.x, y: t.y };
  });
}

/** Interpolate along an explicit waypoint path; measurePhase is 0–1. */
export function pointOnPath(
  measurePhase: number,
  path: Array<{ x: number; y: number }>,
): { x: number; y: number } {
  if (path.length < 2) return { x: 0.5, y: 0.78 };
  const p = finiteOr(((measurePhase % 1) + 1) % 1, 0);
  const segs = path.length - 1;
  const f = p * segs;
  const i = Math.min(segs - 1, Math.max(0, Math.floor(f)));
  const t = f - i;
  const a = path[i];
  const b = path[i + 1];
  return {
    x: finiteOr(lerp(a.x, b.x, t), 0.5),
    y: finiteOr(lerp(a.y, b.y, t), 0.78),
  };
}

export function pointOnFigure(
  measurePhase: number,
  measureIndex = 0,
  targets: PatternTarget[] = PATTERN_4_4,
): { x: number; y: number } {
  return pointOnPath(measurePhase, coordsForPath(pathForMeasure(measureIndex), targets));
}

function letterFromScore(score: number): string {
  if (score >= 85) return "A";
  if (score >= 72) return "B";
  if (score >= 58) return "C";
  if (score >= 45) return "D";
  return "F";
}

/** Lift mid-range metrics so solid-but-imperfect conducting isn't punished. */
function softMetric(v: number): number {
  return clamp(Math.pow(clamp(v, 0, 1), 0.72), 0, 1);
}

function coachFromBreakdown(b: ConductGradeBreakdown, phrase: number): string {
  const entries: Array<[keyof ConductGradeBreakdown, number, string]> = [
    ["timing", b.timing, "Watch the beat — hit the lit dot on the pulse."],
    ["accuracy", b.accuracy, "Reach for the glowing beat number when it lights up."],
    ["continuity", b.continuity, "Keep hitting the lit dots — long gaps drop continuity."],
    ["shape", b.shape, "Touch the highlighted beat in order on the gold route."],
    ["expression", b.expression, "Vary gesture size for louder and softer phrases."],
  ];
  entries.sort((a, c) => a[1] - c[1]);
  if (phrase < 0.28 && b.expression < 0.55) {
    return "Use bigger arm patterns — small gestures mute the orchestra.";
  }
  if (entries[0][1] >= 0.75) return "Strong conducting — clear figure and steady pulse.";
  return entries[0][2];
}

/** Normal score tempo — never faster than this in pattern mode. */
const TEMPO_MAX = 1;
/** Near-stop when cues are missed — you must hit to keep the song moving. */
const TEMPO_CRAWL = 0.08;
/** Gentle start until the first cue hit. */
const TEMPO_START = 0.42;

/**
 * Pattern conducting: personalized ictus points (optional), variable route each measure.
 * Hit lit beats to keep the score at normal tempo; misses crawl the music.
 * Run startCalibration() to few-shot fit targets to the user's tip positions.
 */
export class PatternConductDetector {
  private samples: Array<{ t: number; x: number; y: number }> = [];
  private lastHitAt = 0;
  private lastHitBeatIndex = -1;
  private lastMissBeatIndex = -1;
  private lastPulseBeat = -1;
  private tempoRate = 1;
  private dynamics = 0.45;
  private sync = 0.5;
  private phrase = 0.4;
  private tipX = 0.5;
  private tipY = 0.5;
  private smoothX = 0.5;
  private smoothY = 0.5;
  private velX = 0;
  private velY = 0;
  private tipPrimed = false;
  private lastSyncSampleAt = 0;

  private timingSamples: number[] = [];
  private accuracySamples: number[] = [];
  private shapeSamples: number[] = [];
  private cueHits = 0;
  private expectedBeats = 0;
  private dynamicsSamples: number[] = [];
  private gradeFrozen = false;
  private frozenGrade: ConductGrade | null = null;
  private lastScoreTime = 0;

  /** Live figure targets (default or personalized). */
  private targets: PatternTarget[] = cloneDefaultTargets();
  private calibrating = false;
  private calibSamples: TipSample[] = [];
  private pendingProfile: ConductorProfile | null = null;

  reset(): void {
    this.samples = [];
    this.lastHitAt = 0;
    this.lastHitBeatIndex = -1;
    this.lastMissBeatIndex = -1;
    this.lastPulseBeat = -1;
    this.tempoRate = this.calibrating ? 0.92 : TEMPO_START;
    this.dynamics = 0.45;
    this.sync = 0.5;
    this.phrase = 0.4;
    this.tipX = 0.5;
    this.tipY = 0.5;
    this.smoothX = 0.5;
    this.smoothY = 0.5;
    this.velX = 0;
    this.velY = 0;
    this.tipPrimed = false;
    this.lastSyncSampleAt = 0;
    this.timingSamples = [];
    this.accuracySamples = [];
    this.shapeSamples = [];
    this.cueHits = 0;
    this.expectedBeats = 0;
    this.dynamicsSamples = [];
    this.gradeFrozen = false;
    this.frozenGrade = null;
    this.lastScoreTime = 0;
  }

  beginPerformance(): void {
    this.reset();
  }

  setTargets(targets: PatternTarget[]): void {
    if (targets.length !== 4) return;
    this.targets = targets.map((t) => ({ ...t }));
  }

  getTargets(): PatternTarget[] {
    return this.targets.map((t) => ({ ...t }));
  }

  startCalibration(): void {
    this.calibrating = true;
    this.calibSamples = [];
    this.pendingProfile = null;
    this.targets = cloneDefaultTargets();
    this.tempoRate = 0.92;
  }

  cancelCalibration(): void {
    this.calibrating = false;
    this.calibSamples = [];
  }

  getCalibProgress(): CalibProgress {
    return progressFromSamples(this.calibSamples, this.calibrating);
  }

  /** One-shot: profile produced when calibration completes. */
  consumeFittedProfile(): ConductorProfile | null {
    const p = this.pendingProfile;
    this.pendingProfile = null;
    return p;
  }

  freezeGrade(): ConductGrade {
    if (this.gradeFrozen && this.frozenGrade) return this.frozenGrade;
    const g = this.computeGrade();
    g.frozen = true;
    this.gradeFrozen = true;
    this.frozenGrade = g;
    return g;
  }

  private targetFor(beat: PatternBeat): PatternTarget {
    return this.targets[beat - 1] ?? PATTERN_4_4[beat - 1];
  }

  private recordCalibSample(beat: PatternBeat, x: number, y: number, now: number): void {
    if (!this.calibrating) return;
    const counts = progressFromSamples(this.calibSamples, true).counts;
    if (counts[beat - 1] >= CALIB_SAMPLES_PER_BEAT) return;
    this.calibSamples.push({ beat, x, y, t: now });
    const prog = progressFromSamples(this.calibSamples, true);
    if (!prog.ready) return;
    const fitted = fitTargetsFromSamples(this.calibSamples, PATTERN_4_4, 0.28);
    if (!fitted) return;
    this.targets = fitted;
    this.calibrating = false;
    this.pendingProfile = profileFromTargets(fitted, prog.counts);
  }

  /** Live beat snapshot for UI rAF (works without a hand frame). */
  peekGuide(scoreTime: number, baseBpm: number, playing: boolean): {
    measurePhase: number;
    beatPhase: number;
    pulse: boolean;
    guideX: number;
    guideY: number;
    nextBeat: PatternBeat;
    targets: PatternTarget[];
    pathEdges: Array<[PatternBeat, PatternBeat]>;
  } {
    const beatPeriodSec = 60 / Math.max(40, baseBpm);
    const scoreT = finiteOr(scoreTime, 0);
    const beatFloat = playing ? scoreT / beatPeriodSec : 0;
    const beatPhase = beatFloat - Math.floor(beatFloat);
    const measureIndex = Math.floor(beatFloat / 4);
    const measurePhase = playing ? (((beatFloat % 4) + 4) % 4) / 4 : 0;
    const order = pathForMeasure(measureIndex);
    const beatInMeasure = Math.min(3, Math.floor((((beatFloat % 4) + 4) % 4)));
    const nextBeat = order[beatInMeasure];
    const lit = this.targetFor(nextBeat);
    return {
      measurePhase,
      beatPhase,
      pulse: playing && beatPhase < 0.14,
      guideX: lit.x,
      guideY: lit.y,
      nextBeat,
      targets: this.getTargets(),
      pathEdges: edgesFromPath(order),
    };
  }

  private mean(xs: number[], fallback: number): number {
    if (!xs.length) return fallback;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }

  private computeGrade(): ConductGrade {
    if (this.frozenGrade && this.gradeFrozen) return this.frozenGrade;

    const timing = softMetric(this.mean(this.timingSamples, 0.62));
    const accuracy = softMetric(this.mean(this.accuracySamples, 0.62));
    const hitRate =
      this.expectedBeats > 0
        ? this.cueHits / Math.max(1, this.expectedBeats)
        : clamp(this.cueHits / 6, 0, 1);
    // Slight boost so landing most cues reads as strong continuity.
    const continuity = softMetric(clamp(hitRate * 1.2, 0, 1));
    const shape = softMetric(this.mean(this.shapeSamples, 0.6));

    let expression = 0.55;
    if (this.dynamicsSamples.length >= 4) {
      const m = this.mean(this.dynamicsSamples, 0.5);
      const variance =
        this.dynamicsSamples.reduce((s, v) => s + (v - m) ** 2, 0) /
        this.dynamicsSamples.length;
      expression = softMetric(
        clamp(Math.sqrt(variance) * 5.5 + this.phrase * 0.4, 0.25, 1),
      );
    } else {
      expression = softMetric(clamp(this.phrase, 0.35, 0.8));
    }

    const breakdown: ConductGradeBreakdown = {
      timing,
      accuracy,
      continuity,
      shape,
      expression,
    };
    const raw =
      timing * 0.3 +
      accuracy * 0.22 +
      continuity * 0.24 +
      shape * 0.14 +
      expression * 0.1;
    // Gentle curve + floor so average conducting lands in B/C, not D/F.
    const score = Math.round(clamp((0.18 + 0.82 * Math.pow(raw, 0.85)) * 100, 0, 100));

    return {
      score,
      letter: this.cueHits < 3 ? "—" : letterFromScore(score),
      breakdown,
      coach: coachFromBreakdown(breakdown, this.phrase),
      frozen: false,
    };
  }

  update(
    rightLandmarks: Landmark[] | null | undefined,
    opts: PatternUpdateOpts,
  ): PatternConductState {
    const now = opts.now ?? performance.now();
    // Beat clock is in score-time; wall-clock pace is driven by hit-gated tempoRate.
    const beatPeriodSec = 60 / Math.max(40, opts.baseBpm);
    const beatPeriodMs = beatPeriodSec * 1000;
    const scoreTime = finiteOr(opts.scoreTime, 0);
    const beatFloat = opts.playing ? scoreTime / beatPeriodSec : 0;
    const beatIndex = Math.floor(beatFloat);
    const beatPhase = beatFloat - Math.floor(beatFloat);
    const measureIndex = Math.floor(beatFloat / 4);
    const measurePhase = opts.playing ? (((beatFloat % 4) + 4) % 4) / 4 : 0;
    const order = pathForMeasure(measureIndex);
    const pathEdges = edgesFromPath(order);
    const beatInMeasure = Math.min(3, Math.floor((((beatFloat % 4) + 4) % 4)));
    const segmentBeat = order[beatInMeasure];
    const lit = this.targetFor(segmentBeat);
    const pulse =
      opts.playing && beatIndex !== this.lastPulseBeat && beatPhase < 0.14;
    if (pulse) this.lastPulseBeat = beatIndex;

    const grade =
      this.gradeFrozen && this.frozenGrade ? this.frozenGrade : this.computeGrade();

    if (opts.playing && scoreTime > this.lastScoreTime) {
      const dt = scoreTime - this.lastScoreTime;
      this.expectedBeats += dt / beatPeriodSec;
      this.lastScoreTime = scoreTime;
    }

    const pack = (active: boolean, beat: boolean): PatternConductState => ({
      tempoRate: this.tempoRate,
      dynamics: this.dynamics,
      sync: this.sync,
      phrase: this.phrase,
      beat,
      pulse,
      beatPhase,
      measurePhase,
      guideX: lit.x,
      guideY: lit.y,
      tipX: this.tipX,
      tipY: this.tipY,
      active,
      nextBeat: segmentBeat,
      targets: this.getTargets(),
      pathEdges,
      grade,
      calib: this.getCalibProgress(),
    });

    /** Drift toward crawl when the conductor isn't landing cues. */
    const decayTempo = (urgency = 0.5) => {
      const u = clamp(urgency, 0, 1);
      this.tempoRate += (TEMPO_CRAWL - this.tempoRate) * (0.1 + u * 0.28);
      this.tempoRate = clamp(this.tempoRate, TEMPO_CRAWL, TEMPO_MAX);
    };

    /** Restore toward normal score tempo after a successful cue. */
    const boostTempo = (timingHit: number) => {
      const leap = 0.5 + timingHit * 0.4;
      this.tempoRate += (TEMPO_MAX - this.tempoRate) * leap;
      this.tempoRate = clamp(this.tempoRate, TEMPO_CRAWL, TEMPO_MAX);
    };

    if (!rightLandmarks || rightLandmarks.length < 21) {
      if (opts.playing) {
        this.dynamics += (0.25 - this.dynamics) * 0.05;
        this.sync += (0.3 - this.sync) * 0.04;
        if (this.calibrating) {
          this.tempoRate += (0.92 - this.tempoRate) * 0.2;
        } else {
          decayTempo(0.75);
        }
      }
      this.samples = [];
      return pack(false, false);
    }

    const tip = rightLandmarks[INDEX_TIP];
    this.samples.push({ t: now, x: tip.x, y: tip.y });
    this.samples = this.samples.filter((s) => now - s.t <= 280);

    if (this.samples.length >= 2) {
      const a = this.samples[this.samples.length - 2];
      const b = this.samples[this.samples.length - 1];
      const dt = Math.max(12, b.t - a.t) / 1000;
      this.velX += ((b.x - a.x) / dt - this.velX) * VEL_SMOOTH;
      this.velY += ((b.y - a.y) / dt - this.velY) * VEL_SMOOTH;
    }

    if (!this.tipPrimed) {
      this.smoothX = tip.x;
      this.smoothY = tip.y;
      this.tipPrimed = true;
    } else {
      const speed = Math.hypot(this.velX, this.velY);
      const move = clamp(speed / TIP_SPEED_REF, 0, 1);
      const alpha = TIP_SMOOTH_STILL + (TIP_SMOOTH_MOVE - TIP_SMOOTH_STILL) * move;
      this.smoothX += (tip.x - this.smoothX) * alpha;
      this.smoothY += (tip.y - this.smoothY) * alpha;
    }

    let lx = this.velX * TIP_LEAD_SEC;
    let ly = this.velY * TIP_LEAD_SEC;
    const leadLen = Math.hypot(lx, ly);
    if (leadLen > TIP_LEAD_MAX) {
      lx *= TIP_LEAD_MAX / leadLen;
      ly *= TIP_LEAD_MAX / leadLen;
    }
    const aimX = clamp(this.smoothX + lx, 0.02, 0.98);
    const aimY = clamp(this.smoothY + ly, 0.02, 0.98);
    this.tipX = this.smoothX;
    this.tipY = this.smoothY;

    if (this.samples.length >= 3) {
      let pathLen = 0;
      let minX = 1;
      let maxX = 0;
      let minY = 1;
      let maxY = 0;
      for (let i = 0; i < this.samples.length; i++) {
        const s = this.samples[i];
        minX = Math.min(minX, s.x);
        maxX = Math.max(maxX, s.x);
        minY = Math.min(minY, s.y);
        maxY = Math.max(maxY, s.y);
        if (i > 0) {
          const a = this.samples[i - 1];
          pathLen += Math.hypot(s.x - a.x, s.y - a.y);
        }
      }
      const box = (maxX - minX) * (maxY - minY);
      const phraseTarget = clamp(pathLen * 1.8 + box * 5.5, 0.1, 1);
      this.phrase += (phraseTarget - this.phrase) * 0.28;
    }

    const dist = Math.min(
      Math.hypot(tip.x - lit.x, tip.y - lit.y),
      Math.hypot(this.smoothX - lit.x, this.smoothY - lit.y),
      Math.hypot(aimX - lit.x, aimY - lit.y),
    );
    const near = dist <= HIT_RADIUS;

    let beat = false;
    const cool = now - this.lastHitAt > Math.min(HIT_COOLDOWN_MS, beatPeriodMs * 0.28);
    // Whole beat is fair game while the cue is lit — early/late only affects grade.
    const alreadyHitThisBeat = this.lastHitBeatIndex === beatIndex;

    // Accuracy only while in the cue window / near the target — not while traveling.
    if (opts.playing && now - this.lastSyncSampleAt > 90) {
      this.lastSyncSampleAt = now;
      if (near || beatPhase < 0.42 || beatPhase > 0.88) {
        const accuracy = clamp(1 - dist / (HIT_RADIUS * 1.85), 0, 1);
        this.accuracySamples.push(accuracy);
        if (this.accuracySamples.length > 40) this.accuracySamples.shift();
        this.sync += (accuracy - this.sync) * 0.18;
      }
    }

    // Once per beat while on the lit cue — no enter-edge required (holding early still counts).
    if (opts.playing && near && cool && !alreadyHitThisBeat) {
      const phaseErr = beatPhase > 0.5 ? 1 - beatPhase : beatPhase;
      // Wide timing forgiveness — mid-beat still scores decently.
      const timingHit = clamp(1 - phaseErr / 0.62, 0.35, 1);
      const distScore = clamp(1 - dist / (HIT_RADIUS * 1.25), 0, 1);
      this.timingSamples.push(timingHit);
      if (this.timingSamples.length > 40) this.timingSamples.shift();
      this.shapeSamples.push(distScore * 0.45 + timingHit * 0.55);
      if (this.shapeSamples.length > 40) this.shapeSamples.shift();
      this.accuracySamples.push(distScore);
      if (this.accuracySamples.length > 40) this.accuracySamples.shift();
      this.sync += (distScore * 0.4 + timingHit * 0.6 - this.sync) * 0.35;
      this.lastHitAt = now;
      this.lastHitBeatIndex = beatIndex;
      this.cueHits += 1;
      beat = true;
      if (!this.calibrating) boostTempo(timingHit);
      this.recordCalibSample(segmentBeat, tip.x, tip.y, now);
    } else if (
      opts.playing &&
      !alreadyHitThisBeat &&
      this.lastHitBeatIndex !== beatIndex &&
      this.lastMissBeatIndex !== beatIndex &&
      beatPhase > 0.82
    ) {
      // Soft miss — once late in the beat, not a harsh zero.
      this.timingSamples.push(0.45);
      if (this.timingSamples.length > 40) this.timingSamples.shift();
      this.lastMissBeatIndex = beatIndex;
    }

    if (opts.playing) {
      if (
        beatIndex > 0 &&
        this.lastHitBeatIndex < beatIndex - 1 &&
        beatPhase > 0.55 &&
        this.lastHitBeatIndex !== beatIndex
      ) {
        this.sync += (0.32 - this.sync) * 0.06;
      }

      if (this.calibrating) {
        // Steady tempo while learning the user's figure.
        this.tempoRate += (0.92 - this.tempoRate) * 0.25;
        this.tempoRate = clamp(this.tempoRate, TEMPO_CRAWL, TEMPO_MAX);
      } else if (!beat) {
        // Hit-gated tempo: keep normal pace only while cues are landed.
        const sinceHitMs = this.lastHitAt > 0 ? now - this.lastHitAt : Infinity;
        const missedCurrent =
          this.lastHitBeatIndex !== beatIndex && beatPhase > 0.62;
        const skippedBeats = this.lastHitBeatIndex >= 0 && beatIndex - this.lastHitBeatIndex > 1;
        if (missedCurrent || skippedBeats || sinceHitMs > beatPeriodMs * 1.15) {
          const late =
            missedCurrent || skippedBeats
              ? 0.55 + clamp(beatPhase, 0, 1) * 0.45
              : clamp((sinceHitMs - beatPeriodMs) / beatPeriodMs, 0.35, 1);
          decayTempo(late);
        } else if (this.lastHitBeatIndex === beatIndex) {
          this.tempoRate += (TEMPO_MAX - this.tempoRate) * 0.1;
          this.tempoRate = clamp(this.tempoRate, TEMPO_CRAWL, TEMPO_MAX);
        }
      }

      const dyn = clamp(this.phrase * (0.4 + 0.6 * this.sync), 0.12, 1);
      this.dynamics += (dyn - this.dynamics) * 0.2;
      this.dynamicsSamples.push(this.dynamics);
      if (this.dynamicsSamples.length > 60) this.dynamicsSamples.shift();
    }

    return {
      tempoRate: this.tempoRate,
      dynamics: this.dynamics,
      sync: this.sync,
      phrase: this.phrase,
      beat,
      pulse,
      beatPhase,
      measurePhase,
      guideX: lit.x,
      guideY: lit.y,
      tipX: this.tipX,
      tipY: this.tipY,
      active: true,
      nextBeat: segmentBeat,
      targets: this.getTargets(),
      pathEdges,
      grade: this.gradeFrozen && this.frozenGrade ? this.frozenGrade : this.computeGrade(),
      calib: this.getCalibProgress(),
    };
  }
}
