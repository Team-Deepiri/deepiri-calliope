import { Reverb, Soundfont, SplendidGrandPiano } from "smplr";
import type { OrchestraGroupId, OrchestraScore, ScoreNote } from "./midiScore";

type Playable = {
  start: (event: {
    note: number | string;
    velocity?: number;
    time?: number;
    duration?: number | null;
  }) => unknown;
  stop: (target?: unknown) => void;
};

const GROUPS: OrchestraGroupId[] = ["bass", "mid", "treble"];

/** Relative level / stereo place per voice family — denser orchestral blend. */
const VOICE_MIX: Record<string, { gain: number; pan: number }> = {
  piano: { gain: 0.82, pan: 0 },
  string_ensemble_1: { gain: 1.2, pan: -0.12 },
  string_ensemble_2: { gain: 1.15, pan: 0.12 },
  tremolo_strings: { gain: 1.08, pan: 0.05 },
  pizzicato_strings: { gain: 0.95, pan: -0.08 },
  violin: { gain: 1.05, pan: -0.22 },
  viola: { gain: 1.0, pan: -0.1 },
  cello: { gain: 1.05, pan: 0.15 },
  contrabass: { gain: 1.1, pan: 0.2 },
  brass_section: { gain: 1.0, pan: 0.08 },
  trumpet: { gain: 0.92, pan: 0.18 },
  trombone: { gain: 0.95, pan: -0.15 },
  french_horn: { gain: 0.98, pan: -0.05 },
  tuba: { gain: 1.05, pan: 0.22 },
  flute: { gain: 0.78, pan: 0.25 },
  clarinet: { gain: 0.85, pan: -0.18 },
  bassoon: { gain: 0.9, pan: 0.12 },
  oboe: { gain: 0.82, pan: -0.2 },
  orchestral_harp: { gain: 0.88, pan: 0.1 },
  timpani: { gain: 1.15, pan: 0 },
  taiko_drum: { gain: 1.05, pan: -0.05 },
  orchestra_hit: { gain: 0.95, pan: 0 },
  synth_bass_1: { gain: 0.95, pan: 0 },
  synth_bass_2: { gain: 0.9, pan: 0 },
  acoustic_bass: { gain: 1.0, pan: 0.05 },
  pad_1_new_age: { gain: 0.75, pan: 0 },
  church_organ: { gain: 0.85, pan: 0 },
};

function mixFor(voice: string): { gain: number; pan: number } {
  return VOICE_MIX[voice] ?? { gain: 0.95, pan: 0 };
}

/**
 * Orchestral percussion (no electronic kit): map GM drum notes onto
 * timpani / taiko / orchestra hits so film scores stay in the hall.
 */
function orchestralDrumHit(midi: number): { voice: string; note: number } {
  if (midi === 35 || midi === 36) return { voice: "taiko_drum", note: 36 };
  if (midi === 38 || midi === 40 || midi === 37) return { voice: "taiko_drum", note: 45 };
  if (midi >= 41 && midi <= 45) return { voice: "timpani", note: 41 + (midi - 41) };
  if (midi === 47 || midi === 48 || midi === 50) return { voice: "timpani", note: 48 };
  if (midi === 49 || midi === 57 || midi === 55 || midi === 52) {
    return { voice: "orchestra_hit", note: 60 };
  }
  if (midi === 51 || midi === 59) return { voice: "timpani", note: 54 };
  if (midi === 42 || midi === 44 || midi === 46) return { voice: "timpani", note: 72 };
  if (midi >= 60 && midi <= 63) return { voice: "timpani", note: 55 + (midi - 60) };
  if (midi === 54 || midi === 69 || midi === 70 || midi === 81) {
    return { voice: "orchestra_hit", note: 72 };
  }
  return { voice: "timpani", note: 42 };
}

/**
 * Warpable MIDI clock + orchestral multi-voice playback
 * (SplendidGrandPiano + FluidR3 + hall/bus processing) with optional take capture.
 */
