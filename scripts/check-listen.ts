// Proves the WAV wrapper for Gemini's PCM audio. Run: npx -y tsx scripts/check-listen.ts
import assert from "node:assert/strict";
import { pcmToWav, rateOf } from "../src/lib/tts/wav";

const pcm = new Uint8Array(4800); // 0.1 s of 16-bit mono at 24 kHz
const wav = pcmToWav(pcm, 24000);
const v = new DataView(wav.buffer);
const str = (at: number, n: number) => String.fromCharCode(...wav.slice(at, at + n));
assert.equal(wav.length, 44 + pcm.length);
assert.equal(str(0, 4), "RIFF");
assert.equal(v.getUint32(4, true), 36 + pcm.length);
assert.equal(str(8, 8), "WAVEfmt ");
assert.equal(v.getUint16(20, true), 1); // PCM
assert.equal(v.getUint16(22, true), 1); // mono
assert.equal(v.getUint32(24, true), 24000);
assert.equal(v.getUint32(28, true), 48000); // byte rate
assert.equal(v.getUint16(34, true), 16);
assert.equal(str(36, 4), "data");
assert.equal(v.getUint32(40, true), pcm.length);
assert.equal(rateOf("audio/L16;codec=pcm;rate=24000"), 24000);
assert.equal(rateOf("audio/L16;rate=16000"), 16000);
assert.equal(rateOf(undefined), 24000);
console.log("listen OK");
