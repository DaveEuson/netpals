// The Buddy List: sounds, buddies signing on, the groups and status lines, unread counts, chattiness.
const t = require("../harness");
const { db, check, js, sleep, until, click, text, snap, buddy } = t;
const main = t.start({ ...t.ACCOUNT, chattiness: 2 });
db.addMessage(buddy("gordo_in_accounting").id, "buddy", "breakroom coffee has entered its burnt-toast era.");

t.run(async () => {
  const list = await t.signedOn();
  const sounds = await js(list, "Promise.all(['door-open','door-close','im'].map((n) => new Audio('../assets/' + n + '.wav').play().then(() => 'ok', (e) => n + ': ' + e.message)))");
  check(sounds.every((s) => s === "ok"), `all three sounds decode (${sounds})`);
  check(await until(() => db.buddies().every((b) => b.status === "online"), 30_000), "then everyone signs on within half a minute");
  await sleep(300);
  check((await text(list, "me")).includes("1 new IM") && (await js(list, "document.querySelector('.pill')?.textContent")) === "1", "an unread IM shows as a count in the banner and a pill on the buddy");

  const tash = buddy("xXtashaRAWRxX"), mari = buddy("stillwaterMB");
  db.updateBuddy(tash.id, { status: "away", statusText: "brb mom needs the phone line!!", statusAt: Date.now() });
  main.broadcast("presence", { buddy: db.buddy(tash.id), from: "online" });
  db.updateBuddy(mari.id, { status: "idle", statusAt: Date.now() - 12 * 60_000 });
  main.broadcast("presence", { buddy: db.buddy(mari.id), from: "online" });
  await sleep(300);
  const rows = await js(list, "[...document.querySelectorAll('.buddy .snip')].map((e) => e.textContent).join(' | ')");
  check(/away · brb mom/.test(rows) && /idle 12m/.test(rows), `away and idle buddies say so (${rows})`);
  await snap(list, "list.png");

  const gordo = buddy("gordo_in_accounting");
  const chat = await t.open(main, "chat", { id: String(gordo.id) });
  await js(chat, "window.dispatchEvent(new Event('focus'))"); // the test windows can't take focus, so stand in for it
  await js(chat, `api.invoke("buddy:read", ${gordo.id})`);
  await sleep(300);
  check(!(await js(list, "document.querySelector('.pill')")) && !(await text(list, "me")).includes("new IM"), "opening the IM clears the count");
  chat.close();

  await t.set(list, { chat: "4" }); await sleep(300);
  check(db.settings().chattiness === 4 && /Motormouth/.test(await text(list, "chat-label")), "the Chattiness slider saves");
});
