// lib/llm.js — one chat() over two providers, both speaking OpenAI chat-completions:
//   local      → Ollama (:11434) or LM Studio (:1234), baseUrl ends in /v1
//   openrouter → https://openrouter.ai/api/v1 with a Bearer key
// Adapted from Good Day Sunshine ai.js, trimmed to non-streaming (buddies send 1–2 sentences; nothing to stream).
const OPENROUTER = "https://openrouter.ai/api/v1";
// Ollama first, then LM Studio. NETPALS_OLLAMA points at an Ollama somewhere else (the tests point it at a fake).
const LOCAL_HOSTS = [process.env.NETPALS_OLLAMA || "http://localhost:11434", "http://localhost:1234"];
const OLLAMA = LOCAL_HOSTS[0];
// What Setup offers to download, and the one the welcome screen suggests (the first). Sizes are Ollama's downloads.
const RECOMMENDED = [
  { id: "llama3.1:8b", gb: 4.9, note: "the cleanest, a good first pick" },
  { id: "mistral-nemo", gb: 7.1, note: "the most human-sounding" },
  { id: "gemma3:4b", gb: 3.3, note: "small and quick, sees pictures" },
  { id: "gemma3:12b", gb: 8.1, note: "sees pictures, wants a good graphics card" },
];
const TIMEOUT_MS = 90_000;

