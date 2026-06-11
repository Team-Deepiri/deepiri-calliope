export interface TrackTemplate {
  name: string;
  type: string;
  color: string;
  plugins?: string[];
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  icon: string;
  bpm: number;
  key: string;
  trackCount: number;
  genre: string;
  tracks: TrackTemplate[];
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: "empty",
    name: "Empty Project",
    description: "Start from scratch",
    icon: "FilePlus2",
    bpm: 120,
    key: "C",
    trackCount: 1,
    genre: "any",
    tracks: [{ name: "Audio 1", type: "audio", color: "#3b82f6" }],
  },
  {
    id: "electronic",
    name: "Electronic",
    description: "4-to-the-floor dance production",
    icon: "Zap",
    bpm: 128,
    key: "Am",
    trackCount: 6,
    genre: "electronic",
    tracks: [
      { name: "Kick", type: "audio", color: "#ef4444" },
      { name: "Clap", type: "audio", color: "#f97316" },
      { name: "Hi-Hats", type: "audio", color: "#eab308" },
      { name: "Bass", type: "audio", color: "#8b5cf6" },
      { name: "Synth Lead", type: "midi", color: "#3b82f6" },
      { name: "FX", type: "audio", color: "#06b6d4" },
    ],
  },
  {
    id: "hiphop",
    name: "Hip Hop",
    description: "Trap/boom-bap beat production",
    icon: "Music",
    bpm: 90,
    key: "G#m",
    trackCount: 6,
    genre: "hiphop",
    tracks: [
      { name: "Kick", type: "audio", color: "#ef4444" },
      { name: "Snare", type: "audio", color: "#f97316" },
      { name: "Hi-Hats", type: "audio", color: "#eab308" },
      { name: "808 Bass", type: "audio", color: "#8b5cf6" },
      { name: "Melody", type: "midi", color: "#3b82f6" },
      { name: "Vocal Sample", type: "audio", color: "#10b981" },
    ],
  },
  {
    id: "rock",
    name: "Rock",
    description: "Classic rock band setup",
    icon: "Guitar",
    bpm: 120,
    key: "E",
    trackCount: 5,
    genre: "rock",
    tracks: [
      { name: "Kick", type: "audio", color: "#ef4444" },
      { name: "Snare", type: "audio", color: "#f97316" },
      { name: "Bass Guitar", type: "audio", color: "#8b5cf6" },
      { name: "Rhythm Guitar", type: "audio", color: "#3b82f6" },
      { name: "Lead Vocal", type: "audio", color: "#10b981" },
    ],
  },
  {
    id: "jazz",
    name: "Jazz",
    description: "Live jazz ensemble",
    icon: "Disc3",
    bpm: 100,
    key: "Bb",
    trackCount: 5,
    genre: "jazz",
    tracks: [
      { name: "Drums", type: "audio", color: "#ef4444" },
      { name: "Upright Bass", type: "audio", color: "#8b5cf6" },
      { name: "Piano", type: "midi", color: "#3b82f6" },
      { name: "Saxophone", type: "audio", color: "#eab308" },
      { name: "Trumpet", type: "audio", color: "#f97316" },
    ],
  },
  {
    id: "orchestral",
    name: "Orchestral",
    description: "Full orchestra arrangement",
    icon: "Speaker",
    bpm: 90,
    key: "Dm",
    trackCount: 7,
    genre: "orchestral",
    tracks: [
      { name: "Strings", type: "midi", color: "#3b82f6" },
      { name: "Brass", type: "midi", color: "#eab308" },
      { name: "Woodwinds", type: "midi", color: "#10b981" },
      { name: "Percussion", type: "audio", color: "#ef4444" },
      { name: "Timpani", type: "audio", color: "#f97316" },
      { name: "Harp", type: "midi", color: "#06b6d4" },
      { name: "Choir", type: "audio", color: "#8b5cf6" },
    ],
  },
  {
    id: "lofi",
    name: "Lo-Fi",
    description: "Chill lo-fi hip hop beats",
    icon: "Coffee",
    bpm: 80,
    key: "F#m",
    trackCount: 5,
    genre: "lofi",
    tracks: [
      { name: "Drums", type: "audio", color: "#ef4444" },
      { name: "Bass", type: "midi", color: "#8b5cf6" },
      { name: "Keys", type: "midi", color: "#3b82f6" },
      { name: "Sample", type: "audio", color: "#eab308" },
      { name: "Vocal Chop", type: "audio", color: "#10b981" },
    ],
  },
  {
    id: "ambient",
    name: "Ambient",
    description: "Atmospheric soundscapes",
    icon: "Cloud",
    bpm: 70,
    key: "D",
    trackCount: 5,
    genre: "ambient",
    tracks: [
      { name: "Pad", type: "midi", color: "#06b6d4" },
      { name: "Texture", type: "audio", color: "#8b5cf6" },
      { name: "Bass Drone", type: "midi", color: "#ef4444" },
      { name: "Field Recording", type: "audio", color: "#10b981" },
      { name: "Arp", type: "midi", color: "#3b82f6" },
    ],
  },
  {
    id: "pop",
    name: "Pop",
    description: "Modern pop production",
    icon: "Radio",
    bpm: 120,
    key: "C",
    trackCount: 6,
    genre: "pop",
    tracks: [
      { name: "Kick", type: "audio", color: "#ef4444" },
      { name: "Clap", type: "audio", color: "#f97316" },
      { name: "Synth Bass", type: "midi", color: "#8b5cf6" },
      { name: "Chord Synth", type: "midi", color: "#3b82f6" },
      { name: "Lead Vocal", type: "audio", color: "#10b981" },
      { name: "BG Vocals", type: "audio", color: "#06b6d4" },
    ],
  },
  {
    id: "podcast",
    name: "Podcast",
    description: "Podcast/voiceover setup",
    icon: "Mic2",
    bpm: 120,
    key: "C",
    trackCount: 4,
    genre: "podcast",
    tracks: [
      { name: "Host 1", type: "audio", color: "#3b82f6" },
      { name: "Host 2", type: "audio", color: "#10b981" },
      { name: "Intro Music", type: "audio", color: "#eab308" },
      { name: "Sound FX", type: "audio", color: "#8b5cf6" },
    ],
  },
];
