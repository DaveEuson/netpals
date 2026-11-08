// lib/machine.js — is this computer up to running buddies itself? Its memory, its graphics, and how long the model the
// brain step picked takes to answer one IM. The welcome screen leans hard on OpenRouter or Claude when the answer is no.

// PCI vendor ids, as Chromium reports the graphics hardware (app.getGPUInfo("basic")).
const VENDORS = { 0x10de: "NVIDIA", 0x1002: "AMD", 0x8086: "Intel", 0x106b: "Apple", 0x5143: "Qualcomm" };
// Graphics that runs a 7B model well. Intel and Qualcomm graphics share the computer's memory and crawl.
const FAST = ["NVIDIA", "AMD", "Apple"];
// Seconds for one reply: up to SLOW feels like a person typing; past TOO_SLOW, buddies feel broken.
const SLOW = 8, TOO_SLOW = 20;
// An IM reply runs about this many tokens.
const REPLY_TOKENS = 40;

function hardware(gpuInfo, { platform = process.platform, arch = process.arch, mem = require("os").totalmem() } = {}) {
  const ramGB = Math.round(mem / 2 ** 30);
  const found = (gpuInfo?.gpuDevice || []).map((d) => VENDORS[d.vendorId]).filter(Boolean);
  const gpu = platform === "darwin" && arch === "arm64" ? "Apple" : found.find((v) => FAST.includes(v)) || found[0] || "";
  return { ramGB, gpu, fast: FAST.includes(gpu) };
}

// How long one reply takes, in seconds (Infinity: more than the time allowed). Ollama times itself, leaving out the
// first load of the model; anything else (LM Studio) is timed from here with chat(). A fresh number at the top keeps
// Ollama from reusing an earlier run of the same prompt.
async function replySeconds(cfg, prompt, chat, { timeoutMs = 60_000 } = {}) {
  const fresh = `(${Math.random().toString(36).slice(2)})\n${prompt}`;
  const host = String(cfg.baseUrl || "").replace(/\/v1\/?$/, "");
  const r = await fetch(`${host}/api/generate`, { method: "POST", signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model: cfg.model, prompt: fresh, stream: false, options: { num_predict: REPLY_TOKENS } }) })
    .then((x) => (x.ok ? x.json() : null), (e) => (e.name === "TimeoutError" ? { timedOut: true } : null));
  if (r?.timedOut) return Infinity;
  if (r?.eval_count > 0) return (r.prompt_eval_duration + (r.eval_duration / r.eval_count) * REPLY_TOKENS) / 1e9;
  const t0 = Date.now();
  const ok = await Promise.race([chat({ system: fresh, messages: [{ role: "user", content: "hey" }], maxTokens: REPLY_TOKENS }).then(() => true),
    new Promise((done) => setTimeout(done, timeoutMs, false).unref?.())]);
  return ok ? (Date.now() - t0) / 1000 : Infinity;
}

// What the welcome screen says. level: good | slow | poor (use the internet) | ok (no model here yet, but it could run one).
function verdict({ ramGB, gpu, fast }, seconds) {
  const box = `${ramGB} GB of memory, ${gpu ? `${gpu} graphics` : "no graphics card for AI"}`;
  if (seconds != null) {
    const n = seconds === Infinity ? "more than a minute" : `about ${Math.max(1, Math.round(seconds))} second${Math.round(seconds) > 1 ? "s" : ""}`;
    if (seconds <= SLOW) return { level: "good", text: `This computer (${box}) answers an IM in ${n}. Buddies can live right here.` };
    if (seconds <= TOO_SLOW) return { level: "slow", text: `This computer (${box}) takes ${n} to answer an IM. It works, but buddies will feel sluggish. OpenRouter or Claude answer in a second or two.` };
    return { level: "poor", text: `This computer (${box}) takes ${n} to answer an IM: too slow for buddies. Use OpenRouter or Claude instead.` };
  }
  // Without fast graphics a model runs on the processor: reading the prompt alone takes 15 seconds or more.
  if (!fast || ramGB < 8) return { level: "poor", text: `This computer (${box}) isn't built for running AI models. Use OpenRouter or Claude instead.` };
  return { level: "ok", text: `This computer (${box}) could run buddies itself with Ollama, free and private. Or use OpenRouter or Claude.` };
}

module.exports = { hardware, replySeconds, verdict, SLOW, TOO_SLOW };