// cfg: { provider: "local" | "openrouter", baseUrl, model, apiKey }
async function chat({ system, messages, temperature = 0.8, maxTokens = 300 }, cfg) {
  if (cfg.provider === "openrouter" && !cfg.apiKey) throw new Error("No OpenRouter API key. Add one in Settings.");
  const headers = { "Content-Type": "application/json", "X-Title": "Netpals" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const body = { model: cfg.model, temperature, max_tokens: maxTokens, messages: [{ role: "system", content: system }, ...messages] };
  // Reasoning models (qwen3, deepseek-r1) would otherwise burn the whole budget thinking about a one-line IM.
  // Verified on Ollama 0.35: /v1 ignores `think` but honours reasoning_effort "none"; "/no_think" does nothing.
  // Local only: OpenRouter rejects "none" for some models, and Gemini Flash is quick enough as-is.
  if (cfg.provider === "local") body.reasoning_effort = "none";
  const r = await fetch(`${cfg.baseUrl}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) })
    .catch((e) => {
      throw new Error(e.name === "TimeoutError" ? `${cfg.model} took longer than ${TIMEOUT_MS / 1000} s to answer` : `nothing answered at ${cfg.baseUrl}`);
    });
  if (!r.ok) throw new Error(`${cfg.provider} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const text = (await r.json()).choices?.[0]?.message?.content ?? "";
  return String(text).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// Can this model look at a picture? true / false, or null when there's no way to ask (LM Studio): then we just try.
// Ollama says so in /api/show; OpenRouter lists input modalities. Remembered per model for the session.
const sight = new Map();
async function canSee(cfg) {
  const key = `${cfg.baseUrl} ${cfg.model}`;
  if (sight.has(key)) return sight.get(key);
  let v = null;
  try {
    if (cfg.provider === "openrouter") {
      const m = (await (await fetch(`${OPENROUTER}/models`, { signal: AbortSignal.timeout(6000) })).json()).data?.find((x) => x.id === cfg.model);
      v = m ? (m.architecture?.input_modalities || []).includes("image") : null;
    } else if (/:11434\/v1/.test(cfg.baseUrl)) {
      const show = cfg.baseUrl.replace(/\/v1\/?$/, "/api/show");
      const r = await fetch(show, { method: "POST", body: JSON.stringify({ model: cfg.model }), signal: AbortSignal.timeout(6000) });
      v = r.ok ? ((await r.json()).capabilities || []).includes("vision") : null;
    }
  } catch { v = null; }
  sight.set(key, v);
  return v;
}

// ---- auto-detect -----------------------------------------------------------------------------
// "7.6B" | "qwen2.5-7b-instruct" | "llama3.1:8b" → 7.6 | 7 | 8. null when no size in the string.
const paramsB = (s = "") => { const m = String(s).match(/(\d+(?:\.\d+)?)\s*b\b/i); return m ? +m[1] : null; };
// Not a chat model, or not one you want writing IMs.
const UNFIT = /embed|coder|\bcode\b|vision|llava|ocr|whisper|tts|-text\b|base|r1\b|reason/i;

// Probe one host. Ollama answers /api/tags (richer); LM Studio only /v1/models. null → nothing listening.
async function listLocal(host) {
  const get = (p) => fetch(host + p, { signal: AbortSignal.timeout(2500) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const tags = await get("/api/tags");
  if (tags?.models) return tags.models.map((m) => ({ id: m.name, b: paramsB(m.details?.parameter_size) ?? paramsB(m.name) }));
  const v1 = await get("/v1/models");
  return v1?.data ? v1.data.map((m) => ({ id: m.id, b: paramsB(m.id) })) : null;
}

// Smallest instruct model ≥7B, from a family that's good at staying in character when there is one (check:models
// showed Qwen and Gemma clean, Mistral 7B rambling and breaking character); failing that the largest instruct model
// there is, marked `small` so the welcome screen can point at RigMatch. null when nothing usable.
const GOOD = /qwen3(?!\.5)|qwen2\.5|gemma3|llama3\.1|mistral-nemo/i;
function pickModel(models) {
  const fit = models.filter((m) => !UNFIT.test(m.id));
  const good = fit.filter((m) => GOOD.test(m.id));
  const big = (good.some((m) => m.b >= 7) ? good : fit).filter((m) => m.b >= 7).sort((a, b) => a.b - b.b)[0];
  const any = fit.sort((a, b) => (b.b ?? 0) - (a.b ?? 0))[0];
  return big ? { ...big, small: false } : any ? { ...any, small: true } : null;
}

// First-launch detection. Resolves to a cfg, plus for the welcome screen the model list, `small`, and whether Ollama
// answered at all (so it can offer a download). `prefer` wins when it's there: the model just downloaded.
async function detect(prefer) {
  let ollama = false;
  for (const host of LOCAL_HOSTS) {
    const models = await listLocal(host);
    if (host === OLLAMA) ollama = Boolean(models);
    const want = prefer && models?.find((m) => m.id === prefer || m.id === `${prefer}:latest`);
    const pick = want ? { ...want, small: want.b != null && want.b < 7 } : models && pickModel(models);
    if (pick) return { provider: "local", baseUrl: `${host}/v1`, model: pick.id, apiKey: "", models: models.map((m) => m.id), small: pick.small, ollama };
  }
  return { provider: "openrouter", baseUrl: OPENROUTER, model: "google/gemini-2.5-flash", apiKey: "", models: [], small: false, ollama };
}

// Download a model into Ollama: llama3.1:8b, mistral-nemo, anything in ollama.com/library. Ollama streams one JSON
// line per step; a model comes in a few layers, each with its own total. onProgress({ status, done, total }) in bytes.
// Stopping (signal) keeps what Ollama already has, so the next pull of the same model picks up from there.
const MODEL_NAME = /^[a-z0-9][\w.\-/]{0,79}(:[\w.\-]{1,40})?$/i;
async function pull(name, { onProgress = () => {}, signal } = {}) {
  if (!MODEL_NAME.test(name || "")) throw new Error("That doesn't look like a model name. Try one like llama3.1:8b.");
  const nope = (msg) => new Error(/does not exist|not found/i.test(msg) ? `Ollama has no model called ${name}. Check the name on ollama.com/library.`
    : /dial tcp|no such host|i\/o timeout|connection refused|network/i.test(msg) ? "Ollama couldn't reach its model library. Check your internet connection and try again."
    : `Ollama said: ${msg}`);
  const r = await fetch(`${OLLAMA}/api/pull`, { method: "POST", body: JSON.stringify({ model: name, name, stream: true }), signal })
    .catch((e) => { throw e.name === "AbortError" ? e : new Error("Ollama isn't running. Install it from ollama.com, or start it, and try again."); });
  if (!r.ok) { const t = await r.text(); let m = t; try { m = JSON.parse(t).error || t; } catch { /* plain text */ } throw nope(m.slice(0, 200)); }
  const layers = new Map(), dec = new TextDecoder();
  let buf = "";
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      let m;
      try { m = JSON.parse(line); } catch { continue; }
      if (m.error) throw nope(m.error);
      if (m.digest && m.total) layers.set(m.digest, [m.completed || 0, m.total]);
      let done = 0, total = 0;
      for (const [d, t] of layers.values()) { done += d; total += t; }
      onProgress({ status: m.status || "", done, total });
      if (m.status === "success") return;
    }
  }
  throw new Error("Ollama stopped before the download finished. Try again: it picks up where it left off.");
}

module.exports = { chat, canSee, detect, listLocal, pickModel, pull, LOCAL_HOSTS, RECOMMENDED };
