import type { ConductLevels, ConductStemId } from "./conductMap";

type StemNodes = {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
};

const GENERATED: Array<"drums" | "chords" | "melody"> = ["drums", "chords", "melody"];

function brightnessToHz(brightness: number): number {
  const t = Math.min(1, Math.max(0, brightness));
  return 400 + t * t * 7600;
}

/** Build a looping filtered-noise “energy / riser” buffer (no backend). */
export function createEnergyBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.floor(seconds * sr));
  const buffer = ctx.createBuffer(1, n, sr);
  const data = buffer.getChannelData(0);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    // Soft pink-ish noise + slow amplitude swell for chorus lift
    const white = Math.random() * 2 - 1;
    prev = prev * 0.92 + white * 0.08;
    const env = 0.35 + 0.65 * Math.sin((Math.PI * i) / n);
    data[i] = prev * env * 0.55;
  }
  return buffer;
}

/**
 * Looped multi-stem player for Conduct mode.
 * Gains + filters driven every frame; energy layer is client-built.
 */
export class ConductEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private masterFilter: BiquadFilterNode | null = null;
  private stems = new Map<ConductStemId, StemNodes>();
  private _running = false;
  private bpm = 120;
  private startedAt = 0;

  get running(): boolean {
    return this._running;
  }

  /** Beat phase 0–1 within the current quarter note. */
  beatPhase(nowMs = performance.now()): number {
    if (!this._running) return 0;
    const beatMs = 60000 / Math.max(1, this.bpm);
    const elapsed = nowMs - this.startedAt;
    return (elapsed % beatMs) / beatMs;
  }

  /** 1 at downbeat, decays toward 0 through the beat. */
  beatPulse(nowMs = performance.now()): number {
    const phase = this.beatPhase(nowMs);
    return Math.max(0, 1 - phase * 1.35);
  }

  async arm(
    buffers: Record<"drums" | "chords" | "melody", AudioBuffer>,
    bpm: number,
  ): Promise<void> {
    this.disarm();

    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const masterFilter = ctx.createBiquadFilter();
    masterFilter.type = "lowpass";
    masterFilter.frequency.value = 4200;
    masterFilter.Q.value = 0.7;

    const master = ctx.createGain();
    master.gain.value = 0.75;
    masterFilter.connect(master);
    master.connect(ctx.destination);

    const connectStem = (id: ConductStemId, buffer: AudioBuffer, pan = 0) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 5000;
      filter.Q.value = 0.65;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(masterFilter);
      source.start();
      this.stems.set(id, { source, filter, gain });
    };

    for (const id of GENERATED) {
      connectStem(id, buffers[id], id === "drums" ? 0 : id === "chords" ? -0.25 : 0.3);
    }

    const energyBuf = createEnergyBuffer(ctx, 2.5);
    connectStem("energy", energyBuf, 0);

    this.ctx = ctx;
    this.master = master;
    this.masterFilter = masterFilter;
    this.bpm = bpm;
    this.startedAt = performance.now();
    this._running = true;
  }

  apply(levels: ConductLevels, now = this.ctx?.currentTime ?? 0): void {
    if (!this._running || !this.ctx || !this.master || !this.masterFilter) return;
    const t = Math.max(now, this.ctx.currentTime);
    const tau = 0.09;

    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(levels.master * 0.88, t, tau);

    const cut = brightnessToHz(levels.brightness);
    this.masterFilter.frequency.cancelScheduledValues(t);
    this.masterFilter.frequency.setTargetAtTime(cut, t, tau);

    const setStem = (id: ConductStemId, level: number, brightMul: number) => {
      const stem = this.stems.get(id);
      if (!stem) return;
      stem.gain.gain.cancelScheduledValues(t);
      stem.gain.gain.setTargetAtTime(level, t, tau);
      stem.filter.frequency.cancelScheduledValues(t);
      stem.filter.frequency.setTargetAtTime(cut * brightMul, t, tau);
    };

    setStem("drums", levels.drums, 0.85);
    setStem("chords", levels.chords, 1);
    setStem("melody", levels.melody, 1.15);
    setStem("energy", levels.energy, 1.4);
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
        stem.source.stop(t + 0.06);
      } catch {
        /* ignore */
      }
      try {
        stem.source.disconnect();
        stem.filter.disconnect();
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
    this.masterFilter = null;
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
