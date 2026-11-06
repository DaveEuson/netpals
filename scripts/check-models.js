// How do the local models do as buddies?  npm run check:models [-- model ...]
// For every chat model Ollama has (or the ones you name), each starting buddy sends one ping out of the blue and one
// reply to a rough day, through the real prompts and cleanup. Prints the time, the raw and cleaned text, and flags
// for the house rules the raw answer broke: emoji (for a pre-2010 buddy), a list, more than 2 sentences, saying it's
// an AI, echoing a "name:" prefix, quotes around the message, greeting you by screen name, or nothing usable at all.
// Runs under plain node against a throwaway data folder; nothing touches your real one.
const os = require("os"), path = require("path"), fs = require("fs");
process.env.NETPALS_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "netpals-models-"));
const db = require("../lib/db");
const llm = require("../lib/llm");
const prompts = require("../lib/prompts");

const HOST = "http://localhost:11434";
const UNFIT = /embed|coder|\bcode\b|ocr|whisper|tts|-text\b|base|r1\b|reason/i;
const YOU = { screenName: "dialtone_dave", age: 41, gender: "", about: "makes synth music, owns too many cables", quiz: { work: "fixing printers", into: "synths", hours: "night owl", peeve: "", bug: "finishing the album" } };
const ROUGH = "ugh long day. my boss moved the deadline up again and i haven't eaten since like 10";
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

function flags(raw, cleaned, buddy) {
  const f = [];
  if (!prompts.usesEmoji(buddy) && /\p{Extended_Pictographic}/u.test(raw)) f.push("emoji");
  if (/\n\s*(?:[-*•]|\d+[.)])\s/.test(raw)) f.push("list");
  if ((raw.match(/[.!?…]+(?=\s|$)/g) || []).length > 2) f.push("long");
  if (/\b(an? (ai|language model|assistant)|as an ai)\b/i.test(raw)) f.push("AI");
  if (new RegExp(`^\\s*(\\[[^\\]]*\\]\\s*)?(${buddy.screenName}|${buddy.name}|you|me)\\s*:`, "i").test(raw)) f.push("prefix");
  if (/^\s*["“]/.test(raw)) f.push("quotes");
  if (new RegExp(YOU.screenName.replace("_", "[_ ]?"), "i").test(raw)) f.push("name");
  if (/<note>/i.test(raw) && !/<\/note>/i.test(raw)) f.push("note-unclosed");
  if (!cleaned) f.push("EMPTY");
  return f;
}

async function ask(cfg, buddy, ctx, user) {
  const t0 = Date.now();
  try {
    const raw = await llm.chat({ system: prompts.buddySystem(buddy, ctx), messages: [{ role: "user", content: user }] }, cfg);
    const text = prompts.cleanMessage(raw, buddy);
    return { ms: Date.now() - t0, raw: raw.replace(/\s+/g, " ").trim(), text, flags: flags(raw, text, buddy) };
  } catch (e) { return { ms: Date.now() - t0, raw: "", text: "", flags: [`ERROR ${e.message}`] }; }
}

(async () => {
  const named = process.argv.slice(2);
  const found = (await llm.listLocal(HOST)) || [];
  const models = named.length ? named : found.map((m) => m.id).filter((id) => !UNFIT.test(id));
  if (!models.length) { console.log(`Nothing answering at ${HOST}.`); process.exit(1); }
  const buddies = db.buddies();
  const summary = [];
  for (const model of models) {
    const cfg = { provider: "local", baseUrl: `${HOST}/v1`, model, apiKey: "" };
    console.log(`\n=== ${model} ===`);
    const times = [], broke = {};
    for (const b of buddies) {
      const now = new Date();
      const ping = await ask(cfg, b, { now, recent: [], context: "nothing specific yet", you: YOU, reply: false }, prompts.ping(b));
      const recent = ping.text ? [{ role: "buddy", text: ping.text, ts: now - 60_000 }, { role: "me", text: ROUGH, ts: now }] : [{ role: "me", text: ROUGH, ts: now }];
      const reply = await ask(cfg, b, { now, recent: recent.slice(0, -1), context: "nothing specific yet", you: YOU, reply: true }, ROUGH);
      for (const [kind, r] of [["ping", ping], ["reply", reply]]) {
        times.push(r.ms);
        for (const f of r.flags) broke[f] = (broke[f] || 0) + 1;
        console.log(`${pad(b.screenName, 20)} ${pad(kind, 6)} ${pad(secs(r.ms), 6)} ${r.flags.length ? `[${r.flags.join(", ")}] ` : ""}${r.text || "(nothing)"}`);
        if (r.raw && r.raw !== r.text) console.log(`${pad("", 34)}raw: ${r.raw.slice(0, 160)}${r.raw.length > 160 ? "…" : ""}`);
      }
    }
    summary.push({ model, avg: times.reduce((a, c) => a + c, 0) / times.length, max: Math.max(...times), broke });
  }
  console.log("\n=== summary (6 messages each) ===");
  console.log(`${pad("model", 16)} ${pad("avg", 7)} ${pad("slowest", 8)} rules broken`);
  for (const s of summary) console.log(`${pad(s.model, 16)} ${pad(secs(s.avg), 7)} ${pad(secs(s.max), 8)} ${Object.entries(s.broke).map(([k, n]) => `${k}×${n}`).join(" ") || "none"}`);
  db.close(); fs.rmSync(process.env.NETPALS_DATA, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
