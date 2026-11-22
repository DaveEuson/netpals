// Runnable check for loading a model before it answers:  npm test -- load
// A model Ollama hasn't loaded is loaded first, and the load doesn't count against the answer's time: here an answer
// gets 1 s, a load 2.5 s, and the slow model takes 1.5 s to load. A loaded model isn't loaded again (untagged names
// too, which Ollama lists as name:latest). A load that fails or runs out of time says so in plain words, one Ollama
// doesn't have is left for the answer to report, and LM Studio (no /api/ps) is asked straight away. Against the fake.
process.env.NETPALS_ANSWER_MS = "1000";
process.env.NETPALS_LOAD_MS = "2500";
const fakeModel = require("../fake-model");

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };

(async () => {
  const server = await fakeModel.start();
  const host = `http://127.0.0.1:${server.address().port}`;
  const llm = require("../../lib/llm");
  const ask = (model, baseUrl = `${host}/v1`) => llm.chat({ system: "You are a friend on an instant messenger.", messages: [{ role: "user", content: "hi" }], maxTokens: 30 }, { provider: "local", baseUrl, model })
    .then((text) => ({ text }), (e) => ({ error: e.message }));
  const loadsOf = (model) => server.loads.filter((m) => m === model).length;

  let r = await ask("fake:slowload");
  check(r.text === "hey :) long day?", `a model that takes longer to load than an answer may take still answers (${r.error || "ok"})`);
  check(loadsOf("fake:slowload") === 1 && server.lastChat.body.model === "fake:slowload", "it was loaded once, then asked");
  await ask("fake:slowload");
  check(loadsOf("fake:slowload") === 1, "the next message doesn't load it again");

  await ask("plainname");
  await ask("plainname");
  check(loadsOf("plainname") === 1, "an untagged name is known as loaded from Ollama's name:latest");

  r = await ask("fake:noload");
  check(/^Ollama couldn't load fake:noload: llama runner process has terminated/.test(r.error || "") && /graphics card/.test(r.error), `a load that fails says so, with Ollama's reason (${r.error})`);
  const asked = server.calls;
  r = await ask("fake:hangload");
  check(/^Ollama couldn't load fake:hangload in /.test(r.error || "") && server.calls === asked, `a load that runs out of time says so, and nothing is asked of it (${r.error})`);

  r = await ask("fake:missing");
  check(r.text && loadsOf("fake:missing") === 1, "a model Ollama doesn't have is left for the answer to report");

  const before = server.loads.length;
  r = await ask("lm-model", `${host}/lm/v1`);
  check(r.text && server.loads.length === before, "LM Studio, with no /api/ps, is asked straight away");

  server.close();
  console.log(failed ? `\n${failed} failed` : "\nall passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
