import type { PluginInstance } from "../types/audio";

const apiBase = (import.meta.env.VITE_API_BASE ?? "").trim();

export type EngineTrack = {
  id: string;
  volume: number; // dB
  pan: number; // -1..1
  muted: boolean;
  solo: boolean;
};

export type EngineClip = {
  id: string;
  trackId: string;
  sessionId: string;
  recordingId: string;
  startBar: number;
  durationSec: number;
};

export type EngineAutomationPoint = {
  bar: number; // timeline position in bars
  value: number; // normalized 0..1 (mapped to track fader range)
};

export type MasterMeter = { peak: number; rms: number };

export type EngineMasterChannel = {
  volumeDb: number;
  muted: boolean;
  eqLow: { freq: number; gain: number };
  eqMid: { freq: number; gain: number; q: number };
  eqHigh: { freq: number; gain: number };
  compressor: { threshold: number; ratio: number; makeup: number; attack: number; release: number };
  limiter: { threshold: number; ceiling: number };
};

export const DEFAULT_MASTER_CHANNEL: EngineMasterChannel = {
  volumeDb: 0,
  muted: false,
  eqLow: { freq: 100, gain: 0 },
  eqMid: { freq: 1000, gain: 0, q: 1 },
  eqHigh: { freq: 8000, gain: 0 },
  compressor: { threshold: -18, ratio: 3, makeup: 0, attack: 0.01, release: 0.15 },
  limiter: { threshold: -1, ceiling: -0.3 },
};

/** Master bus signal path: EQ (shelf/peak/shelf) → compressor → limiter → fader. */
export function buildMasterChain(ctx: BaseAudioContext, s: EngineMasterChannel) {
  const input = ctx.createGain();
  const eqLow = ctx.createBiquadFilter();
  eqLow.type = "lowshelf";
  const eqMid = ctx.createBiquadFilter();
  eqMid.type = "peaking";
  const eqHigh = ctx.createBiquadFilter();
  eqHigh.type = "highshelf";
  const comp = ctx.createDynamicsCompressor();
  const limiter = ctx.createDynamicsCompressor();
  limiter.ratio.value = 20;
  limiter.knee.value = 0;
  limiter.attack.value = 0.002;
  const fader = ctx.createGain();

  input.connect(eqLow);
  eqLow.connect(eqMid);
  eqMid.connect(eqHigh);
  eqHigh.connect(comp);
  comp.connect(limiter);
  limiter.connect(fader);

  const apply = () => {
    eqLow.frequency.value = Math.max(20, s.eqLow.freq);
    eqLow.gain.value = s.eqLow.gain;
    eqMid.frequency.value = Math.max(20, s.eqMid.freq);
    eqMid.gain.value = s.eqMid.gain;
    eqMid.Q.value = Math.max(0.1, s.eqMid.q);
    eqHigh.frequency.value = Math.max(20, s.eqHigh.freq);
    eqHigh.gain.value = s.eqHigh.gain;
    comp.threshold.value = s.compressor.threshold;
    comp.ratio.value = Math.max(1, s.compressor.ratio);
    comp.attack.value = Math.max(0.001, s.compressor.attack);
    comp.release.value = Math.max(0.01, s.compressor.release);
    comp.knee.value = 6;
    limiter.threshold.value = s.limiter.threshold;
    fader.gain.value = s.muted ? 0 : dbToGain(s.volumeDb) * dbToGain(s.compressor.makeup);
  };
  apply();

  return {
    input,
    output: fader,
    apply,
    dispose: () => {
      for (const n of [input, eqLow, eqMid, eqHigh, comp, limiter, fader]) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    },
  };
}

function dbToGain(db: number): number {
  if (db <= -60) return 0;
  return Math.pow(10, db / 20);
}

/** Per-bucket absolute peak (0..1) for waveform rendering.
 * Emits more buckets than the UI displays so clips can render crisply at
 * any width (the view downsamples to its own WAVE_BUCKETS at draw time). */
