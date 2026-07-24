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

function dbToGain(db: number): number {
  if (db <= -60) return 0;
  return Math.pow(10, db / 20);
}

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
  ctx: AudioContext,
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
  private master: GainNode | null = null;
  private fx: ReturnType<typeof buildFxChain> | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private sources: AudioBufferSourceNode[] = [];
  private trackNodes = new Map<string, { gain: GainNode; pan: StereoPannerNode }>();
  private playing = false;
  private startCtxTime = 0;
  private startBar = 0;
  private bpm = 120;
  private raf: number | null = null;
  private onBar: ((bar: number, beat: number) => void) | null = null;
  private chain: PluginInstance[] = [];

  async ensure(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 48000 });
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.rebuildFx();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }

  setPluginChain(chain: PluginInstance[]) {
    this.chain = chain;
    if (this.ctx && this.master) this.rebuildFx();
  }

  private rebuildFx() {
    if (!this.ctx || !this.master) return;
    this.fx?.dispose();
    this.fx = buildFxChain(this.ctx, this.chain);
    this.fx.output.connect(this.master);
    for (const nodes of this.trackNodes.values()) {
      try {
        nodes.pan.disconnect();
      } catch {
        /* ignore */
      }
      nodes.pan.connect(this.fx.input);
    }
  }

  private trackGraph(trackId: string) {
    if (!this.ctx || !this.fx) throw new Error("engine not ready");
    let nodes = this.trackNodes.get(trackId);
    if (!nodes) {
      const gain = this.ctx.createGain();
      const pan = this.ctx.createStereoPanner();
      gain.connect(pan);
      pan.connect(this.fx.input);
      nodes = { gain, pan };
      this.trackNodes.set(trackId, nodes);
    }
    return nodes;
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
    this.applyTracks(opts.tracks);
    await this.preload(opts.clips);

    const barSec = (60 / this.bpm) * 4;
    this.startCtxTime = ctx.currentTime;
    this.playing = true;

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
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
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
  }

  dispose() {
    this.stop();
    this.fx?.dispose();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.fx = null;
    this.buffers.clear();
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
