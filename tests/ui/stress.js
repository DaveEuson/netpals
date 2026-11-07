// Stress: a year of heavy use in one go, a model that misbehaves every way it can, and a lot of window churn.
// npm test -- stress   (a few minutes; not part of the everyday run)
const path = require("path");
const fs = require("fs");
const { BrowserWindow, app } = require("electron");
const t = require("../harness");
const { db, check, js, sleep, until, open, buddy, ROOT } = t;
const main = t.start({ ...t.ACCOUNT, chattiness: 0 });
const ms = (t0) => Date.now() - t0;
const mb = () => Math.round(app.getAppMetrics().reduce((n, m) => n + m.memory.workingSetSize, 0) / 1024);
const say = (w, line) => js(w, `document.getElementById('text').value = ${JSON.stringify(line)}; document.getElementById('send').click()`);

// ---- a year of data: 60 buddies, 50,000 IMs, 2,000 room lines, 40 pictures
const PERSONA = "A test buddy who answers briefly.";
for (let i = 0; i < 57; i++) db.addBuddy({ name: `Buddy${i}`, screenName: `buddy_${i}`, emoji: "💬", era: 2000 + (i % 20), personaPrompt: PERSONA, nudge: 0 });
const all = db.buddies();
const insert = (fn) => { const t0 = Date.now(); fn(); return ms(t0); };
const yearAgo = Date.now() - 365 * 86_400_000;
const seedMs = insert(() => {
  for (let i = 0; i < 50_000; i++) {
    const b = all[i % all.length];
    db.addMessage(b.id, i % 2 ? "buddy" : "me", `message ${i} with a few words in it, like a real IM would have`, yearAgo + i * 600_000);
  }
  for (let i = 0; i < 2000; i++) db.addRoomMessage(i % 3 ? "buddy" : "me", `room line ${i}`, i % 3 ? all[i % all.length].id : 0);
});
const gordo = buddy("gordo_in_accounting");
fs.mkdirSync(path.join(db.dir, "files"), { recursive: true });
for (let i = 0; i < 40; i++) {
  const file = `${1700000000000 + i}-pic${i}.png`;
  fs.copyFileSync(path.join(ROOT, "assets", "icon.png"), path.join(db.dir, "files", file));
  db.addMessage(gordo.id, "me", "", Date.now() - (40 - i) * 1000, file);
}

