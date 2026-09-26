// Wraps raw 16-bit little-endian PCM (what Gemini TTS returns) in a WAV header so browsers can play it.
export function pcmToWav(pcm: Uint8Array, sampleRate = 24000, channels = 1): Uint8Array {
  const header = new ArrayBuffer(44);
  const v = new DataView(header);
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  const byteRate = sampleRate * channels * 2;
  text(0, "RIFF");
  v.setUint32(4, 36 + pcm.length, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM format
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, pcm.length, true);
  const out = new Uint8Array(44 + pcm.length);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

// "audio/L16;codec=pcm;rate=24000" -> 24000
export function rateOf(mimeType: string | undefined) {
  const m = mimeType?.match(/rate=(\d+)/);
  return m ? Number(m[1]) : 24000;
}
