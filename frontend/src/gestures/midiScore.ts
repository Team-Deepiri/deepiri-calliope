import { Midi } from "@tonejs/midi";
import { getSoundfontNames } from "smplr";

export type OrchestraGroupId = "bass" | "mid" | "treble";

/** Internal voice id: splendid piano, drum kit, or a FluidR3 soundfont name. */
export type OrchestraVoiceId = "piano" | "drums" | string;

export type ScoreNote = {
  /** Start time in score seconds. */
  t: number;
  dur: number;
  midi: number;
  vel: number;
  group: OrchestraGroupId;
  voice: OrchestraVoiceId;
};

export type OrchestraScore = {
  id: string;
  label: string;
  file: string;
  bpmHint: number;
  duration: number;
  notes: ScoreNote[];
  /** Unique voices required to perform this score. */
  voices: OrchestraVoiceId[];
  /** Extra master gain for quiet MIDI exports (1 = default). */
  gainScale: number;
};

export type OrchestraManifest = {
  piece: {
    id: string;
    title: string;
    composer: string;
    opus?: string;
    sourceUrl?: string;
    license?: string;
  };
  defaultId: string;
  scores: Array<{
    id: string;
    label: string;
    file: string;
    bpmHint: number;
    /** Stretch MIDI times (Online Sequencer exports are often too fast). */
    timeScale?: number;
    /** Boost playback level for quiet scores. */
    gainScale?: number;
  }>;
};

const MANIFEST_URL = "/gestures/orchestra/manifest.json";

const SOUNDFONT_NAMES = new Set(getSoundfontNames());

const FAMILY_FALLBACK: Record<string, string> = {
  piano: "acoustic_grand_piano",
  "chromatic percussion": "celesta",
  organ: "church_organ",
  guitar: "acoustic_guitar_nylon",
  bass: "acoustic_bass",
  strings: "string_ensemble_1",
  ensemble: "string_ensemble_1",
  brass: "brass_section",
  reed: "clarinet",
  pipe: "flute",
  "synth lead": "lead_1_square",
  "synth pad": "pad_1_new_age",
  "synth effects": "fx_1_rain",
  ethnic: "sitar",
  percussive: "taiko_drum",
  "sound effects": "seashore",
};

function groupForMidi(midi: number): OrchestraGroupId {
  if (midi <= 53) return "bass";
  if (midi <= 71) return "mid";
  return "treble";
}

function toSoundfontId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Map a MIDI track's GM program to a playable voice id.
 * Piano uses the high-quality SplendidGrandPiano sampler; everything else uses FluidR3 soundfonts.
 */
export function voiceForTrack(track: {
  channel: number;
  instrument?: { name?: string; family?: string; number?: number; percussion?: boolean };
}): OrchestraVoiceId {
  if (track.instrument?.percussion || track.channel === 9) return "drums";

  const raw = track.instrument?.name ?? "acoustic grand piano";
  const id = toSoundfontId(raw);

  if (id === "acoustic_grand_piano" || id === "bright_acoustic_piano" || id === "electric_grand_piano") {
    return "piano";
  }

  if (SOUNDFONT_NAMES.has(id)) return id;

  const family = (track.instrument?.family ?? "").toLowerCase();
  const fb = FAMILY_FALLBACK[family];
  if (fb && SOUNDFONT_NAMES.has(fb)) {
    return fb === "acoustic_grand_piano" ? "piano" : fb;
  }

  return "piano";
}

export async function loadOrchestraManifest(): Promise<OrchestraManifest> {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error(`Failed to load orchestra manifest (${res.status})`);
  return res.json() as Promise<OrchestraManifest>;
}

export async function loadOrchestraScore(
  entry: OrchestraManifest["scores"][number],
): Promise<OrchestraScore> {
  const res = await fetch(entry.file);
  if (!res.ok) throw new Error(`Failed to load MIDI ${entry.file} (${res.status})`);
  const data = await res.arrayBuffer();
  const midi = new Midi(data);
  const timeScale = entry.timeScale && entry.timeScale > 0 ? entry.timeScale : 1;
  const gainScale = entry.gainScale && entry.gainScale > 0 ? entry.gainScale : 1;

  const notes: ScoreNote[] = [];
  const voiceSet = new Set<OrchestraVoiceId>();

  for (const track of midi.tracks) {
    if (!track.notes.length) continue;
    const voice = voiceForTrack(track);
    voiceSet.add(voice);
    for (const n of track.notes) {
      notes.push({
        t: n.time * timeScale,
        dur: Math.max(0.05, n.duration * timeScale),
        midi: n.midi,
        vel: n.velocity,
        group: groupForMidi(n.midi),
        voice,
      });
    }
  }
  notes.sort((a, b) => a.t - b.t || a.midi - b.midi);

  const duration = notes.length
    ? notes[notes.length - 1].t + notes[notes.length - 1].dur
    : midi.duration * timeScale;

  return {
    id: entry.id,
    label: entry.label,
    file: entry.file,
    bpmHint: entry.bpmHint || midi.header.tempos[0]?.bpm || 60,
    duration,
    notes,
    voices: [...voiceSet],
    gainScale,
  };
}
