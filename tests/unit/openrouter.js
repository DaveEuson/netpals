// Runnable check for what lib/llm.js tells OpenRouter about itself:  npm test -- openrouter
// OpenRouter's app attribution headers (Netpals' page, name and category) go out with an OpenRouter request, and
// nothing in them is about the person. A model on this computer gets none of them. Against the fake model, standing in
// for OpenRouter's chat-completions API; never a real key.
const fakeModel = require("../fake-model");

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };

(async () => {
  const server = await fakeModel.start();
  const base = `http://127.0.0.1:${server.address().port}/v1`;
  const llm = require("../../lib/llm");
  const ask = (cfg) => llm.chat({ system: "You are a friend on an instant messenger.", messages: [{ role: "user", content: "hi" }], maxTokens: 30 }, cfg);

  await ask({ provider: "openrouter", baseUrl: base, model: "fake:7b", apiKey: "sk-or-test" });
  const h = server.lastChat.headers;
  check(h["http-referer"] === "https://github.com/DaveEuson/netpals", "OpenRouter is told the request comes from Netpals' GitHub page");
  check(h["x-openrouter-title"] === "Netpals" && h["x-openrouter-categories"] === "roleplay", "with Netpals as the name and roleplay as the category");
  check(h.authorization === "Bearer sk-or-test", "and the key still goes as a Bearer token");
  const sent = [h["http-referer"], h["x-openrouter-title"], h["x-openrouter-categories"]].join(" ");
  check(!/friend|hi\b|sk-or/.test(sent), "the attribution carries nothing from the conversation or the key");

  await ask({ provider: "local", baseUrl: base, model: "fake:7b" });
  const l = server.lastChat.headers;
  check(!l["http-referer"] && !l["x-openrouter-title"] && !l["x-openrouter-categories"] && !l["x-title"], "a model on this computer gets none of it");

  server.close();
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
