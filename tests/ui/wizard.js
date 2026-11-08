// The setup wizard past your screen name: the brain step's check of this computer (a slow model gets a red note, the
// Recommended tag moves to OpenRouter and Claude, and Next warns once), picking OpenRouter or Claude right there with a
// key, your day (a bad calendar link holds Next; a good one and your town are saved), and how it feels (saved as it
// changes, auto-login with Sign On). Against the fake model, its /api/generate timings and its stand-in for Anthropic.
const t = require("../harness");
const { db, check, win, js, sleep, until, click, text, set, vis, snap } = t;
delete process.env.OPENROUTER_API_KEY; delete process.env.ANTHROPIC_API_KEY; // never a real key, and Next has to ask
const main = t.start({ model: "fake:slow", sound: true });
const CAL = `${t.MODEL.replace(/\/v1\/?$/, "")}/calendar.ics`;
const radio = (w, id) => js(w, `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.checked = true; e.dispatchEvent(new Event("change")); })()`);
const status = (w) => text(w, "status");

t.run(async () => {
  await until(() => win("welcome.html"), 15_000);
  const w = win("welcome.html");
  await t.shown(w); await sleep(400);
  await set(w, { "y-sn": "wizard walt", "y-pw": "secret1", "y-pw2": "secret1" });
  await click(w, "signon"); await sleep(400);
  await click(w, "signon"); await sleep(400);
  check((await text(w, "step-count")) === "Step 3 of 5", "on to the brain step");

  // ---- a slow computer
  check(await until(async () => /too slow for buddies/.test(await text(w, "machine-text")), 8000), `a 30-second model is called too slow: "${await text(w, "machine-text")}"`);
  check((await js(w, "document.getElementById('machine').classList.contains('warn')")) && (await vis(w, "rec-or")) && (await vis(w, "rec-claude")) && !(await vis(w, "rec-local")),
    "the note turns red and OpenRouter and Claude are the ones recommended");
  await snap(w, "wizard-slow.png");
  await click(w, "signon"); await sleep(300);
  check(/too slow for buddies to feel right.*press Next again/.test(await status(w)) && (await vis(w, "step-brain")), "Next warns once and stays");

  // ---- OpenRouter, picked right here
  await radio(w, "b-or");
  check(await until(() => db.settings().provider === "openrouter" && db.settings().model === "google/gemini-2.5-flash", 3000), "picking OpenRouter switches the brain, on its usual model");
  await sleep(300);
  check((await vis(w, "key-row")) && !(await vis(w, "claude-row")) && /run on OpenRouter/.test(await text(w, "legend")), "and asks for its key");
  await click(w, "signon"); await sleep(300);
  check(/paste an OpenRouter key/.test(await status(w)), "Next with no key says to paste one");

  // ---- Claude, picked right here, with its key
  await radio(w, "b-claude");
  check(await until(() => db.settings().provider === "anthropic" && db.settings().model === "claude-opus-5-5", 3000), "picking Claude switches to Claude Opus 5.5");
  await sleep(300);
  check((await vis(w, "claude-row")) && !(await vis(w, "key-row")), "and shows the Anthropic key box instead");
  await click(w, "signon"); await sleep(300);
  check(/Paste your Anthropic API key/.test(await status(w)), "Next with no key asks for it");
  await set(w, { "claude-key": "sk-ant-good" });
  await click(w, "signon");
  check(await until(() => vis(w, "cal"), 8000), "with a key, Next says hi to Claude and moves on to your day");
  check(db.settings().claudeKey === "sk-ant-good" && db.settings().apiKey === "", "the key is saved as Claude's, not OpenRouter's");

  // ---- back, and on this computer again
  await click(w, "back"); await sleep(300);
  await radio(w, "b-local");
  check(await until(() => db.settings().provider === "local" && db.settings().model === "fake:7b", 5000), "On this computer looks again and finds the model there");
  check(await until(async () => /answers an IM in about 2 seconds/.test(await text(w, "machine-text")), 5000) && (await vis(w, "rec-local")) && !(await vis(w, "rec-or")),
    "a quick one is timed and recommended");
  await click(w, "signon");
  await until(() => vis(w, "cal"), 8000);

  // ---- your day
  await set(w, { cal: CAL.replace("calendar.ics", "page.html") });
  await click(w, "signon"); await sleep(800);
  check(/isn't a calendar/.test(await text(w, "cal-result")) && (await vis(w, "cal")) && db.settings().calendarUrl === "", "a link that isn't a calendar holds Next, and isn't saved");
  await set(w, { cal: CAL, wx: "Springfield, Illinois" });
  await click(w, "signon");
  check(await until(() => vis(w, "t-chat"), 8000), "a good link and a town let Next through");
  check(db.settings().calendarUrl === CAL && db.settings().weatherPlace === "Springfield, Illinois", "and both are saved");
  await click(w, "back"); await sleep(300);
  check(/It works/.test(await text(w, "wx-result")) && /Dentist/.test(await text(w, "cal-result")), "going back shows what buddies are told");
  await set(w, { wx: "" });
  await click(w, "signon");
  await until(() => vis(w, "t-chat"), 5000);
  check(db.settings().weatherPlace === "" && db.settings().calendarUrl === CAL, "emptying a box clears it");

  // ---- how it feels
  check((await js(w, "document.getElementById('t-chat').options.length")) === 5 && (await js(w, "document.getElementById('t-sound').checked")), "five levels of chattiness, and the settings you have");
  await set(w, { "t-theme": "midnight", "t-qs": "23", "t-sound": false, "t-auto": true }); await sleep(300);
  const s = db.settings();
  check(s.theme === "midnight" && s.quietStart === 23 && s.sound === false, "theme, quiet hours and sounds save as they change");
  await snap(w, "wizard-touches.png");
  await click(w, "signon");
  check(await until(() => win("list.html") || win("connect.html"), 15_000) && (await until(() => !win("welcome.html"), 3000)), "Sign On dials up and closes setup");
  check(db.settings().savePassword && db.settings().autoLogin, "with Sign on automatically remembered");
});