export function computePeaks(buffer: AudioBuffer, buckets = 480): number[] {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  const size = Math.max(1, Math.floor(buffer.length / buckets));
  const peaks: number[] = [];
  let max = 1e-6;
  for (let b = 0; b < buckets; b++) {
    const start = b * size;
    const end = Math.min(buffer.length, start + size);
    let peak = 0;
    for (let i = start; i < end; i++) {
      for (const ch of channels) {
        const v = Math.abs(ch[i]);
        if (v > peak) peak = v;
      }
    }
    if (peak > max) max = peak;
    peaks.push(peak);
  }
  // Normalize so the loudest clip section fills the waveform area.
  return peaks.map((p) => p / max);
}

/** Cap on cached waveform peak arrays; oldest entries are evicted first. */
const MAX_PEAKS_CACHE_ENTRIES = 200;

function recordingUrl(sessionId: string, recordingId: string): string {
  return `${apiBase}/v1/recordings/sessions/${sessionId}/files/${recordingId}/download`;
}

function pluginKind(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("eq") || n.includes("equaliz") || n.includes("filter")) return "eq";
  if (n.includes("comp") || n.includes("limit") || n.includes("gate")) return "comp";
  if (n.includes("reverb") || n.includes("hall") || n.includes("room") || n.includes("plate")) return "reverb";
  if (n.includes("delay") || n.includes("echo")) return "delay";
  if (n.includes("distort") || n.includes("overdrive") || n.includes("saturat") || n.includes("clip")) return "distort";
  if (n.includes("chorus") || n.includes("flanger") || n.includes("phaser")) return "mod";
  return "gain";
}

function paramMap(plugin: PluginInstance): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of plugin.parameters) out[p.name.toLowerCase()] = p.value;
  return out;
}

function pick(params: Record<string, number>, keys: string[], fallback: number): number {
  for (const k of keys) {
    if (params[k] != null && Number.isFinite(params[k])) return params[k];
  }
  return fallback;
}

/** Build a realtime FX insert from the plugin chain (Web Audio approximations). */
export function buildFxChain(
  ctx: BaseAudioContext,
  chain: PluginInstance[],
): { input: AudioNode; output: AudioNode; dispose: () => void } {
  const input = ctx.createGain();
  let node: AudioNode = input;
  const owned: AudioNode[] = [input];

  for (const plugin of chain) {
    if (!plugin.enabled) continue;
    const kind = pluginKind(plugin.plugin_name);
    const params = paramMap(plugin);
    const wet = Math.max(0, Math.min(1, plugin.mix));
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    dryGain.gain.value = 1 - wet;
    wetGain.gain.value = wet;
    const merger = ctx.createGain();
    owned.push(dryGain, wetGain, merger);

    node.connect(dryGain);
    dryGain.connect(merger);

    if (kind === "eq") {
      const filter = ctx.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = pick(params, ["freq", "frequency", "fc"], 1200);
      filter.gain.value = pick(params, ["gain", "boost", "cut"], 3);
      filter.Q.value = pick(params, ["q", "resonance", "width"], 1);
      node.connect(filter);
      filter.connect(wetGain);
      owned.push(filter);
    } else if (kind === "comp") {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = pick(params, ["threshold"], -24);
      comp.ratio.value = pick(params, ["ratio"], 4);
      comp.attack.value = pick(params, ["attack"], 0.01);
      comp.release.value = pick(params, ["release"], 0.15);
      comp.knee.value = pick(params, ["knee"], 8);
      node.connect(comp);
      comp.connect(wetGain);
      owned.push(comp);
    } else if (kind === "delay") {
      const delay = ctx.createDelay(2);
      delay.delayTime.value = pick(params, ["time", "delay", "delay_ms"], 0.28);
      if (delay.delayTime.value > 2) delay.delayTime.value = delay.delayTime.value / 1000;
      const fb = ctx.createGain();
      fb.gain.value = Math.min(0.85, pick(params, ["feedback", "fb"], 0.35));
      node.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wetGain);
      owned.push(delay, fb);
    } else if (kind === "reverb") {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.04 + pick(params, ["size", "room", "decay"], 40) / 1000;
      const fb = ctx.createGain();
      fb.gain.value = Math.min(0.8, 0.25 + pick(params, ["mix", "wet", "amount"], 40) / 200);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 4200;
      node.connect(delay);
      delay.connect(fb);
      fb.connect(lp);
      lp.connect(delay);
      delay.connect(wetGain);
      owned.push(delay, fb, lp);
    } else if (kind === "distort") {
      const shaper = ctx.createWaveShaper();
      const amount = Math.max(1, pick(params, ["drive", "amount", "gain"], 12));
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 128) - 1;
        curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
      }
      shaper.curve = curve;
      shaper.oversample = "2x";
      node.connect(shaper);
      shaper.connect(wetGain);
      owned.push(shaper);
    } else if (kind === "mod") {
      const delay = ctx.createDelay(0.05);
      delay.delayTime.value = 0.012;
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = pick(params, ["rate", "speed"], 1.2);
      lfoGain.gain.value = 0.004;
      lfo.connect(lfoGain);
      lfoGain.connect(delay.delayTime);
      lfo.start();
      node.connect(delay);
      delay.connect(wetGain);
      owned.push(delay, lfo, lfoGain);
    } else {
      const g = ctx.createGain();
      g.gain.value = 1;
      node.connect(g);
      g.connect(wetGain);
      owned.push(g);
    }

    wetGain.connect(merger);
    node = merger;
  }

  return {
    input,
    output: node,
    dispose: () => {
      for (const n of owned) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    },
  };
}

