import type { PianoNote } from "../components/studio/PianoRoll";

const NOTE_FREQS: Record<number, number> = {};

function midiToFreq(midi: number): number {
  if (NOTE_FREQS[midi]) return NOTE_FREQS[midi];
  NOTE_FREQS[midi] = 440 * Math.pow(2, (midi - 69) / 12);
  return NOTE_FREQS[midi];
}

export type SynthWaveform = "sine" | "sawtooth" | "square" | "triangle";

export type SynthConfig = {
  waveform: SynthWaveform;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filterCutoff: number;
  filterResonance: number;
  reverbMix: number;
};

export const DEFAULT_SYNTH: SynthConfig = {
  waveform: "sawtooth",
  attack: 0.01,
  decay: 0.2,
  sustain: 0.6,
  release: 0.3,
  filterCutoff: 4000,
  filterResonance: 1,
  reverbMix: 0.15,
};

export class SynthEngine {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private filter: BiquadFilterNode;
  private reverb: ConvolverNode | null = null;
  private reverbGain: GainNode;
  private dryGain: GainNode;
  private activeOscillators: Map<string, { osc: OscillatorNode; gain: GainNode }> = new Map();
  private config: SynthConfig = { ...DEFAULT_SYNTH };

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = 0.5;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = this.config.filterCutoff;
    this.filter.Q.value = this.config.filterResonance;
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = this.config.reverbMix;
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1 - this.config.reverbMix;

    this.filter.connect(this.dryGain);
    this.dryGain.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);

    this.initReverb();
  }

  private async initReverb() {
    try {
      const len = this.ctx.sampleRate * 1.5;
      const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      }
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = buf;
      this.filter.connect(this.reverb);
      this.reverb.connect(this.reverbGain);
      this.reverbGain.connect(this.masterGain);
    } catch {
      this.filter.connect(this.masterGain);
    }
  }

  updateConfig(cfg: Partial<SynthConfig>) {
    Object.assign(this.config, cfg);
    this.filter.frequency.value = this.config.filterCutoff;
    this.filter.Q.value = this.config.filterResonance;
    this.reverbGain.gain.value = this.config.reverbMix;
    this.dryGain.gain.value = 1 - this.config.reverbMix;
  }

  noteOn(midi: number, velocity = 100, key?: string) {
    const id = key ?? String(midi);
    this.noteOff(midi, key);

    const freq = midiToFreq(midi);
    const vel = Math.min(1, velocity / 127);
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = this.config.waveform;
    osc.frequency.value = freq;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vel * 0.3, now + this.config.attack);
    gain.gain.linearRampToValueAtTime(vel * 0.3 * this.config.sustain, now + this.config.attack + this.config.decay);

    osc.connect(gain);
    gain.connect(this.filter);
    osc.start(now);
    osc.onended = () => {
      gain.disconnect();
      osc.disconnect();
    };

    this.activeOscillators.set(id, { osc, gain });
  }

  noteOff(_midi: number, key?: string) {
    const id = key ?? String(_midi);
    const entry = this.activeOscillators.get(id);
    if (!entry) return;
    this.activeOscillators.delete(id);

    const now = this.ctx.currentTime;
    entry.gain.gain.cancelScheduledValues(now);
    entry.gain.gain.setValueAtTime(entry.gain.gain.value, now);
    entry.gain.gain.linearRampToValueAtTime(0, now + this.config.release);
    entry.osc.stop(now + this.config.release + 0.05);
  }

  playNotes(notes: PianoNote[], startStep: number, endStep: number, stepsPerBeat: number, bpm: number) {
    const secPerStep = 60 / bpm / stepsPerBeat;
    for (const note of notes) {
      if (note.start >= endStep || note.start + note.duration <= startStep) continue;
      const startSec = (note.start - startStep) * secPerStep;
      const durSec = note.duration * secPerStep;

      const freq = midiToFreq(note.midi);
      const vel = Math.min(1, (note.velocity ?? 100) / 127);
      const now = this.ctx.currentTime + startSec;

      const osc = this.ctx.createOscillator();
      osc.type = this.config.waveform;
      osc.frequency.value = freq;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(vel * 0.25, now + this.config.attack);
      gain.gain.setValueAtTime(vel * 0.25 * this.config.sustain, now + this.config.attack + this.config.decay);
      gain.gain.setValueAtTime(vel * 0.25 * this.config.sustain, now + durSec - this.config.release);
      gain.gain.linearRampToValueAtTime(0, now + durSec);

      osc.connect(gain);
      gain.connect(this.filter);
      osc.start(now);
      osc.stop(now + durSec + 0.05);
    }
  }

  disconnect() {
    for (const [, entry] of this.activeOscillators) {
      entry.osc.stop();
    }
    this.activeOscillators.clear();
    this.masterGain.disconnect();
    this.filter.disconnect();
  }

  get analyserNode(): AnalyserNode | null {
    return null;
  }
}

let _sharedCtx: AudioContext | null = null;

export function getSharedSynthContext(): AudioContext {
  if (!_sharedCtx || _sharedCtx.state === "closed") {
    _sharedCtx = new AudioContext();
  }
  return _sharedCtx;
}
