// More than one screen name on a computer. PHASE (set by tests/run.js) picks the launch; the data folder carries over:
//   first      setup as "dave one" with auto-login, then Sign Off (which starts Netpals over at Sign On)
//   signedoff  started by Sign Off: Sign On despite auto-login; New screen name… runs setup for "dave two" in a folder of
//              its own (same brain, its own buddies); closing setup goes back to Sign On; sign on as dave two
//   third      Sign On starts on dave two (the last one on); switching to dave one brings its saved password
const fs = require("fs");
const path = require("path");
const t = require("../harness");
const { app, db, check, win, js, sleep, until, click, text, set, vis } = t;
const PHASE = process.env.PHASE;
const ROOT = process.env.NETPALS_DATA;
const main = t.start(PHASE === "first" ? {} : { provider: db.settings().provider || "local" });
const picked = (w) => js(w, "document.getElementById('sn').selectedOptions[0]?.textContent");
const choices = (w) => js(w, "[...document.getElementById('sn').options].map((o) => o.textContent).join('|')");
const pick = (w, value) => js(w, `(() => { const e = document.getElementById("sn"); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event("change")); })()`);
const index = () => JSON.parse(fs.readFileSync(path.join(ROOT, "screen-names.json"), "utf8"));

// Through setup with the defaults: a screen name and password, then Next to the end and Sign On.
async function setup(w, sn, { auto = false } = {}) {
  await set(w, { "y-sn": sn, "y-pw": "secret1", "y-pw2": "secret1" });
  await click(w, "signon"); await until(() => vis(w, "q-work"), 3000);
  await click(w, "signon"); await until(() => vis(w, "b-local"), 3000);
  await click(w, "signon"); await until(() => vis(w, "cal"), 8000);
  await click(w, "signon"); await until(() => vis(w, "t-auto"), 3000);
  await set(w, { "t-auto": auto });
  await click(w, "signon");
}

t.run(async () => {
  await until(() => win("welcome.html") || win("signon.html") || win("connect.html"), 15_000);
  await sleep(600);

  if (PHASE === "first") {
    const w = win("welcome.html");
    check(!(await vis(w, "have-one")), "the very first setup has no other screen name to go back to");
    await setup(w, "dave one", { auto: true });
    await t.signedOn();
    check(index().last === "" && index().names[0]?.screenName === "dave one", "the first screen name lives in the data folder itself, and is listed");
    let relaunched = null;
    app.relaunch = (o) => { relaunched = o; }; // the real one would start a second Netpals inside the test
    app.quit = () => {};
    main.signOff();
    check(relaunched?.args?.includes("--signed-off"), "Sign Off starts Netpals over, marked as signed off");
  }

  if (PHASE === "signedoff") {
    const w = win("signon.html");
    check(Boolean(w) && !win("connect.html"), "after Sign Off it's Sign On, even with auto-login on");
    check(await until(async () => (await choices(w)) === "dave one|New screen name…", 3000), "listing your screen name and New screen name…");
    const brain = db.settings().model;
    await pick(w, "+new");
    check(await until(() => win("welcome.html") && !win("signon.html"), 5000), "New screen name… opens setup in place of Sign On");
    const s = win("welcome.html");
    await t.shown(s); await sleep(500);
    check(db.dir === path.join(ROOT, "screen-names", "2") && db.settings().model === brain && db.settings().screenName === "", "in a folder of its own, with the same brain and nobody in it yet");
    check(db.buddies().length === 3 && db.buddies().every((b) => !db.lastMessages(b.id, 1).length), "its own three buddies, with no chats");
    check(await until(() => vis(s, "have-one"), 3000), "with a way back to Sign On");
    await set(s, { "y-sn": "Dave One", "y-pw": "secret2", "y-pw2": "secret2" });
    await click(s, "signon"); await sleep(400);
    check(/already have that screen name/.test(await text(s, "status")), "another of your screen names can't be taken twice, whatever the case");
    await set(s, { "y-sn": "dave two" });
    await click(s, "signon"); await sleep(400);
    s.close();
    check(await until(() => win("signon.html"), 5000), "closing setup goes back to Sign On");
    const so = win("signon.html");
    check(await until(async () => (await choices(so)) === "dave one|dave two|New screen name…" && (await picked(so)) === "dave one", 3000), "which now lists both, on the one you had");
    check(db.dir === ROOT, "and is back on dave one's folder");
    await pick(so, "screen-names/2");
    await until(() => db.dir !== ROOT, 3000);
    check(!(await js(so, "document.getElementById('auto').checked")) && db.settings().screenName === "dave two", "picking dave two brings its own choices");
    await set(so, { pw: "secret2" }); await click(so, "signon");
    const list = await t.signedOn();
    check((await text(list, "title")) === "dave two's Buddy List" && index().last === "screen-names/2", "signing on as dave two opens dave two's list, and remembers it");
  }

  if (PHASE === "third") {
    const w = win("signon.html");
    check(Boolean(w) && (await until(async () => (await picked(w)) === "dave two", 3000)), "the next launch starts on dave two, the last one on");
    await pick(w, "");
    check(await until(async () => await js(w, "document.getElementById('save').checked && document.getElementById('auto').checked"), 3000), "switching to dave one brings its saved password and auto-login");
    await click(w, "signon");
    const list = await t.signedOn();
    check((await text(list, "title")) === "dave one's Buddy List", "and signs on as dave one with the saved password");
  }
});
