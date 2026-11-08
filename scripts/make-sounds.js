// Synthesizes the app's four original sounds into assets/*.wav: `npm run sounds`.
// Plain additive sine plucks plus a soft latch click; nothing sampled, nothing borrowed.
// Door tones follow sparko's presence chime (C5 up to G5 on sign-on, G4 down to C4 on sign-off).
const fs = require("fs");
const path = require("path");
const RATE = 22050;

// notes: [freqHz, startSec, durSec, gain]; clicks: [startSec, gain]
function render({ notes = [], clicks = [], total }) {
  const out = new Float32Array(Math.ceil(total * RATE));
  for (const [f, start, dur, gain] of notes) {
    const s0 = Math.floor(start * RATE);
    for (let i = 0; i < dur * RATE && s0 + i < out.length; i++) {
      const t = i / RATE;
      const env = Math.min(1, t / 0.008) * Math.exp((-5 * t) / dur);
      out[s0 + i] += gain * env * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) + 0.08 * Math.sin(6 * Math.PI * f * t));
    }
  }
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (const [start, gain] of clicks) {
    const s0 = Math.floor(start * RATE);
    let lp = 0;
    for (let i = 0; i < 0.03 * RATE; i++) { lp += 0.25 * (noise() - lp); out[s0 + i] += gain * lp * Math.exp(-i / (0.006 * RATE)); }
  }
  const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  return out.map((v) => (v / peak) * 0.8);
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(v * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const SOUNDS = {
  "door-open": { notes: [[523.25, 0.03, 0.45, 0.35], [783.99, 0.1, 0.55, 0.3]], clicks: [[0, 0.5]], total: 0.7 },
  "door-close": { notes: [[392.0, 0, 0.4, 0.3], [261.63, 0.08, 0.5, 0.3]], clicks: [[0.5, 0.6]], total: 0.6 },
  im: { notes: [[783.99, 0, 0.18, 0.3], [1046.5, 0.07, 0.2, 0.28], [1318.51, 0.14, 0.35, 0.25]], total: 0.5 },
  // Sending: two quick notes stepping down (D6 to A5), shorter and softer than an IM coming in.
  "im-send": { notes: [[1174.66, 0, 0.12, 0.22], [880.0, 0.06, 0.2, 0.2]], total: 0.3 },
};
const dir = path.join(__dirname, "..", "assets");
fs.mkdirSync(dir, { recursive: true });
for (const [name, spec] of Object.entries(SOUNDS)) {
  const file = path.join(dir, `${name}.wav`);
  fs.writeFileSync(file, wav(render(spec)));
  console.log(`wrote ${path.relative(process.cwd(), file)} (${spec.total}s)`);
}
