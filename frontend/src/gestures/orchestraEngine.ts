import type { OrchestraGroupId, OrchestraScore, ScoreNote } from "./midiScore";

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

type Voice = {
  osc: OscillatorNode;
  gain: GainNode;
  stopAt: number;
};

type GroupBus = {
  gain: GainNode;
  filter: BiquadFilterNode;
};

const GROUPS: OrchestraGroupId[] = ["bass", "mid", "treble"];

/**
 * Warpable MIDI performance clock + simple multi-group synth.
 * scoreTime advances as ∫ tempoRate dt.
 */
export class OrchestraEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private groups = new Map<OrchestraGroupId, GroupBus>();
  private score: OrchestraScore | null = null;
  private noteIndex = 0;
  private scoreTime = 0;
  private lastPerf = 0;
  private tempoRate = 1;
  private running = false;
  private raf = 0;
  private activeVoices: Voice[] = [];

  get isRunning(): boolean {
    return this.running;
  }

  get currentScoreTime(): number {
    return this.scoreTime;
  }

  get duration(): number {
    return this.score?.duration ?? 0;
  }

  async arm(score: OrchestraScore): Promise<void> {
    this.disarm();

    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    const makeGroup = (cutoff: number, pan: number): GroupBus => {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      filter.Q.value = 0.7;
      const gain = ctx.createGain();
      gain.gain.value = 0.7;
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(master);
      return { gain, filter };
    };

    this.groups.set("bass", makeGroup(900, -0.2));
    this.groups.set("mid", makeGroup(2800, 0));
    this.groups.set("treble", makeGroup(6200, 0.25));

    this.ctx = ctx;
    this.master = master;
    this.score = score;
    this.noteIndex = 0;
    this.scoreTime = 0;
    this.lastPerf = performance.now();
    this.tempoRate = 1;
    this.running = true;
    this.tick();
  }

  setTempoRate(rate: number): void {
    this.tempoRate = Math.min(1.45, Math.max(0.4, rate));
  }

  setDynamics(level: number): void {
    if (!this.master || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.2 + level * 0.55, t, 0.08);
  }

  setGroupLevels(levels: Record<OrchestraGroupId, number>): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const id of GROUPS) {
      const g = this.groups.get(id);
      if (!g) continue;
      g.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, levels[id])), t, 0.08);
    }
  }

  private tick = () => {
    if (!this.running || !this.ctx || !this.score) return;
    const now = performance.now();
    const dt = (now - this.lastPerf) / 1000;
    this.lastPerf = now;
    this.scoreTime += dt * this.tempoRate;

    const lookahead = 0.45 * this.tempoRate;
    const until = this.scoreTime + lookahead;
    const notes = this.score.notes;

    while (this.noteIndex < notes.length && notes[this.noteIndex].t <= until) {
      const n = notes[this.noteIndex++];
      if (n.t + n.dur < this.scoreTime - 0.05) continue;
      this.playNote(n);
    }

    // Prune finished voice refs
    const tAudio = this.ctx.currentTime;
    this.activeVoices = this.activeVoices.filter((v) => v.stopAt > tAudio);

    if (this.scoreTime < this.score.duration + 1.5) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.running = false;
    }
  };

  private playNote(n: ScoreNote): void {
    if (!this.ctx) return;
    const bus = this.groups.get(n.group);
    if (!bus) return;

    const delay = Math.max(0, (n.t - this.scoreTime) / Math.max(0.2, this.tempoRate));
    const start = this.ctx.currentTime + delay;
    const dur = Math.min(4, n.dur / Math.max(0.35, this.tempoRate));

    const osc = this.ctx.createOscillator();
    osc.type = n.group === "bass" ? "triangle" : n.group === "mid" ? "sawtooth" : "sine";
    osc.frequency.value = midiToHz(n.midi);

    const gain = this.ctx.createGain();
    const peak = 0.04 + n.vel * 0.1;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(gain);
    gain.connect(bus.filter);
    osc.start(start);
    osc.stop(start + dur + 0.02);
    this.activeVoices.push({ osc, gain, stopAt: start + dur + 0.02 });
  }

  disarm(): void {
    this.running = false;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    for (const v of this.activeVoices) {
      try {
        v.osc.stop();
      } catch {
        /* ignore */
      }
    }
    this.activeVoices = [];
    this.groups.clear();
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.master = null;
    this.score = null;
    this.noteIndex = 0;
    this.scoreTime = 0;
  }
}