export class StudioEngine {
  private ctx: AudioContext | null = null;
  private masterChain: ReturnType<typeof buildMasterChain> | null = null;
  private analyser: AnalyserNode | null = null;
  private meterBuf: Float32Array | null = null;
  private fx: ReturnType<typeof buildFxChain> | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private peaksCache = new Map<string, number[]>();
  private sources: AudioBufferSourceNode[] = [];
  private trackNodes = new Map<
    string,
    { gain: GainNode; pan: StereoPannerNode; analyser?: AnalyserNode; buf?: Float32Array }
  >();
  private playing = false;
  private startCtxTime = 0;
  private startBar = 0;
  private bpm = 120;
  private raf: number | null = null;
  private onBar: ((bar: number, beat: number) => void) | null = null;
  private chain: PluginInstance[] = [];
  private trackFx = new Map<string, ReturnType<typeof buildFxChain>>();
  private trackChains = new Map<string, PluginInstance[]>();
  private automation = new Map<string, EngineAutomationPoint[]>();
  private masterCh: EngineMasterChannel = { ...DEFAULT_MASTER_CHANNEL };
  private lastTracks: EngineTrack[] = [];
  private metronome = false;
  private nextClickBeat = 0; // absolute beat index scheduled through
  private clicks: OscillatorNode[] = [];

