import type { HandSignals } from "./deriveSignals";
import { EMPTY_SIGNALS } from "./deriveSignals";

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/** Both hands share the same pitch range so neither feels “weaker”. */
export function heightToHz(height: number): number {
  return lerp(130, 720, height ** 1.1);
}

export function opennessToCutoff(openness: number): number {
  return lerp(400, 7000, openness ** 0.85);
}

/** Heard level from a hand — used by UI activity lights too. */
export function signalsToAmp(signals: HandSignals): number {
  if (!signals.detected || signals.fist) return 0;
  // Either an open pinch OR finger spread should be loud — relaxed fists stay quiet.
  const express = Math.max(1 - signals.pinch, signals.openness * 0.85);
  return lerp(0.28, 0.85, express);
}

type Voice = {
  osc: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
};

/**
 * Two independent voices: Left → pan L (saw), Right → pan R (triangle).
 * Both can sound at once.
 */
export class GestureSynth {
  private ctx: AudioContext | null = null;
  private left: Voice | null = null;
  private right: Voice | null = null;
  private _armed = false;

  get armed(): boolean {
    return this._armed;
  }

  async arm(): Promise<void> {
    if (this._armed && this.ctx && this.left && this.right) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }

    // Rebuild if a prior disarm left us half-initialized
    this.teardown();

    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);

    const makeVoice = (type: OscillatorType, panValue: number): Voice => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = 220;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1800;
      filter.Q.value = 0.6;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      pan.pan.value = panValue;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(pan);
      pan.connect(master);
      osc.start();
      return { osc, filter, gain, pan };
    };

    this.ctx = ctx;
    this.left = makeVoice("sawtooth", -0.85);
    this.right = makeVoice("triangle", 0.85);
    this._armed = true;
  }

  applyStereo(left: HandSignals, right: HandSignals, now = this.ctx?.currentTime ?? 0): void {
    if (!this._armed || !this.ctx || !this.left || !this.right) return;
    this.applyVoice(this.left, left, now);
    this.applyVoice(this.right, right, now);
  }

  applyHands(hands: HandSignals[], now = this.ctx?.currentTime ?? 0): void {
    const left = hands.find((h) => h.label === "Left") ?? hands[0] ?? EMPTY_SIGNALS;
    const right = hands.find((h) => h.label === "Right") ?? hands[1] ?? EMPTY_SIGNALS;
    this.applyStereo(left, right, now);
  }

  apply(signals: HandSignals, now = this.ctx?.currentTime ?? 0): void {
    this.applyStereo(signals, EMPTY_SIGNALS, now);
  }

  private applyVoice(voice: Voice, signals: HandSignals, now: number): void {
    if (!this.ctx) return;
    const t = Math.max(now, this.ctx.currentTime);
    const attack = 0.025;
    const release = 0.05;
    const amp = signalsToAmp(signals);

    if (amp <= 0) {
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setTargetAtTime(0, t, release);
      return;
    }

    voice.osc.frequency.cancelScheduledValues(t);
    voice.osc.frequency.setTargetAtTime(heightToHz(signals.height), t, 0.02);

    voice.filter.frequency.cancelScheduledValues(t);
    voice.filter.frequency.setTargetAtTime(opennessToCutoff(signals.openness), t, 0.03);

    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setTargetAtTime(amp, t, attack);
  }

  private teardown(): void {
    const ctx = this.ctx;
    const voices = [this.left, this.right];
    try {
      const t = ctx?.currentTime ?? 0;
      for (const v of voices) {
        if (!v) continue;
        try {
          v.gain.gain.cancelScheduledValues(t);
          v.gain.gain.setTargetAtTime(0, t, 0.02);
          v.osc.stop(t + 0.05);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
    try {
      void ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.left = null;
    this.right = null;
    this._armed = false;
  }

  disarm(): void {
    if (!this._armed && !this.ctx) return;
    this.teardown();
  }
}
