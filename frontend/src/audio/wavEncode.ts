/** Encode a decoded AudioBuffer to 16-bit PCM WAV. */
export function encodeAudioBufferToWav(audio: AudioBuffer): Blob {
  const numCh = audio.numberOfChannels;
  const sampleRate = audio.sampleRate;
  const numSamples = audio.length;
  const bytesPerSample = 2;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = numSamples * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  let off = 0;
  const writeStr = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off++, s.charCodeAt(i));
  };
  const u32 = (v: number) => {
    view.setUint32(off, v, true);
    off += 4;
  };
  const u16 = (v: number) => {
    view.setUint16(off, v, true);
    off += 2;
  };
  writeStr("RIFF");
  u32(36 + dataSize);
  writeStr("WAVE");
  writeStr("fmt ");
  u32(16);
  u16(1);
  u16(numCh);
  u32(sampleRate);
  u32(sampleRate * blockAlign);
  u16(blockAlign);
  u16(16);
  writeStr("data");
  u32(dataSize);
  const channels: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) channels.push(audio.getChannelData(c));
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

/** Decode an arbitrary audio Blob (e.g. webm) and re-encode as WAV. */
export async function encodeBlobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  try {
    const audio = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return encodeAudioBufferToWav(audio);
  } finally {
    void ctx.close();
  }
}