  async ensure(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 48000 });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.meterBuf = new Float32Array(this.analyser.fftSize);
      this.rebuildMaster();
      this.rebuildFx();
      this.masterChain!.output.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  private rebuildMaster() {
    if (!this.ctx) return;
    this.masterChain?.dispose();
    this.masterChain = buildMasterChain(this.ctx, this.masterCh);
    for (const nodes of this.trackNodes.values()) {
      try {
        nodes.pan.disconnect();
      } catch {
        /* ignore */
      }
      nodes.pan.connect(this.fx ? this.fx.input : this.masterChain.input);
    }
    if (this.fx) {
      try {
        this.fx.output.disconnect();
      } catch {
        /* ignore */
      }
      this.fx.output.connect(this.masterChain.input);
    }
  }

  setMasterChannel(state: EngineMasterChannel) {
    this.masterCh = state;
    if (this.ctx) {
      // Same topology — just refresh parameter values.
      this.masterChain?.apply();
      // Fader/mute may have changed topology-independent values only.
    } else {
      this.rebuildMaster();
    }
  }

  /** Realtime master meter read from the analyser after the master fader. */
  readMasterMeter(): MasterMeter {
    if (!this.analyser || !this.meterBuf || !this.playing) return { peak: 0, rms: 0 };
    this.analyser.getFloatTimeDomainData(this.meterBuf as Float32Array<ArrayBuffer>);
    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < this.meterBuf.length; i++) {
      const v = this.meterBuf[i];
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sumSq += v * v;
    }
    return { peak, rms: Math.sqrt(sumSq / this.meterBuf.length) };
  }

  setTrackAutomation(automation: Record<string, EngineAutomationPoint[]>) {
    this.automation = new Map(Object.entries(automation));
  }

  private scheduleAutomation(barSec: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [trackId, points] of this.automation) {
      if (!points || points.length === 0) continue;
      const nodes = this.trackNodes.get(trackId);
      if (!nodes) continue;
      const gainParam = nodes.gain.gain;
      gainParam.cancelScheduledValues(now);
      const sorted = [...points].sort((a, b) => a.bar - b.bar);
      // Fader range -60..+6 dB mapped from normalized 0..1
      const first = sorted[0];
      const firstWhen = now + Math.max(0, (first.bar - this.startBar) * barSec);
      gainParam.setValueAtTime(dbToGain(first.value * 66 - 60), Math.max(now, firstWhen));
      for (let i = 1; i < sorted.length; i++) {
        const when = now + Math.max(0, (sorted[i].bar - this.startBar) * barSec);
        gainParam.linearRampToValueAtTime(dbToGain(sorted[i].value * 66 - 60), Math.max(now + 0.001, when));
      }
    }
  }

  setPluginChain(chain: PluginInstance[]) {
    this.chain = chain;
    if (this.ctx && this.masterChain) this.rebuildFx();
  }

  /** Per-track insert chain — applied before the shared bus FX. */
  setTrackPluginChain(trackId: string, chain: PluginInstance[]) {
    this.trackChains.set(trackId, [...chain]);
    if (this.ctx && this.fx) this.rebuildTrackFx(trackId);
  }

  getTrackPluginChain(trackId: string): PluginInstance[] {
    return this.trackChains.get(trackId) ?? [];
  }

  private rebuildTrackFx(trackId: string) {
    if (!this.ctx || !this.fx) return;
    const nodes = this.trackNodes.get(trackId);
    const old = this.trackFx.get(trackId);
    if (old) {
      try {
        old.dispose();
      } catch {
        /* ignore */
      }
      this.trackFx.delete(trackId);
    }
    if (!nodes) return;
    const inst = buildFxChain(this.ctx, this.trackChains.get(trackId) ?? []);
    inst.output.connect(this.fx.input);
    this.trackFx.set(trackId, inst);
    try {
      nodes.pan.disconnect();
    } catch {
      /* ignore */
    }
    nodes.pan.connect(inst.input);
    if (nodes.analyser) nodes.pan.connect(nodes.analyser);
  }

  private rebuildFx() {
    if (!this.ctx || !this.masterChain) return;
    this.fx?.dispose();
    this.fx = buildFxChain(this.ctx, this.chain);
    this.fx.output.connect(this.masterChain.input);
    for (const trackId of Array.from(this.trackNodes.keys())) {
      this.rebuildTrackFx(trackId);
    }
    for (const [trackId, nodes] of this.trackNodes) {
      if (this.trackFx.has(trackId)) continue;
      try {
        nodes.pan.disconnect();
      } catch {
        /* ignore */
      }
      nodes.pan.connect(this.fx.input);
      if (nodes.analyser) nodes.pan.connect(nodes.analyser);
    }
  }

  private trackGraph(trackId: string) {
    if (!this.ctx || !this.fx) throw new Error("engine not ready");
    let nodes = this.trackNodes.get(trackId);
    let fxInput = this.trackFx.get(trackId)?.input ?? null;
    if (!nodes) {
      const gain = this.ctx.createGain();
      const pan = this.ctx.createStereoPanner();
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 1024;
      gain.connect(pan);
      if (!fxInput) {
        fxInput = this.fx.input;
      }
      pan.connect(fxInput);
      pan.connect(analyser); // meter tap (dead-end node, no output connection)
      nodes = { gain, pan, analyser, buf: new Float32Array(analyser.fftSize) };
      this.trackNodes.set(trackId, nodes);
      // A chain may have been set before the track existed.
      if (!this.trackFx.has(trackId) && (this.trackChains.get(trackId)?.length ?? 0) > 0) {
        this.rebuildTrackFx(trackId);
      }
    }
    return nodes;
  }

  /** Realtime per-track meter read from the post-fader analyser tap. */
  readTrackMeter(trackId: string): MasterMeter {
    const nodes = this.trackNodes.get(trackId);
    if (!nodes?.analyser || !nodes.buf) return { peak: 0, rms: 0 };
    const buf = nodes.buf as Float32Array<ArrayBuffer>;
    nodes.analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sumSq += v * v;
    }
    return { peak, rms: Math.sqrt(sumSq / buf.length) };
  }

  applyTracks(tracks: EngineTrack[]) {
    if (!this.ctx) return;
    const anySolo = tracks.some((t) => t.solo);
    for (const t of tracks) {
      const nodes = this.trackGraph(t.id);
      const audible = !t.muted && (!anySolo || t.solo);
      nodes.gain.gain.value = audible ? dbToGain(t.volume) : 0;
      nodes.pan.pan.value = Math.max(-1, Math.min(1, t.pan));
    }
  }

  async loadClip(clip: EngineClip): Promise<AudioBuffer | null> {
    const key = `${clip.sessionId}:${clip.recordingId}`;
    const cached = this.buffers.get(key);
    if (cached) return cached;
    try {
      const ctx = await this.ensure();
      const res = await fetch(recordingUrl(clip.sessionId, clip.recordingId));
      if (!res.ok) throw new Error(`download failed ${res.status}`);
      const ab = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(ab.slice(0));
      this.buffers.set(key, buf);
      return buf;
    } catch (e) {
      console.error("Failed to load clip audio", clip.id, e);
      return null;
    }
  }

  /** Normalized waveform peaks for a loaded clip, or null while loading. */
  getClipPeaks(sessionId: string, recordingId: string): number[] | null {
    const buf = this.buffers.get(`${sessionId}:${recordingId}`);
    if (!buf) return null;
    let peaks = this.peaksCache.get(`${sessionId}:${recordingId}`);
    if (!peaks) {
      peaks = computePeaks(buf);
      while (this.peaksCache.size >= MAX_PEAKS_CACHE_ENTRIES) {
        const oldest = this.peaksCache.keys().next().value;
        if (oldest === undefined) break;
        this.peaksCache.delete(oldest);
      }
      this.peaksCache.set(`${sessionId}:${recordingId}`, peaks);
    }
    return peaks;
  }

  async preload(clips: EngineClip[]) {
    await this.ensure();
    await Promise.all(clips.map((c) => this.loadClip(c)));
  }

  isPlaying() {
    return this.playing;
  }

  currentBar(): number {
    if (!this.playing || !this.ctx) return this.startBar;
    const elapsed = this.ctx.currentTime - this.startCtxTime;
    const beats = elapsed * (this.bpm / 60);
    return this.startBar + beats / 4;
  }

  async play(opts: {
    bpm: number;
    startBar: number;
    clips: EngineClip[];
    tracks: EngineTrack[];
    onBar?: (bar: number, beat: number) => void;
  }) {
    const ctx = await this.ensure();
    this.stopSourcesOnly();
    this.bpm = opts.bpm;
    this.startBar = opts.startBar;
    this.onBar = opts.onBar ?? null;
    this.lastTracks = opts.tracks;
    this.applyTracks(opts.tracks);
    await this.preload(opts.clips);

    const barSec = (60 / this.bpm) * 4;
    this.startCtxTime = ctx.currentTime;
    this.playing = true;
    this.nextClickBeat = Math.round(this.startBar * 4);
    this.scheduleAutomation(barSec);

    for (const clip of opts.clips) {
      const buf = this.buffers.get(`${clip.sessionId}:${clip.recordingId}`);
      if (!buf) continue;
      const when = this.startCtxTime + Math.max(0, (clip.startBar - this.startBar) * barSec);
      const offset = clip.startBar < this.startBar ? (this.startBar - clip.startBar) * barSec : 0;
      if (offset >= buf.duration) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const nodes = this.trackGraph(clip.trackId);
      src.connect(nodes.gain);
      try {
        src.start(when, offset);
      } catch (e) {
        console.error("source start failed", e);
        continue;
      }
      this.sources.push(src);
    }

    const tick = () => {
      if (!this.playing) return;
      const barFloat = this.currentBar();
      const bar = Math.floor(barFloat) + 1;
      const beat = Math.floor((barFloat % 1) * 4);
      this.onBar?.(bar, beat);
      this.scheduleClicks();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Audible click track — scheduled just-in-time with a 120ms lookahead. */
  setMetronome(on: boolean) {
    this.metronome = on;
    if (on && this.playing) {
      this.nextClickBeat = Math.ceil(this.currentBar() * 4);
    } else if (!on) {
      for (const c of this.clicks) {
        try {
          c.stop();
          c.disconnect();
        } catch {
          /* already ended */
        }
      }
      this.clicks = [];
    }
  }

  getMetronome() {
    return this.metronome;
  }

  private scheduleClicks() {
    if (!this.metronome || !this.playing || !this.ctx) return;
    const barSec = (60 / this.bpm) * 4;
    const beatSec = barSec / 4;
    const lookahead = 0.12;
    let scheduled = 0;
    while (
      scheduled < 100 &&
      this.nextClickBeat * beatSec + this.startCtxTime < this.ctx.currentTime + lookahead
    ) {
      const t = this.nextClickBeat * beatSec + this.startCtxTime;
      const downbeat = this.nextClickBeat % 4 === 0;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.frequency.value = downbeat ? 1200 : 820;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(downbeat ? 0.5 : 0.3, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (downbeat ? 0.09 : 0.05));
      osc.connect(g);
      g.connect(this.ctx.destination); // click bypasses FX/fader by design
      osc.start(Math.max(this.ctx.currentTime, t));
      osc.stop(Math.max(this.ctx.currentTime, t) + 0.12);
      osc.onended = () => {
        try {
          osc.disconnect();
          g.disconnect();
        } catch {
          /* ignore */
        }
        this.clicks = this.clicks.filter((c) => c !== osc);
      };
      this.clicks.push(osc);
      this.nextClickBeat += 1;
      scheduled += 1;
    }
  }

  /**
   * Offline-render the arrangement to an AudioBuffer through the same graph
   * (track gain/pan → FX chain → master bus). Used by the export dialog.
   * `onlyTrackId` renders a single stem (all other tracks muted).
   * `rangeBars` renders a bar window (used for "Render as Audio" on a clip);
   * sources are trimmed to the window on both ends.
   */
  async renderMix(opts: {
    bpm: number;
    clips: EngineClip[];
    tracks: EngineTrack[];
    tailSec?: number;
    targetSampleRate?: number;
    onlyTrackId?: string;
    rangeBars?: { startBar: number; endBar: number };
  }): Promise<AudioBuffer> {
    const refCtx = await this.ensure();
    await this.preload(opts.clips);

    const barSec = (60 / opts.bpm) * 4;
    let endBar = 0;
    let startBar = 0;
    if (opts.rangeBars) {
      startBar = Math.max(0, opts.rangeBars.startBar);
      endBar = opts.rangeBars.endBar;
      if (endBar <= startBar) throw new Error("Empty render range");
    } else {
      for (const c of opts.clips) {
        endBar = Math.max(endBar, c.startBar + barsFromDuration(c.durationSec, opts.bpm));
      }
      if (endBar <= 0) throw new Error("Nothing to render — timeline is empty");
    }
    const durationSec = (endBar - startBar) * barSec + (opts.tailSec ?? 2);
    const sampleRate = Math.max(8000, Math.min(192000, opts.targetSampleRate ?? refCtx.sampleRate));

    const offline = new OfflineAudioContext(
      2,
      Math.ceil(durationSec * sampleRate),
      sampleRate,
    );
    const master = buildMasterChain(offline, this.masterCh);
    const fx = buildFxChain(offline, this.chain);
    fx.output.connect(master.input);
    master.output.connect(offline.destination);

    const anySolo = opts.tracks.some((t) => t.solo);
    const gains = new Map<string, GainNode>();
    for (const t of opts.tracks) {
      const g = offline.createGain();
      const p = offline.createStereoPanner();
      const stemMuted = opts.onlyTrackId != null && t.id !== opts.onlyTrackId;
      const audible = !t.muted && !stemMuted && (!anySolo || t.solo);
      g.gain.value = audible ? dbToGain(t.volume) : 0;
      p.pan.value = Math.max(-1, Math.min(1, t.pan));
      g.connect(p);
      // Per-track insert chain, then the shared bus chain.
      const trackFx = buildFxChain(offline, this.trackChains.get(t.id) ?? []);
      p.connect(trackFx.input);
      trackFx.output.connect(fx.input);
      gains.set(t.id, g);
    }

    for (const clip of opts.clips) {
      const buf = this.buffers.get(`${clip.sessionId}:${clip.recordingId}`);
      if (!buf) continue;
      const g = gains.get(clip.trackId);
      if (!g) continue;
      const clipEndBar = clip.startBar + barsFromDuration(clip.durationSec, opts.bpm);
      if (clipEndBar <= startBar || clip.startBar >= endBar) continue;
      const src = offline.createBufferSource();
      src.buffer = buf;
      src.connect(g);
      const when = Math.max(0, clip.startBar - startBar) * barSec;
      const headClip = Math.max(0, startBar - clip.startBar) * barSec;
      if (headClip >= buf.duration) continue;
      const playSec = Math.min(buf.duration - headClip, (endBar - Math.max(clip.startBar, startBar)) * barSec);
      if (playSec <= 0) continue;
      src.start(when, headClip, playSec);
    }

    return await offline.startRendering();
  }

  pause() {
    if (!this.playing) return;
    this.startBar = this.currentBar();
    this.stopSourcesOnly();
    this.playing = false;
  }

  stop() {
    this.stopSourcesOnly();
    this.playing = false;
    this.startBar = 0;
    this.applyTracks(this.lastTracks);
    this.onBar?.(1, 0);
  }

  private stopSourcesOnly() {
    if (this.raf != null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    for (const s of this.sources) {
      try {
        s.stop();
        s.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.sources = [];
    for (const c of this.clicks) {
      try {
        c.stop();
        c.disconnect();
      } catch {
        /* already ended */
      }
    }
    this.clicks = [];
  }

  dispose() {
    this.stop();
    this.fx?.dispose();
    this.masterChain?.dispose();
    void this.ctx?.close();
    this.ctx = null;
    this.masterChain = null;
    this.analyser = null;
    this.meterBuf = null;
    this.fx = null;
    this.buffers.clear();
    this.peaksCache.clear();
    this.trackNodes.clear();
  }
}

export function barsFromDuration(durationSec: number, bpm: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 1;
  const beats = (durationSec * bpm) / 60;
  return Math.max(0.25, beats / 4);
}

export function recordingDownloadUrl(sessionId: string, recordingId: string): string {
  return recordingUrl(sessionId, recordingId);
}
