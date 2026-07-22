import { Midi } from "@tonejs/midi";

export type OrchestraGroupId = "bass" | "mid" | "treble";

export type ScoreNote = {
  /** Start time in score seconds. */
  t: number;
  dur: number;
  midi: number;
  vel: number;
  group: OrchestraGroupId;
};

export type OrchestraScore = {
  id: string;
  label: string;
  file: string;
  bpmHint: number;
  duration: number;
  notes: ScoreNote[];
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
  }>;
};

const MANIFEST_URL = "/gestures/orchestra/manifest.json";

function groupForMidi(midi: number): OrchestraGroupId {
  if (midi <= 53) return "bass";
  if (midi <= 71) return "mid";
  return "treble";
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

  const notes: ScoreNote[] = [];
  for (const track of midi.tracks) {
    for (const n of track.notes) {
      notes.push({
        t: n.time,
        dur: Math.max(0.05, n.duration),
        midi: n.midi,
        vel: n.velocity,
        group: groupForMidi(n.midi),
      });
    }
  }
  notes.sort((a, b) => a.t - b.t || a.midi - b.midi);

  const duration = Math.max(
    midi.duration,
    notes.length ? notes[notes.length - 1].t + notes[notes.length - 1].dur : 0,
  );

  return {
    id: entry.id,
    label: entry.label,
    file: entry.file,
    bpmHint: entry.bpmHint || midi.header.tempos[0]?.bpm || 60,
    duration,
    notes,
  };
}