t.run(async () => {
  const list = await t.signedOn();
  console.log(`seeded 50,000 IMs and 2,000 room lines in ${seedMs} ms; database ${(fs.statSync(path.join(db.dir, "netpals.db")).size / 1e6).toFixed(1)} MB`);

  // ---- volume
  check(await until(async () => /\/60\)/.test(await js(list, "document.querySelector('.group').textContent")), 5000), "the Buddy List counts all 60 buddies");
  let t0 = Date.now();
  for (let i = 0; i < 20; i++) db.unreadCounts();
  const unreadMs = ms(t0) / 20;
  check(unreadMs < 100, `counting unread IMs across 50,000 takes ${unreadMs.toFixed(1)} ms (it runs on every message)`);
  t0 = Date.now();
  await js(list, "load()");
  check(ms(t0) < 1000, `reloading the full Buddy List takes ${ms(t0)} ms`);
  t0 = Date.now();
  const busy = await open(main, "chat", { id: String(all[5].id) });
  await until(() => js(busy, "document.querySelectorAll('.msg').length >= 200"), 5000);
  check(ms(t0) < 2500, `opening an IM window with 200 messages of history takes ${ms(t0)} ms`);
  busy.close();
  t0 = Date.now();
  const pics = await open(main, "chat", { id: String(gordo.id) });
  const allPics = await until(() => js(pics, "[...document.querySelectorAll('img.pic')].length === 40 && [...document.querySelectorAll('img.pic')].every((i) => i.naturalWidth > 0)"), 15_000);
  check(allPics, `an IM window with 40 pictures shows every thumbnail (${ms(t0)} ms)`);
  pics.close();
  t0 = Date.now();
  const room = await open(main, "room");
  await until(() => js(room, "document.querySelectorAll('.msg').length >= 150"), 5000);
  check(ms(t0) < 2500, `opening Buddy Chat with 2,000 lines of history takes ${ms(t0)} ms`);
  room.close();
  const logFile = path.join(t.OUT, "stress-log.txt");
  fs.mkdirSync(t.OUT, { recursive: true });
  t0 = Date.now();
  t.files.save = logFile;
  await js(list, `api.invoke("chat:save", ${all[5].id})`);
  check(fs.readFileSync(logFile, "utf8").split("\r\n").length > 800 && ms(t0) < 2000, `saving a conversation of ${fs.readFileSync(logFile, "utf8").split("\r\n").length - 1} lines takes ${ms(t0)} ms`);

  // ---- a burst: ten quick lines to one buddy
  await until(() => db.buddies().filter((b) => b.status === "online").length >= 3, 30_000);
  const tash = buddy("xXtashaRAWRxX");
  db.updateBuddy(tash.id, { status: "online" });
  const before = db.lastMessages(tash.id, 1000).length;
  const chat = await open(main, "chat", { id: String(tash.id) });
  for (let i = 0; i < 10; i++) await say(chat, `line ${i}`);
  await sleep(12_000);
  const replies = db.lastMessages(tash.id, 1000).slice(before).filter((m) => m.role === "buddy").length;
  check(replies >= 1 && replies <= 2, `ten quick lines get one or two answers, not ten (${replies})`);

  // ---- a model that misbehaves
  const lastBuddyText = () => db.lastMessages(tash.id, 1)[0];
  const sendWith = async (model, line, wait = 6000) => {
    db.setSettings({ model });
    const n = db.lastMessages(tash.id, 1000).length;
    await say(chat, line);
    await until(() => db.lastMessages(tash.id, 1000).length > n + 1, wait);
    await sleep(500);
    return db.lastMessages(tash.id, 1000).slice(n + 1);
  };
  let got = await sendWith("fake:error", "hello?");
  check(got.length === 0 && /couldn't answer/.test(await js(chat, "[...document.querySelectorAll('.msg.err .text')].pop()?.textContent || ''")), "a model error shows in the window and nothing is saved");
  got = await sendWith("fake:empty", "hello??");
  check(got.length === 0, "an empty answer sends nothing");
  got = await sendWith("fake:huge", "tell me everything");
  check(got.length === 1 && got[0].text.length <= 321, `a 50 KB answer is clipped to ${got[0]?.text.length} characters`);
  got = await sendWith("fake:junk", "what's the plan");
  const junk = got[0]?.text || "";
  check(got.length === 1 && !/[<>]/.test(junk) && !/\n\s*\d\./.test(junk) && !/\p{Extended_Pictographic}/u.test(junk), `tags, lists and emoji are cleaned out of a junk answer ("${junk}")`);
  db.setSettings({ model: "fake:slow" });
  await say(chat, "are you slow?");
  await sleep(500);
  chat.close(); // closing the window while the buddy is still typing
  await sleep(4000);
  check(lastBuddyText().role === "buddy", "closing an IM window mid-reply is fine; the reply still lands");
  db.setSettings({ model: "fake:7b" });

  // ---- window churn: open and close an IM window for every buddy, twice, while presence changes fly
  const base = BrowserWindow.getAllWindows().length;
  const mem0 = mb();
  const storm = setInterval(() => { const b = all[Math.floor(Math.random() * all.length)]; main.broadcast("presence", { buddy: b, from: "online" }); }, 20);
  t0 = Date.now();
  for (let round = 0; round < 2; round++) {
    for (const b of all) {
      const w = main.openWindow("chat", { id: String(b.id) });
      await sleep(15);
      w.close();
    }
  }
  await until(() => BrowserWindow.getAllWindows().length === base, 10_000);
  clearInterval(storm);
  check(BrowserWindow.getAllWindows().length === base, `120 IM windows opened and closed in ${(ms(t0) / 1000).toFixed(1)} s, none left behind`);
  await sleep(3000);
  const mem1 = mb();
  check(mem1 - mem0 < 150, `memory after the churn: ${mem0} MB before, ${mem1} MB after`);

  // ---- a busy afternoon: 500 presence changes through the real drift
  t0 = Date.now();
  for (let i = 0; i < 500; i++) await main.scheduler.drift(new Date(2026, 0, 5, 14));
  check(ms(t0) < 20_000, `500 buddies wandering online, idle, away and off took ${(ms(t0) / 1000).toFixed(1)} s`);
  check(await js(list, "document.querySelectorAll('.buddy').length") > 0 && (await js(list, "document.getElementById('me').textContent")).length > 0, "and the Buddy List kept up");
  console.log(`memory at the end: ${mb()} MB across ${app.getAppMetrics().length} processes`);
});
