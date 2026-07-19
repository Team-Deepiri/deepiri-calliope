import type { HandSignals } from "./deriveSignals";

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/** Map height 0–1 → frequency with a musical exponential curve. */
export function heightToHz(height: number): number {
  return lerp(110, 880, height ** 1.15);
}

/** Map openness 0–1 → lowpass cutoff Hz. */
export function opennessToCutoff(openness: number): number {
  return lerp(280, 6200, openness ** 0.9);
}

/**
 * Browser Web Audio preview instrument driven by hand signals.
 * height → pitch, pinch → amplitude, openness → filter, fist → mute.
 */
export class GestureSynth {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  private _armed = false;

  get armed(): boolean {
    return this._armed;
  }

  async arm(): Promise<void> {
    if (this._armed) return;

    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 220;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1200;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    const master = ctx.createGain();
    master.gain.value = 0.18;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    master.connect(ctx.destination);
    osc.start();

    this.ctx = ctx;
    this.osc = osc;
    this.filter = filter;
    this.gain = gain;
    this._armed = true;
  }

  apply(signals: HandSignals, now = this.ctx?.currentTime ?? 0): void {
    if (!this._armed || !this.ctx || !this.osc || !this.filter || !this.gain) return;

    const t = Math.max(now, this.ctx.currentTime);
    const attack = 0.04;
    const release = 0.08;

    if (!signals.detected || signals.fist) {
      this.gain.gain.cancelScheduledValues(t);
      this.gain.gain.setTargetAtTime(0, t, release);
      return;
    }

    const hz = heightToHz(signals.height);
    this.osc.frequency.cancelScheduledValues(t);
    this.osc.frequency.setTargetAtTime(hz, t, 0.03);

    const cutoff = opennessToCutoff(signals.openness);
    this.filter.frequency.cancelScheduledValues(t);
    this.filter.frequency.setTargetAtTime(cutoff, t, 0.04);

    // Pinch closed → quieter; open fingers between thumb/index → louder
    const amp = lerp(0.02, 0.85, 1 - signals.pinch);
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(amp, t, attack);
  }

  disarm(): void {
    if (!this._armed) return;
    const ctx = this.ctx;
    const osc = this.osc;
    const gain = this.gain;

    try {
      if (gain && ctx) {
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setTargetAtTime(0, t, 0.03);
      }
      osc?.stop(ctx ? ctx.currentTime + 0.08 : undefined);
    } catch {
      /* already stopped */
    }

    try {
      void ctx?.close();
    } catch {
      /* ignore */
    }

    this.ctx = null;
    this.osc = null;
    this.filter = null;
    this.gain = null;
    this._armed = false;
  }
}
