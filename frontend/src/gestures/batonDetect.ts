import type { Landmark } from "./deriveSignals";

export type BatonState = {
  /** Playback rate vs score base BPM (clamped). */
  tempoRate: number;
  /** 0–1 dynamics from stroke size / height. */
  dynamics: number;
  /** True when a beat onset was detected this update. */
  beat: boolean;
  /** Tip y (0–1), useful for trail UI. */
  tipY: number;
  tipX: number;
  active: boolean;
};

const INDEX_TIP = 8;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Detect baton beats from right-hand index tip vertical motion.
 * Pencil tip ≈ index fingertip in the selfie view.
 */
export class BatonDetector {
  private samples: Array<{ t: number; y: number }> = [];
  private lastBeatAt = 0;
  private intervals: number[] = [];
  private tempoRate = 1;
  private dynamics = 0.55;
  private tipX = 0.5;
  private tipY = 0.5;

  reset(): void {
    this.samples = [];
    this.lastBeatAt = 0;
    this.intervals = [];
    this.tempoRate = 1;
    this.dynamics = 0.55;
  }

  update(
    rightLandmarks: Landmark[] | null | undefined,
    baseBpm: number,
    now = performance.now(),
  ): BatonState {
    if (!rightLandmarks || rightLandmarks.length < 21) {
      // Ease tempo toward 1 when baton disappears
      this.tempoRate += (1 - this.tempoRate) * 0.04;
      this.dynamics += (0.35 - this.dynamics) * 0.05;
      this.samples = [];
      return {
        tempoRate: this.tempoRate,
        dynamics: this.dynamics,
        beat: false,
        tipX: this.tipX,
        tipY: this.tipY,
        active: false,
      };
    }

    const tip = rightLandmarks[INDEX_TIP];
    this.tipX = tip.x;
    this.tipY = tip.y;
    this.samples.push({ t: now, y: tip.y });
    this.samples = this.samples.filter((s) => now - s.t <= 280);

    let beat = false;
    if (this.samples.length >= 4) {
      const a = this.samples[this.samples.length - 3];
      const b = this.samples[this.samples.length - 2];
      const c = this.samples[this.samples.length - 1];
      const v1 = (b.y - a.y) / Math.max(1, b.t - a.t);
      const v2 = (c.y - b.y) / Math.max(1, c.t - b.t);
      // Peak: moving down then up (or up then down) — ictus-ish
      const reversal = v1 * v2 < 0 && Math.abs(v1) > 0.00035 && Math.abs(v2) > 0.00025;
      const cool = now - this.lastBeatAt > 180;
      if (reversal && cool) {
        if (this.lastBeatAt > 0) {
          const interval = now - this.lastBeatAt;
          if (interval > 220 && interval < 1600) {
            this.intervals.push(interval);
            if (this.intervals.length > 6) this.intervals.shift();
            const avg =
              this.intervals.reduce((s, x) => s + x, 0) / this.intervals.length;
            const conductedBpm = 60000 / avg;
            const target = clamp(conductedBpm / Math.max(30, baseBpm), 0.55, 1.45);
            this.tempoRate += (target - this.tempoRate) * 0.35;
          }
        }
        this.lastBeatAt = now;
        beat = true;
      }
    }

    // Idle → ease toward nominal tempo
    if (now - this.lastBeatAt > 1200) {
      this.tempoRate += (1 - this.tempoRate) * 0.06;
    }

    // Dynamics from recent vertical travel + height (inverted y)
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
      beat,
      tipX: this.tipX,
      tipY: this.tipY,
      active: true,
    };
  }
}
