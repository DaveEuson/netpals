// The ChatGPT and Gemini brains: picked in Setup with their own keys (kept apart from each other and from OpenRouter's
// and Claude's), the Model box filling with what a key can use, Test it, a buddy IM through each, the welcome screen
// describing them and asking for a key, and Cancel putting the old brain back. Against the fake's stand-ins for
// OpenAI's and Gemini's APIs; a real OPENAI_API_KEY or GEMINI_API_KEY in the environment is never used.
const t = require("../harness");
const { db, check, click, text, set, open, snap, until, js, vis } = t;
delete process.env.OPENAI_API_KEY;
delete process.env.GEMINI_API_KEY;
const main = t.start({ ...t.ACCOUNT, apiKey: "sk-or-kept", claudeKey: "sk-ant-kept" });
const radio = (w, id) => js(w, `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.checked = true; e.dispatchEvent(new Event("change")); })()`);
const list = (w) => js(w, "[...document.getElementById('cloud-list').options].map((o) => o.value).join(' ')");

t.run(async () => {
  await t.signedOn();
  const before = db.settings();
  const st = await open(main, "settings");
  check(!(await vis(st, "cloud-fields")), "ChatGPT's and Gemini's fields stay hidden while the brain is on this computer");

  const testIt = async () => {
    await click(st, "test");
    await until(async () => !/Dialing/.test(await text(st, "test-result")) && (await text(st, "test-result")) !== "", 8000);
    return text(st, "test-result");
  };

  // ChatGPT
  await radio(st, "p-openai"); await t.sleep(300);
  check(db.settings().provider === "openai" && db.settings().model === "gpt-5.6-luna", "picking ChatGPT starts on its small quick model");
  check((await vis(st, "cloud-fields")) && !(await vis(st, "or-fields")) && !(await vis(st, "claude-fields")) && !(await vis(st, "local-fields")), "and shows only its fields");
  check(/platform\.openai\.com/.test(await text(st, "cloud-hint")) && /Paste your OpenAI API key/.test(await text(st, "cloud-result")), "saying where to get a key, and asking for one");
  check((await list(st)) === "gpt-5.6-luna gpt-6-astra", "suggesting its usual models before there's a key");
  check(/No OpenAI API key/.test(await testIt()), "Test it with no key says to add one");

  // The welcome screen, open while Setup picks ChatGPT: no key yet, so its Next asks for one right there.
  const w = await open(main, "welcome");
  await js(w, "go('brain')"); await t.sleep(200);
  await click(w, "signon"); await t.sleep(200);
  check(/Paste your OpenAI API key/.test(await text(w, "status")) && (await vis(w, "cloud-row")) && (await js(w, "document.getElementById('b-openai').checked")),
    "the welcome screen follows Setup to ChatGPT, and its Next asks for the key");
  check(/run on ChatGPT/.test(await text(w, "legend")) && /OpenAI/.test(await text(w, "privacy")) && (await text(w, "cloud-label")) === "OpenAI API key", "and says where chats go");
  check(!(await vis(w, "key-row")) && !(await vis(w, "claude-row")) && !(await vis(w, "get")), "with no OpenRouter or Claude key box and no download offer");
  await snap(w, "welcome-chatgpt.png");

  await set(st, { "cloud-key": "bad-key" });
  await until(async () => /didn't take/.test(await text(st, "cloud-result")), 5000);
  check(/OpenAI didn't take that API key/.test(await text(st, "cloud-result")), "a wrong key says so as soon as it's pasted");
  await set(st, { "cloud-key": "good-key" });
  await until(async () => /models? for this key/.test(await text(st, "cloud-result")), 5000);
  check((await list(st)) === "gpt-5.6-luna gpt-6-astra gpt-no-none" && /3 models/.test(await text(st, "cloud-result")), "the right key fills the Model box with what it can use");
  check(/^gpt-5\.6-luna said hi/.test(await testIt()), "and Test it says hi");
  check(db.settings().openaiKey === "good-key" && db.settings().apiKey === "sk-or-kept" && db.settings().claudeKey === "sk-ant-kept", "ChatGPT's key is saved apart from the others");
  await set(st, { "cloud-model": "gpt-6-astra" });
  check(db.settings().model === "gpt-6-astra", "another model can be picked");
  const gordo = t.buddy("gordo_in_accounting");
  let msg = await main.scheduler.fire(gordo, new Date());
  check(msg?.text === "hey :) long day?" && t.buddy("gordo_in_accounting") && db.settings().provider === "openai", `a buddy IMs through ChatGPT: "${msg?.text}"`);

  await t.sleep(300);
  await click(w, "signon");
  await until(async () => !/^Dialing/.test(await text(w, "status")), 5000);
  check(!/Paste your OpenAI API key/.test(await text(w, "status")) && (await vis(w, "cal")), "once the key is in Setup, the welcome screen moves on to your day");
  w.close();

  // Gemini
  await radio(st, "p-gemini"); await t.sleep(300);
  check(db.settings().provider === "gemini" && db.settings().model === "gemini-3.5-flash-lite", "picking Gemini starts on its small quick model");
  check((await js(st, "document.getElementById('cloud-key').value")) === "" && /aistudio\.google\.com/.test(await text(st, "cloud-hint")), "with its own empty key box, and where to get a key");
  await set(st, { "cloud-key": "good-key" });
  await until(async () => /models? for this key/.test(await text(st, "cloud-result")), 5000);
  check((await list(st)) === "gemini-3.5-flash-lite gemini-4-hydrogen gemini-no-none", "a Gemini key lists Gemini's models");
  check(/^gemini-3\.5-flash-lite said hi/.test(await testIt()), "and Test it says hi");
  check(db.settings().geminiKey === "good-key" && db.settings().openaiKey === "good-key", "Gemini's key is saved apart from ChatGPT's");
  msg = await main.scheduler.fire(gordo, new Date());
  check(msg?.text === "hey :) long day?", `a buddy IMs through Gemini: "${msg?.text}"`);
  await js(st, "document.getElementById('p-gemini').closest('fieldset').scrollIntoView()");
  await snap(st, "gemini-setup.png");

  await radio(st, "p-openai"); await t.sleep(300);
  check(db.settings().provider === "openai" && (await js(st, "document.getElementById('cloud-key').value")) === "good-key", "back to ChatGPT, its key is still there");

  await click(st, "cancel");
  await until(() => !t.win("settings.html"), 3000);
  const after = db.settings();
  check(after.provider === before.provider && after.model === before.model && after.openaiKey === "" && after.geminiKey === "", "Cancel puts the old brain back and forgets the keys");
});
