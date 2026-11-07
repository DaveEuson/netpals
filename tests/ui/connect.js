// The Connecting window: the whole dial-up the first time, Skip after that, the modem sound, Cancel.
const t = require("../harness");
const { db, check, win, js, sleep, until, click, text, open, snap } = t;
const main = t.start({ ...t.ACCOUNT, connected: false });

t.run(async () => {
  const t0 = Date.now();
  check(await until(() => win("connect.html"), 10_000), "auto-login opens Connecting first");
  let c = win("connect.html");
  await sleep(500);
  check(await js(c, "document.getElementById('skip').hidden"), "the first time there's no Skip");
  check(!(await js(c, "document.getElementById('modem').checked")) && !db.settings().modem, "the modem sound is off by default");
  check(!win("list.html"), "the Buddy List isn't open yet");
  const seen = new Set();
  const poll = setInterval(async () => { try { seen.add(await text(c, "step")); } catch { /* closing */ } }, 200);
  await until(() => [...seen].some((s) => /56,000/.test(s)), 4000);
  await snap(c, "connect.png");
  await click(c, "modem"); await sleep(300);
  check(db.settings().modem && (await js(c, "ctx instanceof AudioContext && ctx.state")) === "running", "ticking Modem sound saves it and starts the handshake");
  check(await until(() => win("list.html"), 12_000), `the Buddy List opens by itself (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  clearInterval(poll);
  check(await until(() => !win("connect.html"), 3000), "and Connecting closes");
  check(seen.size >= 4 && [...seen].some((s) => /Signed on!/.test(s)), `the steps played through (${[...seen].join(" / ")})`);
  check(db.settings().connected, "and that's remembered");

  c = await open(main, "connect");
  check(!(await js(c, "document.getElementById('skip').hidden")), "next time Skip is offered");
  check((await js(c, "document.getElementById('modem').checked")) && (await js(c, "ctx && ctx.state")) === "running", "the modem sound stays on and plays again");
  await click(c, "skip");
  check(await until(() => !win("connect.html"), 3000) && Boolean(win("list.html")), "Skip jumps to the Buddy List");

  c = await open(main, "connect");
  await click(c, "modem"); await sleep(200);
  check(!db.settings().modem && (await js(c, "ctx")) === null, "unticking stops the sound and saves it off");
  await click(c, "cancel");
  check(await until(() => win("signon.html") && !win("connect.html"), 3000), "Cancel goes back to Sign On");
});
