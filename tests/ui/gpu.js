// Going away while another program keeps the graphics card busy: away after two busy checks, back after four quiet
// ones, buddies still answering an IM meanwhile, I'm Back sticking while the card is still busy, and none of it with
// the setting off or the brain off this computer. NETPALS_GPU stands in for the card; gpuCheck(0) skips the wait for
// the model to have been quiet.
process.env.NETPALS_GPU = "10";
process.env.NETPALS_GPU_EVERY = String(24 * 3600_000); // no timed checks slipping in between the test's own
const t = require("../harness");
const { db, check, js, sleep, until, click, text, open, snap, buddy } = t;
const main = t.start({ ...t.ACCOUNT, autoAwayMinutes: 0 });
const card = (percent) => { process.env.NETPALS_GPU = String(percent); };
const checks = async (n) => { for (let i = 0; i < n; i++) await main.gpuCheck(0); };

t.run(async () => {
  const list = await t.signedOn();
  check(db.settings().awayWhenGpuBusy === true, "it's on by default");

  card(95);
  await checks(1);
  check(!db.settings().awayMessage, "one busy check isn't enough");
  await checks(1);
  let s = db.settings();
  check(s.gpuAway && s.awayMessage === "Busy with something else right now.", "two busy checks in a row and you're away");
  check(await until(async () => /You're away · Busy with something else/.test(await text(list, "me")), 3000), "the Buddy List says so");
  await snap(list, "gpu-away.png");

  // Buddies still answer if you IM them while away.
  await until(() => buddy("gordo_in_accounting").status === "online", 30_000);
  const gordo = buddy("gordo_in_accounting");
  const chat = await open(main, "chat", { id: String(gordo.id) });
  await js(chat, "document.getElementById('text').value = 'you there?'; document.getElementById('send').click()");
  check(await until(() => db.lastMessages(gordo.id, 1)[0]?.role === "buddy", 10_000), "a buddy still answers your IM while you're away");
  chat.close();

  card(10);
  await checks(3);
  check(db.settings().gpuAway, "three quiet checks aren't enough");
  card(95); await checks(1); card(10);
  await checks(3);
  check(db.settings().gpuAway, "and a busy one in between starts the quiet count over");
  await checks(1);
  s = db.settings();
  check(!s.gpuAway && !s.awayMessage && s.lastAwayText === "Busy with something else right now.", "four quiet checks in a row and you're back, and buddies hear where you were");

  // I'm Back while the card is still busy sticks until the card has been quiet once.
  card(95);
  await checks(2);
  check(db.settings().gpuAway, "busy again: away again");
  await click(list, "back"); await sleep(300);
  check(!db.settings().awayMessage && !db.settings().gpuAway, "I'm Back brings you back");
  await checks(4);
  check(!db.settings().awayMessage, "and the still-busy card doesn't send you away again");
  card(10); await checks(1); card(95); await checks(2);
  check(db.settings().gpuAway, "once it's been quiet, a busy card sends you away again");
  card(10); await checks(4);

  // An away you set yourself is yours: the card never changes it.
  main.scheduler.setAway("out to lunch", 0);
  card(95); await checks(2);
  check(db.settings().awayMessage === "out to lunch" && !db.settings().gpuAway, "a busy card leaves your own away alone");
  card(10); await checks(4);
  check(db.settings().awayMessage === "out to lunch", "and a quiet one doesn't end it");
  main.scheduler.setAway("");

  // Off in Setup, or the brain off this computer: nothing happens.
  const st = await open(main, "settings");
  check(await js(st, "document.getElementById('gpu-away').checked"), "Setup shows it on");
  await js(st, "document.getElementById('gpu-away').scrollIntoView({ block: 'center' })");
  await snap(st, "gpu-setting.png");
  await click(st, "gpu-away"); await sleep(300);
  await js(st, "document.querySelector('[data-win=close]').click()"); await sleep(400);
  check(db.settings().awayWhenGpuBusy === false, "and turns it off");
  card(95); await checks(3);
  check(!db.settings().awayMessage, "off: a busy card does nothing");
  db.setSettings({ awayWhenGpuBusy: true, provider: "openrouter" });
  await checks(3);
  check(!db.settings().awayMessage, "with OpenRouter as the brain, a busy card does nothing");
  db.setSettings({ provider: "local" });
  await checks(2);
  check(db.settings().gpuAway, "back on this computer, it works again");
  db.setSettings({ provider: "openrouter" });
  await checks(1);
  check(!db.settings().gpuAway && !db.settings().awayMessage, "switching the brain away from this computer while away brings you back");
  db.setSettings({ provider: "local" });
});
