// Runnable check for the ChatGPT and Gemini brains in lib/llm.js:  npm test -- cloud
// What goes out (the key, reasoning off, the right length cap for each, a temperature only where it's taken, pictures
// as they are), stepping up when a model refuses a reasoning setting and remembering that, the models a key can use,
// and plain errors. Against the fake model's stand-ins for OpenAI's API and Gemini's OpenAI-compatible one; never a
// real key.
const fakeModel = require("../fake-model");

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };

(async () => {
  const server = await fakeModel.start();
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.NETPALS_OPENAI = `${base}/oa`;
  process.env.NETPALS_GEMINI = `${base}/gm`;
  const llm = require("../../lib/llm");
  const cfg = (provider, model, apiKey = "good-key") => ({ provider, baseUrl: "", model, apiKey });
  const ask = (c, extra = {}) => llm.chat({ system: "You are a friend on an instant messenger. Reply with one short hello.", messages: [{ role: "user", content: "hi" }], temperature: 0.3, maxTokens: 30, ...extra }, c);
  const err = (c) => ask(c).then(() => "no error", (e) => e.message);

  // ChatGPT
  check((await ask(cfg("openai", "gpt-5.6-luna"))) === "hi!", "ChatGPT answers");
  let { headers, body } = server.lastCloud;
  check(headers.authorization === "Bearer good-key" && body.model === "gpt-5.6-luna" && body.messages[0].role === "system" && body.messages[1].content === "hi",
    "the key goes as a Bearer token, the system prompt first");
  check(body.reasoning_effort === "none" && body.max_completion_tokens === 30 && !("max_tokens" in body) && body.temperature === 0.3,
    "reasoning off, OpenAI's max_completion_tokens, and the temperature (taken with reasoning off)");

  server.cloudCalls = 0;
  check((await ask(cfg("openai", "gpt-no-none"))) === "hi!" && server.cloudCalls === 2, "a model that refuses reasoning off is asked again a step up");
  ({ body } = server.lastCloud);
  check(body.reasoning_effort === "minimal" && body.max_completion_tokens === 4096 && !("temperature" in body), "with room to think in the cap, and no temperature (OpenAI's reasoning models refuse one)");
  server.cloudCalls = 0;
  await ask(cfg("openai", "gpt-no-none"));
  check(server.cloudCalls === 1 && server.lastCloud.body.reasoning_effort === "minimal", "and next time it starts where it worked");

  const png = "data:image/png;base64,iVBORw0KGgo=";
  await ask(cfg("openai", "gpt-5.6-luna"), { messages: [{ role: "user", content: [{ type: "text", text: "look" }, { type: "image_url", image_url: { url: png } }] }] });
  check(server.lastCloud.body.messages[1].content[1].image_url.url === png, "a picture goes as an image_url, as OpenAI takes it");
  check(await llm.canSee(cfg("openai", "gpt-5.6-luna")) === true, "ChatGPT models are taken to see pictures");

  check(/OpenAI didn't take that API key/.test(await err(cfg("openai", "gpt-5.6-luna", "bad-key"))), "a bad key, in plain words");
  check(/No OpenAI API key/.test(await err(cfg("openai", "gpt-5.6-luna", ""))), "no key, in plain words");
  check(/OpenAI has no model called gpt-missing/.test(await err(cfg("openai", "gpt-missing"))), "a model that isn't there, in plain words");

  // Gemini
  check((await ask(cfg("gemini", "gemini-3.5-flash-lite"))) === "hi!", "Gemini answers");
  ({ body } = server.lastCloud);
  check(body.reasoning_effort === "none" && body.max_tokens === 30 && !("max_completion_tokens" in body) && body.temperature === 0.3, "reasoning off, Gemini's max_tokens, and the temperature");
  server.cloudCalls = 0;
  await ask(cfg("gemini", "gemini-no-none"));
  ({ body } = server.lastCloud);
  check(server.cloudCalls === 2 && body.reasoning_effort === "minimal" && body.max_tokens === 4096 && body.temperature === 0.3,
    "a Gemini that can't stop thinking is asked again a step up, with room in the cap (Gemini's error comes as a list)");

  // The models a key can use
  let l = await llm.listCloud("openai", "good-key");
  check(JSON.stringify(l.models) === JSON.stringify(["gpt-5.6-luna", "gpt-6-astra", "gpt-no-none"]) && l.pick === "gpt-5.6-luna",
    "ChatGPT's list leaves out embeddings, speech and pictures, and starts on its small quick model");
  l = await llm.listCloud("gemini", "good-key");
  check(JSON.stringify(l.models) === JSON.stringify(["gemini-3.5-flash-lite", "gemini-4-hydrogen", "gemini-no-none"]) && l.pick === "gemini-3.5-flash-lite",
    "Gemini's too, without its models/ prefix");
  check(/didn't take that API key/.test((await llm.listCloud("gemini", "bad-key")).error) && /Paste your Google API key/.test((await llm.listCloud("gemini", "")).error),
    "a bad key or none says so");
  check(llm.CLOUD.openai.name === "ChatGPT" && llm.CLOUD.gemini.maker === "Google", "named ChatGPT and Gemini, made by OpenAI and Google");

  server.close();
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
