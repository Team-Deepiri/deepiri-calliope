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
  /** True on musical downbeat crossings (score pulse). */
  pulse: boolean;
  /** 0–1 phase within the current musical beat. */
  beatPhase: number;
  tipX: number;
  tipY: number;
  active: boolean;
  /** Beat the score is on now (1–4) — follow this node. */
  nextBeat: PatternBeat;
  targets: PatternTarget[];
  grade: ConductGrade;
};

export type PatternUpdateOpts = {
  baseBpm: number;
  scoreTime: number;
  duration: number;
  playing: boolean;
  now?: number;
};

const INDEX_TIP = 8;
/** Moderate disks — ease comes from predictive tip, not huge targets. */
const HIT_RADIUS = 0.17;
const HIT_COOLDOWN_MS = 130;
/** Mild look-ahead for hits only (display stays smoothed). */
const TIP_LEAD_SEC = 0.065;
const TIP_LEAD_MAX = 0.038;
/** Adaptive display smooth: low speed → steadier; high speed → tracks tight. */
const TIP_SMOOTH_STILL = 0.28;
const TIP_SMOOTH_MOVE = 0.72;
const TIP_SPEED_REF = 1.1; // normalized units / sec ≈ “moving”
const VEL_SMOOTH = 0.28;

/** Classic 4/4 figure in landmark space (mirrored on screen via 1−x). */
export const PATTERN_4_4: PatternTarget[] = [
  { beat: 1, x: 0.5, y: 0.78, label: "1" },
  { beat: 2, x: 0.74, y: 0.52, label: "2" },
  { beat: 3, x: 0.26, y: 0.52, label: "3" },
  { beat: 4, x: 0.5, y: 0.22, label: "4" },
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function letterFromScore(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function coachFromBreakdown(b: ConductGradeBreakdown, phrase: number): string {
  const entries: Array<[keyof ConductGradeBreakdown, number, string]> = [
    ["timing", b.timing, "Watch the beat — intervals are uneven or rushed."],
    ["accuracy", b.accuracy, "Aim closer to the glowing beat nodes."],
    ["continuity", b.continuity, "Keep the pattern going — long gaps stall the orchestra."],
    ["shape", b.shape, "Hit beats in order: down → left → right → up."],
    ["expression", b.expression, "Vary gesture size for louder and softer phrases."],
  ];
  entries.sort((a, c) => a[1] - c[1]);
  if (phrase < 0.28 && b.expression < 0.55) {
    return "Use bigger arm patterns — small gestures mute the orchestra.";
  }
  if (entries[0][1] >= 0.75) return "Strong conducting — clear figure and steady pulse.";
  return entries[0][2];
}

/**
 * Pattern conducting locked to the score's beat grid.
 * The glowing node advances with musical time (bpmHint); hit that node in time.
 * Gesture size still shapes dynamics; tempo stays near the score.
 */
export class PatternConductDetector {
  private samples: Array<{ t: number; x: number; y: number }> = [];
  private lastHitAt = 0;
  private lastHitBeatIndex = -1;
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
  private insideNext = false;

  private timingSamples: number[] = [];
  private accuracySamples: number[] = [];
  private orderedHits = 0;
  private totalHitAttempts = 0;
  private expectedBeats = 0;
  private dynamicsSamples: number[] = [];
  private gradeFrozen = false;
  private frozenGrade: ConductGrade | null = null;
  private lastScoreTime = 0;

  reset(): void {
    this.samples = [];
    this.lastHitAt = 0;
    this.lastHitBeatIndex = -1;
    this.lastPulseBeat = -1;
    this.tempoRate = 1;
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
    this.insideNext = false;
    this.timingSamples = [];
    this.accuracySamples = [];
    this.orderedHits = 0;
    this.totalHitAttempts = 0;
    this.expectedBeats = 0;
    this.dynamicsSamples = [];
    this.gradeFrozen = false;
    this.frozenGrade = null;
    this.lastScoreTime = 0;
  }

  /** Call when a new Play / Replay starts so grading begins fresh. */
  beginPerformance(): void {
    this.reset();
  }

  freezeGrade(): ConductGrade {
    if (this.gradeFrozen && this.frozenGrade) return this.frozenGrade;
    const g = this.computeGrade();
    g.frozen = true;
    this.gradeFrozen = true;
    this.frozenGrade = g;
    return g;
  }

  get targets(): PatternTarget[] {
    return PATTERN_4_4;
  }

  get nextBeat(): PatternBeat {
    return PATTERN_4_4[0].beat;
  }

  private mean(xs: number[], fallback: number): number {
    if (!xs.length) return fallback;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }

  private computeGrade(): ConductGrade {
    if (this.frozenGrade && this.gradeFrozen) return this.frozenGrade;

    const timing = this.mean(this.timingSamples, 0.5);
    const accuracy = this.mean(this.accuracySamples, 0.5);
    const continuity =
      this.expectedBeats > 0
        ? clamp(this.orderedHits / Math.max(1, this.expectedBeats), 0, 1)
        : clamp(this.orderedHits / 8, 0, 1);
    const shape =
      this.totalHitAttempts > 0
        ? clamp(this.orderedHits / this.totalHitAttempts, 0, 1)
        : 0.5;

    let expression = 0.5;
    if (this.dynamicsSamples.length >= 4) {
      const m = this.mean(this.dynamicsSamples, 0.5);
      const variance =
        this.dynamicsSamples.reduce((s, v) => s + (v - m) ** 2, 0) /
        this.dynamicsSamples.length;
      expression = clamp(Math.sqrt(variance) * 4.5 + this.phrase * 0.35, 0.15, 1);
    } else {
      expression = clamp(this.phrase, 0.2, 0.7);
    }

    const breakdown: ConductGradeBreakdown = {
      timing,
      accuracy,
      continuity,
      shape,
      expression,
    };
    const score = Math.round(
      clamp(
        (timing * 0.28 +
          accuracy * 0.22 +
          continuity * 0.22 +
          shape * 0.16 +
          expression * 0.12) *
          100,
        0,
        100,
      ),
    );

    return {
      score,
      letter: this.orderedHits < 4 ? "—" : letterFromScore(score),
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
    const beatPeriodSec = 60 / Math.max(40, opts.baseBpm);
    const beatPeriodMs = beatPeriodSec * 1000;
    const beatFloat = opts.playing ? opts.scoreTime / beatPeriodSec : 0;
    const beatIndex = Math.floor(beatFloat);
    const beatPhase = beatFloat - Math.floor(beatFloat);
    const measureIdx = ((beatIndex % 4) + 4) % 4;
    const target = PATTERN_4_4[measureIdx];
    const pulse =
      opts.playing && beatIndex !== this.lastPulseBeat && beatPhase < 0.12;
    if (pulse) this.lastPulseBeat = beatIndex;

    const grade = this.gradeFrozen && this.frozenGrade
      ? this.frozenGrade
      : this.computeGrade();

    if (opts.playing && opts.scoreTime > this.lastScoreTime) {
      const dt = opts.scoreTime - this.lastScoreTime;
      this.expectedBeats += dt / beatPeriodSec;
      this.lastScoreTime = opts.scoreTime;
    }

    // Stay with the score pulse so figure lighting matches the music
    if (opts.playing) {
      this.tempoRate += (1 - this.tempoRate) * 0.2;
    }

    if (!rightLandmarks || rightLandmarks.length < 21) {
      if (opts.playing) {
        this.dynamics += (0.25 - this.dynamics) * 0.05;
        this.sync += (0.3 - this.sync) * 0.04;
      }
      this.samples = [];
      this.insideNext = false;
      return {
        tempoRate: this.tempoRate,
        dynamics: this.dynamics,
        sync: this.sync,
        phrase: this.phrase,
        beat: false,
        pulse,
        beatPhase,
        tipX: this.tipX,
        tipY: this.tipY,
        active: false,
        nextBeat: target.beat,
        targets: PATTERN_4_4,
        grade,
      };
    }

    const tip = rightLandmarks[INDEX_TIP];
    this.samples.push({ t: now, x: tip.x, y: tip.y });
    this.samples = this.samples.filter((s) => now - s.t <= 280);

    if (this.samples.length >= 2) {
      const a = this.samples[this.samples.length - 2];
      const b = this.samples[this.samples.length - 1];
      const dt = Math.max(12, b.t - a.t) / 1000;
      const ivx = (b.x - a.x) / dt;
      const ivy = (b.y - a.y) / dt;
      this.velX += (ivx - this.velX) * VEL_SMOOTH;
      this.velY += (ivy - this.velY) * VEL_SMOOTH;
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
      let path = 0;
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
          path += Math.hypot(s.x - a.x, s.y - a.y);
        }
      }
      const box = (maxX - minX) * (maxY - minY);
      const phraseTarget = clamp(path * 1.8 + box * 5.5, 0.1, 1);
      this.phrase += (phraseTarget - this.phrase) * 0.28;
    }

    const distRaw = Math.hypot(this.smoothX - target.x, this.smoothY - target.y);
    const distAim = Math.hypot(aimX - target.x, aimY - target.y);
    const dist = Math.min(distRaw, distAim);
    const inDisk = dist <= HIT_RADIUS;

    let approaching = false;
    if (this.samples.length >= 3) {
      const a = this.samples[this.samples.length - 3];
      const c = this.samples[this.samples.length - 1];
      const dPrev = Math.hypot(a.x - target.x, a.y - target.y);
      const dNow = Math.hypot(c.x - target.x, c.y - target.y);
      approaching = dNow < dPrev - 0.003;
    }

    let beat = false;
    const cool = now - this.lastHitAt > Math.min(HIT_COOLDOWN_MS, beatPeriodMs * 0.35);
    // Prefer ictus near the start of each musical beat
    const inTimeWindow = beatPhase < 0.48 || beatPhase > 0.9;
    const alreadyHitThisBeat = this.lastHitBeatIndex === beatIndex;

    if (
      opts.playing &&
      inDisk &&
      !this.insideNext &&
      cool &&
      !alreadyHitThisBeat &&
      inTimeWindow &&
      (approaching || dist < HIT_RADIUS * 0.65 || distAim < HIT_RADIUS * 0.85)
    ) {
      this.totalHitAttempts += 1;
      this.orderedHits += 1;
      const accuracy = clamp(1 - dist / HIT_RADIUS, 0, 1);
      this.accuracySamples.push(accuracy);
      if (this.accuracySamples.length > 48) this.accuracySamples.shift();

      // Timing vs musical ictus (phase 0)
      const phaseErr = beatPhase > 0.5 ? 1 - beatPhase : beatPhase;
      const timingHit = clamp(1 - phaseErr / 0.42, 0, 1);
      this.timingSamples.push(timingHit);
      if (this.timingSamples.length > 48) this.timingSamples.shift();

      this.sync += ((accuracy * 0.45 + timingHit * 0.55) - this.sync) * 0.4;
      this.lastHitAt = now;
      this.lastHitBeatIndex = beatIndex;
      beat = true;
    } else if (
      opts.playing &&
      inDisk &&
      !this.insideNext &&
      cool &&
      !alreadyHitThisBeat &&
      !inTimeWindow
    ) {
      // On the right node but off the song beat
      this.totalHitAttempts += 1;
      this.timingSamples.push(0.2);
      if (this.timingSamples.length > 48) this.timingSamples.shift();
    }

    this.insideNext = inDisk;

    if (opts.playing) {
      // Missed a musical beat entirely
      if (
        beatIndex > 0 &&
        this.lastHitBeatIndex < beatIndex - 1 &&
        beatPhase > 0.55 &&
        this.lastHitBeatIndex !== beatIndex
      ) {
        this.sync += (0.32 - this.sync) * 0.06;
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
      tipX: this.tipX,
      tipY: this.tipY,
      active: true,
      nextBeat: target.beat,
      targets: PATTERN_4_4,
      grade: this.gradeFrozen && this.frozenGrade ? this.frozenGrade : this.computeGrade(),
    };
  }
}
