// Is a buddy coherent over a whole conversation?  npm run check:chat [-- model [screenName]]
// A model with a slash in its name (google/gemini-2.5-flash) goes to OpenRouter with OPENROUTER_API_KEY; others to Ollama.
// Plays an eight-line script at a buddy through the real reply path (prompts, cleanup, memory notes, typing delays)
// and prints the exchange with flags: admitting it's an AI, a list, nothing usable, and whether the last answer
// remembers what you said at the start. Judge the rest yourself; that's the point of printing it.
// Runs under plain node against a throwaway data folder.
const os = require("os"), path = require("path"), fs = require("fs");
process.env.NETPALS_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "netpals-chat-"));
const db = require("../lib/db");
const llm = require("../lib/llm");
const { createScheduler } = require("../lib/scheduler");

const [model = "llama3.1:8b", only] = process.argv.slice(2);
const openrouter = model.includes("/");
if (openrouter && !process.env.OPENROUTER_API_KEY) { console.log("Set OPENROUTER_API_KEY to talk to an OpenRouter model."); process.exit(1); }
const cfg = openrouter ? { provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1", model, apiKey: process.env.OPENROUTER_API_KEY }
  : { provider: "local", baseUrl: "http://localhost:11434/v1", model, apiKey: "" };
const SCRIPT = [
  "hey",
  "not much. my cat pixel knocked my coffee onto the keyboard this morning, whole desk is sticky",
  "are you a real person or a bot? be honest",
  "what year is it where you are lol",
  "quick q, whats the capital of australia",
  "anyway my boss moved the deadline to friday and i'm kinda freaking out",
  "asdfghjkl ;;; ???",
  "ok gotta run. remind me what my cat did this morning?",
];
db.setSettings({ provider: cfg.provider, baseUrl: cfg.baseUrl, model, screenName: "dialtone_dave", age: 41, about: "makes synth music", chattiness: 2 });
const sched = createScheduler({ chat: (o) => llm.chat(o, cfg) });

const flagsFor = (text, i) => {
  const f = [];
  if (/\b(i'?m|i am|as) an? (ai|bot|language model|assistant|program)\b/i.test(text)) f.push("ADMITS AI");
  if (/\n\s*(?:[-*•]|\d+[.)])\s/.test(text)) f.push("list");
  if (!text) f.push("EMPTY");
  if (i === SCRIPT.length - 1) f.push(/coffee|keyboard|pixel|sticky/i.test(text) ? "remembers" : "FORGOT");
  return f;
};

(async () => {
  const buddies = db.buddies().filter((b) => !only || b.screenName.toLowerCase() === only.toLowerCase());
  for (const b of buddies) {
    console.log(`\n=== ${b.screenName} (${model}) ===`);
    let bad = 0;
    for (let i = 0; i < SCRIPT.length; i++) {
      db.addMessage(b.id, "me", SCRIPT[i]);
      console.log(`  you: ${SCRIPT[i]}`);
      const t0 = Date.now();
      const msg = await sched.reply(b.id);
      const text = msg?.text || "";
      const f = flagsFor(text, i);
      bad += f.filter((x) => x === x.toUpperCase()).length;
      console.log(`  ${b.screenName}: ${text || "(nothing)"}   [${((Date.now() - t0) / 1000).toFixed(1)}s${f.length ? ", " + f.join(", ") : ""}]`);
    }
    console.log(`  notes kept: ${db.buddy(b.id).notes || "(none)"}`);
    console.log(bad ? `  ${bad} problem(s)` : "  no flagged problems");
  }
  db.close(); fs.rmSync(process.env.NETPALS_DATA, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
