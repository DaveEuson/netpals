// Away: the window, I'm Back, the come-back timer, and a timer that outlives a restart.
const t = require("../harness");
const { db, check, js, sleep, until, click, text, open, snap } = t;
const main = t.start({ ...t.ACCOUNT, awayMessage: "left over from last launch", awaySince: Date.now(), awayUntil: Date.now() + 6000 });

t.run(async () => {
  const list = await t.signedOn();
  check(db.settings().awayMessage === "left over from last launch" && /You're away till/.test(await text(list, "me")), "an away from last launch is still on");
  check(await until(() => !db.settings().awayMessage, 9000), "and its timer picks up where it left off");

  let aw = await open(main, "away");
  check((await js(aw, "document.getElementById('back').value")) === "0", "Come back defaults to when I say so");
  await t.set(aw, { back: "15" });
  await snap(aw, "away.png");
  const t0 = Date.now();
  await click(aw, "go");
  await until(() => !t.win("away.html"), 3000);
  const s = db.settings();
  check(s.awayMessage && s.awayMinutes === 15 && s.awayUntil > t0 + 14.9 * 60_000 && s.awayUntil < t0 + 15.2 * 60_000, "I'm Away with 15 minutes sets a come-back time and remembers the pick");
  await sleep(300);
  check(/You're away till \d{1,2}:\d\d/.test(await text(list, "me")), "the Buddy List shows until when");
  await click(list, "back"); await sleep(400);
  check(!db.settings().awayMessage && db.settings().awayUntil === 0 && /You're online/.test(await text(list, "me")), "I'm Back clears the timer too");
  aw = await open(main, "away");
  check((await js(aw, "document.getElementById('back').value")) === "15", "next time the pick is remembered");
  aw.close();

  main.scheduler.setAway("coffee run", 0.03); main.broadcast("settings", db.settings());
  await sleep(300);
  check(/You're away till/.test(await text(list, "me")), "away with a 2-second limit");
  check(await until(() => !db.settings().awayMessage, 5000), "comes back by itself");
  check(await until(async () => /You're online/.test(await text(list, "me")), 3000) && db.settings().lastAwayText === "coffee run", "the list hears about it, and buddies will too");
  main.scheduler.setAway("gone fishing", 0); await sleep(2500);
  check(db.settings().awayMessage === "gone fishing" && db.settings().awayUntil === 0, "when I say so stays away");
});