export class OrchestraEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private voices = new Map<string, Playable>();
  private score: OrchestraScore | null = null;
  private noteIndex = 0;
  private scoreTime = 0;
  private lastPerf = 0;
  private tempoRate = 1;
  private playing = false;
  private paused = false;
  private ended = false;
  private raf = 0;
  private boot: Promise<void> | null = null;
  private groupLevels: Record<OrchestraGroupId, number> = {
    bass: 0.75,
    mid: 0.75,
    treble: 0.75,
  };
  private scoreGain = 1;

  private captureDest: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private captureChunks: Blob[] = [];
  private capturing = false;

  get isPlaying(): boolean {
    return this.playing;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isEnded(): boolean {
    return this.ended;
  }

  get isArmed(): boolean {
    return this.score != null && this.ctx != null;
  }

  get isRunning(): boolean {
    return this.playing;
  }

  get isCapturing(): boolean {
    return this.capturing;
  }

  get currentScoreTime(): number {
    return this.scoreTime;
  }

  get duration(): number {
    return this.score?.duration ?? 0;
  }

  private async ensureContext(): Promise<AudioContext> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return this.ctx;
    }

    if (this.boot) {
      await this.boot;
      return this.ctx!;
    }

    this.boot = (async () => {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      if (ctx.state === "suspended") await ctx.resume();

      const bus = ctx.createGain();
      bus.gain.value = 1;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -22;
      comp.knee.value = 18;
      comp.ratio.value = 2.8;
      comp.attack.value = 0.015;
      comp.release.value = 0.28;

      const master = ctx.createGain();
      master.gain.value = 0.78;

      const air = ctx.createBiquadFilter();
      air.type = "highshelf";
      air.frequency.value = 4200;
      air.gain.value = 1.8;

      const lowGlue = ctx.createBiquadFilter();
      lowGlue.type = "lowshelf";
      lowGlue.frequency.value = 140;
      lowGlue.gain.value = 1.2;

      bus.connect(comp);
      comp.connect(lowGlue);
      lowGlue.connect(air);
      air.connect(master);

      const dry = ctx.createGain();
      dry.gain.value = 0.72;
      master.connect(dry);
      dry.connect(ctx.destination);

      const reverb = new Reverb(ctx);
      await reverb.ready();
      reverb.getParam("wet")?.setValueAtTime(0.42, ctx.currentTime);
      reverb.getParam("dry")?.setValueAtTime(0, ctx.currentTime);
      reverb.getParam("decay")?.setValueAtTime(0.72, ctx.currentTime);
      reverb.getParam("damping")?.setValueAtTime(0.35, ctx.currentTime);
      master.connect(reverb.input);
      reverb.connect(ctx.destination);

      const captureDest = ctx.createMediaStreamDestination();
      master.connect(captureDest);

      this.ctx = ctx;
      this.bus = bus;
      this.master = master;
      this.captureDest = captureDest;
    })();

    try {
      await this.boot;
    } finally {
      this.boot = null;
    }
    return this.ctx!;
  }

  private async ensureVoice(id: string): Promise<Playable> {
    const cached = this.voices.get(id);
    if (cached) return cached;

    const ctx = await this.ensureContext();
    const mix = mixFor(id);
    const gain = ctx.createGain();
    gain.gain.value = mix.gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = mix.pan;
    gain.connect(panner);
    panner.connect(this.bus!);

    let playable: Playable;
    if (id === "piano") {
      playable = (await new SplendidGrandPiano(ctx, {
        destination: gain,
        volume: 96,
        decayTime: 0.75,
      }).load) as Playable;
    } else {
      playable = (await new Soundfont(ctx, {
        instrument: id,
        kit: "FluidR3_GM",
        destination: gain,
        volume: 92,
        extraGain: 1.25,
      }).load) as Playable;
    }

    this.voices.set(id, playable);
    return playable;
  }

  private async ensureVoicesForScore(score: OrchestraScore): Promise<void> {
    const needed = new Set<string>();
    for (const v of score.voices) {
      if (v === "drums") {
        needed.add("timpani");
        needed.add("taiko_drum");
        needed.add("orchestra_hit");
      } else {
        needed.add(v);
      }
    }
    if (needed.size === 0) needed.add("piano");

    const ordered = [...needed].sort((a, b) => {
      if (a === "piano") return -1;
      if (b === "piano") return 1;
      return a.localeCompare(b);
    });
    await Promise.all(ordered.map((id) => this.ensureVoice(id)));
  }

  private beginCapture(): void {
    if (!this.captureDest || this.capturing) return;
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
    try {
      this.captureChunks = [];
      this.mediaRecorder = new MediaRecorder(
        this.captureDest.stream,
        mime ? { mimeType: mime } : undefined,
      );
      this.mediaRecorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) this.captureChunks.push(ev.data);
      };
      this.mediaRecorder.start(400);
      this.capturing = true;
    } catch {
      this.mediaRecorder = null;
      this.capturing = false;
    }
  }

  /** Finish capture and return the recorded blob (webm), or null. */
  async finishCapture(): Promise<Blob | null> {
    const rec = this.mediaRecorder;
    if (!rec || !this.capturing) {
      this.capturing = false;
      return null;
    }
    const blob = await new Promise<Blob | null>((resolve) => {
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        resolve(this.captureChunks.length ? new Blob(this.captureChunks, { type }) : null);
      };
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });
    this.mediaRecorder = null;
    this.capturing = false;
    this.captureChunks = [];
    return blob;
  }

  async arm(score: OrchestraScore, autoplay = true): Promise<void> {
    this.stopClock();
    this.silenceVoices();
    if (this.capturing) void this.finishCapture();

    await this.ensureContext();
    await this.ensureVoicesForScore(score);

    this.score = score;
    this.scoreGain = Math.max(0.5, Math.min(3, score.gainScale || 1));
    if (this.master) {
      this.master.gain.value = 0.78 * this.scoreGain;
    }
    this.noteIndex = 0;
    this.scoreTime = 0;
    this.lastPerf = performance.now();
    this.tempoRate = 1;
    this.ended = false;
    this.paused = !autoplay;
    this.playing = autoplay;
    if (autoplay) {
      this.beginCapture();
      this.tick();
    }
  }

  pause(): void {
    if (!this.isArmed || !this.playing) return;
    this.playing = false;
    this.paused = true;
    this.stopClock();
    this.silenceVoices();
  }

  resume(): void {
    if (!this.isArmed || this.playing) return;
    if (this.ended) {
      this.restart();
      return;
    }
    if (this.ctx?.state === "suspended") void this.ctx.resume();
    this.paused = false;
    this.playing = true;
    this.lastPerf = performance.now();
    if (!this.capturing) this.beginCapture();
    this.tick();
  }

  restart(): void {
    if (!this.isArmed) return;
    this.silenceVoices();
    if (this.capturing) void this.finishCapture();
    this.noteIndex = 0;
    this.scoreTime = 0;
    this.ended = false;
    this.paused = false;
    this.playing = true;
    this.lastPerf = performance.now();
    this.stopClock();
    if (this.ctx?.state === "suspended") void this.ctx.resume();
    this.beginCapture();
    this.tick();
  }

  setTempoRate(rate: number): void {
    this.tempoRate = Math.min(1.45, Math.max(0.05, rate));
  }

  setDynamics(level: number): void {
    if (!this.master || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime((0.42 + level * 0.48) * this.scoreGain, t, 0.08);
  }

  setGroupLevels(levels: Record<OrchestraGroupId, number>): void {
    for (const id of GROUPS) {
      this.groupLevels[id] = Math.max(0, Math.min(1, levels[id]));
    }
  }

  private silenceVoices(): void {
    for (const v of this.voices.values()) {
      try {
        v.stop();
      } catch {
        /* ignore */
      }
    }
  }

  private stopClock(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private tick = () => {
    if (!this.playing || !this.ctx || !this.score) return;
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

    if (this.scoreTime < this.score.duration + 1.5) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      this.playing = false;
      this.paused = false;
      this.ended = true;
      this.raf = 0;
    }
  };

  private playNote(n: ScoreNote): void {
    if (!this.ctx) return;

    const band = this.groupLevels[n.group];
    const shaped = band * band;
    if (shaped < 0.025) return;

    const delay = Math.max(0, (n.t - this.scoreTime) / Math.max(0.2, this.tempoRate));
    const start = this.ctx.currentTime + delay;
    const velocity = Math.max(
      1,
      Math.min(127, Math.round((18 + n.vel * 102) * (0.14 + shaped * 0.86))),
    );

    if (n.voice === "drums") {
      const hit = orchestralDrumHit(n.midi);
      const instrument = this.voices.get(hit.voice);
      if (!instrument) return;
      instrument.start({
        note: hit.note,
        time: start,
        duration: Math.min(2.5, Math.max(0.15, n.dur)),
        velocity,
      });
      return;
    }

    const instrument = this.voices.get(n.voice);
    if (!instrument) return;
    const dur = Math.min(7, Math.max(0.12, n.dur / Math.max(0.35, this.tempoRate)));
    instrument.start({
      note: n.midi,
      time: start,
      duration: dur,
      velocity,
    });
  }

  stopPerformance(): void {
    this.playing = false;
    this.paused = false;
    this.ended = false;
    this.stopClock();
    this.silenceVoices();
    this.score = null;
    this.noteIndex = 0;
    this.scoreTime = 0;
  }

  disarm(): void {
    if (this.capturing) void this.finishCapture();
    this.stopPerformance();
    this.voices.clear();
    this.master = null;
    this.bus = null;
    this.captureDest = null;
    this.mediaRecorder = null;
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.boot = null;
  }
}
