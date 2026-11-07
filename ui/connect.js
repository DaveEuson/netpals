// connect.js — the dial-up moment between Sign On and your Buddy List: five steps over about seven seconds, with a
// 56k modem handshake if you tick it (off by default, remembered once ticked). The first sign-on plays the whole thing;
// after that there's Skip. Cancel (or the X) goes back to Sign On.
const s = api.settingsSync();
const STEPS = [ // [text, seconds]
  ["Dialing Netpals…", 1.6], ["Connecting at 56,000 bps…", 2.4], ["Verifying screen name and password…", 1.6], ["Loading your buddy list…", 1.4], ["Signed on!", 0.6],
];
const timers = [];
let ctx = null; // AudioContext, made only while the modem is on

// The handshake, synthesized on the spot: dial tone, touch tones, the answer tone, the V.8 bongs, then the training
// noise that was the sound of the internet. It loosely follows the steps above and stops with the window.
function modem() {
  ctx = new AudioContext();
  const out = ctx.createGain(); out.gain.value = 0.12; out.connect(ctx.destination);
  const tone = (freqs, at, dur, type = "sine") => freqs.forEach((f) => {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f;
    o.connect(out); o.start(at); o.stop(at + dur);
  });
  const noise = (at, dur, from, to) => {
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter();
    src.buffer = b; f.type = "bandpass"; f.Q.value = 0.7; f.frequency.setValueAtTime(from, at); f.frequency.exponentialRampToValueAtTime(to, at + dur);
    src.connect(f).connect(out); src.start(at);
  };
  tone([350, 440], 0, 0.9);                                                                                     // dial tone
  [[697, 1209], [770, 1336], [852, 1477], [697, 1336], [941, 1336], [770, 1209], [852, 1336]].forEach((pair, i) => tone(pair, 1 + i * 0.17, 0.12)); // seven digits
  tone([2100], 2.3, 1.1);                                                                                       // answer tone
  [1200, 2250, 1200, 2250].forEach((f, i) => tone([f], 3.5 + i * 0.22, 0.2));                                   // bongs
  tone([1650], 4.4, 0.3, "sawtooth"); noise(4.4, 0.7, 300, 3000);                                               // probing
  noise(5.2, 0.9, 200, 3400); noise(6.2, 0.9, 3400, 400); noise(7.1, 0.6, 300, 3200);                           // training
}
const hush = () => { ctx?.close(); ctx = null; };

const leave = (fn) => { timers.forEach(clearTimeout); hush(); fn(); };
const done = () => leave(() => api.invoke("connect:done"));
$("skip").onclick = done;
$("cancel").onclick = () => leave(() => { api.invoke("win:open", "signon"); api.invoke("win:close"); });
const x = document.querySelector(".tb-close"); x.removeAttribute("data-win"); x.onclick = $("cancel").onclick;
$("modem").onchange = () => { api.invoke("settings:set", { modem: $("modem").checked }); hush(); if ($("modem").checked) modem(); };

$("skip").hidden = !s.connected;
$("modem").checked = s.modem;
let at = 0;
STEPS.forEach(([text, secs], i) => {
  $("bar").append(el("i"));
  timers.push(setTimeout(() => {
    $("step").textContent = text;
    say(`Step ${i + 1} of ${STEPS.length}`);
    $("bar").children[i].style.visibility = "visible";
  }, at * 1000));
  at += secs;
});
timers.push(setTimeout(done, at * 1000));
if (s.modem) modem();
