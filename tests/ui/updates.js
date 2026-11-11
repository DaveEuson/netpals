// A newer Netpals and Report a problem. Against the fake model's stand-in for GitHub, with 99.0.0 out: the Buddy
// List says so after sign-on, Get it opens the release, Not now skips that version for good, and Setup's switch stops
// the checks. Report a problem opens a new GitHub issue with the version, system and brain, and nothing about you.
// shell.openExternal is swapped for one that writes down what would have opened.
const t = require("../harness");
const { shell } = require("electron");
const { db, check, js, sleep, until, click, text, vis, set, open, snap } = t;
process.env.NETPALS_UPDATES = `${t.MODEL.replace(/\/v1\/?$/, "")}/new`;
const opened = [];
shell.openExternal = async (url) => { opened.push(url); };
const main = t.start({ ...t.ACCOUNT });
const VERSION = require("../../package.json").version;

t.run(async () => {
  const list = await t.signedOn();
  check(await until(() => vis(list, "update"), 8000), "after sign-on the Buddy List says a newer Netpals is out");
  check(/Netpals 99\.0\.0 is out\. Get it/.test(await text(list, "update")), `with its version: "${await text(list, "update")}"`);
  await snap(list, "update.png");
  await click(list, "update-get");
  check(await until(() => opened.at(-1) === "https://github.com/DaveEuson/netpals/releases/tag/v99.0.0", 3000), "Get it opens that release's page");

  await click(list, "update-skip");
  check(await until(async () => !(await vis(list, "update")), 3000) && db.settings().updateSkipped === "99.0.0", "Not now hides it and remembers that version");
  check((await main.updateCheck()) === null && !(await vis(list, "update")), "so the next daily check stays quiet about it");
  db.setSettings({ updateSkipped: "" });

  const st = await open(main, "settings");
  check((await text(st, "version")) === `This is Netpals ${VERSION}.`, `Setup shows this version (${VERSION})`);
  check(await js(st, "document.getElementById('updates').checked"), "and checking for new versions starts on");
  await set(st, { updates: false }); await sleep(300);
  check(db.settings().checkUpdates === false && (await main.updateCheck()) === null, "turned off, nothing is asked or shown");
  await set(st, { updates: true }); await sleep(300);
  check((await main.updateCheck())?.version === "99.0.0" && (await until(() => vis(list, "update"), 3000)), "turned back on, the next check finds it again");

  opened.length = 0;
  await click(st, "report");
  check(await until(() => opened.length === 1, 3000), "Report a problem opens one page");
  const url = opened[0] || "", body = new URL(url || "https://x").searchParams.get("body") || "";
  check(url.startsWith("https://github.com/DaveEuson/netpals/issues/new?"), "a new issue on Netpals' GitHub");
  check(body.includes(`Netpals ${VERSION} · `) && /· (Windows|macOS|Linux) \S+ \w+ ·/.test(body) && body.endsWith("brain: on this computer (fake:7b)"), `with the version, system and brain: "${body.split("---\n")[1]}"`);
  check(!body.includes(db.settings().screenName), "and nothing about you: not even your screen name");
  check(typeof main.reportProblem === "function", "the tray (and Help on a Mac) use the same report");
  await js(st, "document.getElementById('report').scrollIntoView()");
  await snap(st, "about.png");
});
