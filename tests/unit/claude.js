// Runnable check for the Claude brain in lib/llm.js:  npm test -- claude
// What goes out (low effort, room to think, no temperature, refusal fallbacks on the models that take them, pictures
// as Claude image blocks), what comes back (the text, not the thinking), and plain errors. Against the fake model's
// stand-in for Anthropic's Messages API; never a real key.
const fakeModel = require("../fake-model");

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };

(async () => {
  const server = await fakeModel.start();
  process.env.NETPALS_ANTHROPIC = `http://127.0.0.1:${server.address().port}`;
  const llm = require("../../lib/llm");
  const cfg = (model = "claude-opus-5-5", apiKey = "sk-ant-good") => ({ provider: "anthropic", baseUrl: "", model, apiKey });
  const ask = (c, extra = {}) => llm.chat({ system: "You are a friend on an instant messenger. Reply with one short hello.", messages: [{ role: "user", content: "hi" }], temperature: 0.2, maxTokens: 30, ...extra }, c);
  const err = (c, extra) => ask(c, extra).then(() => "no error", (e) => e.message);

  check((await ask(cfg())) === "hi!", "Claude's answer comes back as text, without the thinking block");
  const { headers, body } = server.lastClaude;
  check(body.model === "claude-opus-5-5" && body.system.startsWith("You are a friend") && body.messages[0].content === "hi", "the system prompt and the line go out as Claude expects");
  check(body.output_config?.effort === "low" && body.max_tokens === 4096 && !("temperature" in body), "low effort, room to think, and no temperature (current models refuse one)");
  check(body.fallbacks === "default" && /server-side-fallback-2026-07-01/.test(headers["anthropic-beta"] || ""), "Opus asks for Anthropic's fallback when a safety check declines");
  await ask(cfg("claude-haiku-5-5"));
  check(!("fallbacks" in server.lastClaude.body) && !server.lastClaude.headers["anthropic-beta"], "Haiku, which has no fallback, doesn't ask for one");
  await ask(cfg("claude-haiku-4-5"));
  check(!("output_config" in server.lastClaude.body), "an older model typed into Setup isn't sent an effort it would refuse");
  check(llm.CLAUDE_MODELS[0] === "claude-opus-5-5" && llm.CLAUDE_MODELS.includes("claude-haiku-5-5"), "Setup suggests the current Claude models, Opus first");

  const png = "data:image/png;base64,iVBORw0KGgo=";
  await ask(cfg(), { messages: [{ role: "user", content: [{ type: "text", text: "look" }, { type: "image_url", image_url: { url: png } }] }] });
  const sent = server.lastClaude.body.messages[0].content;
  check(sent[0].type === "text" && sent[0].text === "look" && sent[1].type === "image" && sent[1].source.media_type === "image/png" && sent[1].source.data === "iVBORw0KGgo=",
    "a picture goes out as a Claude image block");
  check((await llm.canSee(cfg())) === true, "Claude can see pictures");

  check(/No Anthropic API key/.test(await err(cfg(undefined, ""))), "no key says to add one");
  check(/didn't take that API key/.test(await err(cfg(undefined, "sk-ant-wrong"))), "a wrong key says so");
  check(/no model called claude-missing/.test(await err(cfg("claude-missing"))), "a model Anthropic doesn't have says so");
  check(/declined to answer/.test(await err(cfg("claude-refuses"))), "a refusal says Claude declined, instead of an empty IM");
  server.close();
  check(/Couldn't reach Anthropic/.test(await err(cfg())), "no answer from Anthropic says so");

  console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})();
