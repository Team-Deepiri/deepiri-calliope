import type { Landmark } from "./deriveSignals";

export type ConductMode = "pattern" | "free";

export type BatonState = {
  /** Playback rate vs score base BPM (clamped). */
  tempoRate: number;
  /** 0–1 dynamics from stroke size. */
  dynamics: number;
  /** Soft sync placeholder for free mode UI. */
  sync: number;
  /** Recent gesture size / phrase envelope (0–1). */
  phrase: number;
  /** True when a beat onset was detected this update. */
  beat: boolean;
  tipY: number;
  tipX: number;
  active: boolean;
};

export type BatonUpdateOpts = {
  baseBpm: number;
  now?: number;
};

const INDEX_TIP = 8;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Free-tempo baton detector: stroke rate → tempo, stroke size → dynamics.
 */
export class BatonDetector {
  private samples: Array<{ t: number; y: number; x: number }> = [];
  private lastBeatAt = 0;
  private intervals: number[] = [];
  private tempoRate = 1;
  private dynamics = 0.55;
  private sync = 0.5;
  private phrase = 0.45;
  private tipX = 0.5;
  private tipY = 0.5;

  reset(): void {
    this.samples = [];
    this.lastBeatAt = 0;
    this.intervals = [];
    this.tempoRate = 1;
    this.dynamics = 0.55;
    this.sync = 0.5;
    this.phrase = 0.45;
  }

  update(
    rightLandmarks: Landmark[] | null | undefined,
    opts: BatonUpdateOpts | number,
  ): BatonState {
    const o: BatonUpdateOpts =
      typeof opts === "number" ? { baseBpm: opts } : opts;
    const now = o.now ?? performance.now();

    if (!rightLandmarks || rightLandmarks.length < 21) {
      this.tempoRate += (1 - this.tempoRate) * 0.04;
      this.dynamics += (0.35 - this.dynamics) * 0.05;
      this.samples = [];
      return {
        tempoRate: this.tempoRate,
        dynamics: this.dynamics,
        sync: this.sync,
        phrase: this.phrase,
        beat: false,
        tipX: this.tipX,
        tipY: this.tipY,
        active: false,
      };
    }

    const tip = rightLandmarks[INDEX_TIP];
    this.tipX = tip.x;
    this.tipY = tip.y;
    this.samples.push({ t: now, y: tip.y, x: tip.x });
    this.samples = this.samples.filter((s) => now - s.t <= 320);

    if (this.samples.length >= 2) {
      let path = 0;
      for (let i = 1; i < this.samples.length; i++) {
        const a = this.samples[i - 1];
        const b = this.samples[i];
        path += Math.hypot(b.x - a.x, b.y - a.y);
      }
      const ys = this.samples.map((s) => s.y);
      const span = Math.max(...ys) - Math.min(...ys);
      const phraseTarget = clamp(path * 2.4 + span * 2.8, 0.12, 1);
      this.phrase += (phraseTarget - this.phrase) * 0.18;
    }

    let beat = false;
    if (this.samples.length >= 4) {
      const a = this.samples[this.samples.length - 3];
      const b = this.samples[this.samples.length - 2];
      const c = this.samples[this.samples.length - 1];
      const v1 = (b.y - a.y) / Math.max(1, b.t - a.t);
      const v2 = (c.y - b.y) / Math.max(1, c.t - b.t);
      const reversal = v1 * v2 < 0 && Math.abs(v1) > 0.00035 && Math.abs(v2) > 0.00025;
      const cool = now - this.lastBeatAt > 160;
      if (reversal && cool) {
        if (this.lastBeatAt > 0) {
          const interval = now - this.lastBeatAt;
          if (interval > 220 && interval < 1600) {
            this.intervals.push(interval);
            if (this.intervals.length > 6) this.intervals.shift();
            const avg =
              this.intervals.reduce((s, x) => s + x, 0) / this.intervals.length;
            const conductedBpm = 60000 / avg;
            const target = clamp(conductedBpm / Math.max(30, o.baseBpm), 0.55, 1.45);
            this.tempoRate += (target - this.tempoRate) * 0.35;
          }
        }
        this.lastBeatAt = now;
        beat = true;
      }
    }

    if (now - this.lastBeatAt > 1200) {
      this.tempoRate += (1 - this.tempoRate) * 0.06;
    }
    if (this.samples.length >= 2) {
      const ys = this.samples.map((s) => s.y);
      const span = Math.max(...ys) - Math.min(...ys);
      const height = 1 - tip.y;
      const dyn = clamp(span * 3.2 + height * 0.35, 0.15, 1);
      this.dynamics += (dyn - this.dynamics) * 0.2;
    }

    return {
      tempoRate: this.tempoRate,
      dynamics: this.dynamics,
      sync: this.sync,
      phrase: this.phrase,
      beat,
      tipX: this.tipX,
      tipY: this.tipY,
      active: true,
    };
  }
}
