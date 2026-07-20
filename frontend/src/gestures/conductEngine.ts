import type { ConductLevels, ConductStemId } from "./conductMap";

type StemNodes = {
  source: AudioBufferSourceNode;
  gain: GainNode;
};

const STEM_IDS: ConductStemId[] = ["drums", "chords", "melody"];

/**
 * Looped multi-stem player for Conduct mode.
 * Gains are driven every frame via apply().
 */
export class ConductEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private stems = new Map<ConductStemId, StemNodes>();
  private _running = false;

  get running(): boolean {
    return this._running;
  }

  async arm(buffers: Record<ConductStemId, AudioBuffer>): Promise<void> {
    this.disarm();

    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);

    for (const id of STEM_IDS) {
      const buffer = buffers[id];
      if (!buffer) continue;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      gain.connect(master);
      source.start();
      this.stems.set(id, { source, gain });
    }

    this.ctx = ctx;
    this.master = master;
    this._running = true;
  }

  apply(levels: ConductLevels, now = this.ctx?.currentTime ?? 0): void {
    if (!this._running || !this.ctx || !this.master) return;
    const t = Math.max(now, this.ctx.currentTime);
    const tau = 0.04;

    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(levels.master * 0.85, t, tau);

    for (const id of STEM_IDS) {
      const stem = this.stems.get(id);
      if (!stem) continue;
      const level = levels[id];
      stem.gain.gain.cancelScheduledValues(t);
      stem.gain.gain.setTargetAtTime(level, t, tau);
    }
  }

  disarm(): void {
    if (!this._running && !this.ctx) {
      this.stems.clear();
      return;
    }

    const t = this.ctx?.currentTime ?? 0;
    for (const stem of this.stems.values()) {
      try {
        stem.gain.gain.cancelScheduledValues(t);
        stem.gain.gain.setTargetAtTime(0, t, 0.02);
        stem.source.stop(t + 0.05);
      } catch {
        /* ignore */
      }
      try {
        stem.source.disconnect();
        stem.gain.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.stems.clear();

    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }

    this.ctx = null;
    this.master = null;
    this._running = false;
  }
}

export async function decodeStemBuffer(
  ctx: AudioContext,
  data: ArrayBuffer,
): Promise<AudioBuffer> {
  return ctx.decodeAudioData(data.slice(0));
}

export function createDecodeContext(): AudioContext {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctx();
}
