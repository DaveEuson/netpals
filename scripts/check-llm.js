// Runnable check for lib/llm.js:  npm run check:llm
// Auto-detects a model the way first launch does, then asks it for a one-line IM.
const { detect, chat } = require("../lib/llm");

(async () => {
  const cfg = await detect();
  console.log("detect →", cfg);
  if (cfg.provider === "openrouter") {
    cfg.apiKey = process.env.OPENROUTER_API_KEY || "";
    if (!cfg.apiKey) return console.log("(set OPENROUTER_API_KEY to test a reply)");
  }
  const t0 = Date.now();
  const out = await chat({ system: "You are a buddy on an instant messenger in 2003. One short sentence, lowercase ok.", messages: [{ role: "user", content: "ping" }] }, cfg);
  console.log(`reply (${Date.now() - t0} ms) →`, JSON.stringify(out));
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
