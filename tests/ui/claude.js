// The Claude brain: picked in Setup with its own Anthropic key (kept apart from OpenRouter's), Test it, a buddy IM
// through it, the welcome screen describing it, and Cancel putting the old brain back. Against the fake's stand-in for
// Anthropic's Messages API; a real ANTHROPIC_API_KEY in the environment is never used.
const t = require("../harness");
const { db, check, click, text, set, open, snap, until, js, vis } = t;
delete process.env.ANTHROPIC_API_KEY;
const main = t.start({ ...t.ACCOUNT, apiKey: "sk-or-kept" });
const radio = (w, id) => js(w, `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.checked = true; e.dispatchEvent(new Event("change")); })()`);

t.run(async () => {
  await t.signedOn();
  const before = db.settings();
  const st = await open(main, "settings");
  check(!(await vis(st, "claude-fields")), "Claude's fields stay hidden while the brain is on this computer");
  await radio(st, "p-claude"); await t.sleep(200);
  check(db.settings().provider === "anthropic" && db.settings().model === "claude-opus-5-5", "picking Claude starts on Claude Opus 5.5");
  check((await vis(st, "claude-fields")) && !(await vis(st, "or-fields")) && !(await vis(st, "local-fields")), "and shows only Claude's fields");
  check((await js(st, "[...document.getElementById('claude-list').options].map((o) => o.value).join(' ')")) === "claude-opus-5-5 claude-sonnet-5-5 claude-haiku-5-5", "suggesting Opus, Sonnet and Haiku");

  // The welcome screen, open while Setup picks Claude: no key yet, so Sign On says where to add one.
  const w = await open(main, "welcome");
  await js(w, "go('brain')"); await t.sleep(200);
  await click(w, "signon"); await t.sleep(200);
  check(/Paste your Anthropic API key/.test(await text(w, "status")) && (await vis(w, "claude-row")) && (await js(w, "document.getElementById('b-claude').checked")), "the welcome screen follows Setup to Claude, and its Next asks for the key right there");

  const testIt = async () => {
    await click(st, "test");
    await until(async () => !/Dialing/.test(await text(st, "test-result")) && (await text(st, "test-result")) !== "", 8000);
    return text(st, "test-result");
  };
  check(/No Anthropic API key/.test(await testIt()), "Test it with no key says to add one");
  await set(st, { "claude-key": "sk-ant-wrong" });
  check(/didn't take that API key/.test(await testIt()), "a wrong key says so");
  await set(st, { "claude-key": "sk-ant-good" });
  check(/^claude-opus-5-5 said hi/.test(await testIt()), "the right key says hi");
  check(db.settings().claudeKey === "sk-ant-good" && db.settings().apiKey === "sk-or-kept", "Claude's key is saved apart from OpenRouter's");
  await t.sleep(300);
  await click(w, "signon");
  await until(async () => !/^Dialing/.test(await text(w, "status")), 5000);
  check(!/Paste your Anthropic API key/.test(await text(w, "status")) && (await vis(w, "cal")), `once the key is in Setup, the open welcome screen knows, and moves on to your day`);
  await set(st, { "claude-model": "claude-haiku-5-5" });
  check(db.settings().model === "claude-haiku-5-5", "another model can be typed or picked");
  await js(st, "document.getElementById('p-claude').closest('fieldset').scrollIntoView()");
  await snap(st, "claude-setup.png");

  await radio(st, "p-or"); await radio(st, "p-claude"); await t.sleep(200);
  check(db.settings().provider === "anthropic" && db.settings().model === "claude-haiku-5-5" && db.settings().claudeKey === "sk-ant-good" && db.settings().apiKey === "sk-or-kept",
    "switching to OpenRouter and back keeps both keys and the Claude model");

  const gordo = t.buddy("gordo_in_accounting");
  const msg = await main.scheduler.fire(gordo, new Date());
  check(msg?.text === "hey :) long day?", `a buddy IMs through Claude: "${msg?.text}"`);

  check(/run on Claude/.test(await text(w, "legend")) && /Claude/.test(await text(w, "brain-name")) && /Anthropic/.test(await text(w, "privacy")), "the welcome screen says the buddies run on Claude, and where chats go");
  check(!(await vis(w, "key-row")) && !(await vis(w, "get")), "with no OpenRouter key box and no download offer");
  w.close();

  await click(st, "cancel");
  await until(() => !t.win("settings.html"), 3000);
  const after = db.settings();
  check(after.provider === before.provider && after.model === before.model && after.claudeKey === "", "Cancel puts the old brain back and forgets the Claude key");
});
