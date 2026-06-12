export interface DAWClip {
  id: string; trackId: string; name: string; startBar: number; duration: number;
  color: string; type: 'audio' | 'midi'; loop: boolean; gain: number;
  pan: number; muted: boolean; fadeIn: number; fadeOut: number;
  pitchShift?: number; timeStretch?: number; reverse?: boolean;
  notes?: DAWNote[];
  waveformPeaks?: number[];
}

export interface DAWNote {
  pitch: number; start: number; duration: number; velocity: number;
}

export interface DAWTrack {
  id: string; name: string; type: 'audio' | 'midi' | 'group' | 'bus' | 'master' | 'vca';
  color: string; height: number; order: number; parentId?: string;
  armed: boolean; muted: boolean; solo: boolean; monitoring: boolean;
  frozen: boolean; locked: boolean; automationArm: boolean;
  volume: number; pan: number; inputChannel?: string; outputBus?: string;
  pluginChain: string[]; sends: Array<{sendId: string; level: number}>;
}

export interface DAWSession {
  id: string; name: string; bpm: number; key: string; scale: string;
  timeSignature: [number, number]; sampleRate: number;
  tracks: DAWTrack[]; clips: DAWClip[]; sections: Section[];
  markers: Array<{name: string; bar: number}>;
  mixerState: MixerState; routing: RoutingState;
  created: string; modified: string; version: string;
}

export interface MixerState {
  channels: MixerChannelState[]; busses: BusState[];
  sends: SendState[]; vcaGroups: VCAState[];
}

export interface MixerChannelState {
  id: string; volume: number; pan: number; muted: boolean; solo: boolean;
  eq: {low: BandState; lowMid: BandState; highMid: BandState; high: BandState};
  compressor: {threshold: number; ratio: number; attack: number; release: number; makeup: number};
  plugins: Array<{name: string; enabled: boolean; params: Record<string, number>}>;
}

export interface BandState { freq: number; gain: number; q: number; active: boolean; }
export interface Section { name: string; startBar: number; bars: number; color: string; }
export interface BusState { id: string; name: string; volume: number; }
export interface SendState { id: string; name: string; level: number; source: string; dest: string; }
export interface VCAState { id: string; name: string; volume: number; }
export interface RoutingState { nodes: RoutingNodeState[] }
export interface RoutingNodeState { id: string; type: string; name: string; connections: string[]; }
