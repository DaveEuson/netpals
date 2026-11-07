// The tray, windows remembering their spot, auto-away, start with Windows, saving an IM, Edit…, and Lives in.
const path = require("path");
const fs = require("fs");
const { BrowserWindow } = require("electron");
const t = require("../harness");
const { db, check, js, sleep, until, click, text, value, set, open, snap, buddy, win, OUT } = t;
const main = t.start({ ...t.ACCOUNT });

t.run(async () => {
  const list = await t.signedOn();
  check(main.trayState().tray && !main.trayState().blinking, "a quiet tray icon appears once you're signed on");
  list.close(); await sleep(400);
  check(!list.isDestroyed() && !list.isVisible() && BrowserWindow.getAllWindows().length >= 1, "closing the Buddy List hides it to the tray instead of quitting");
  check(main.openWindow("list") === list && list.isVisible(), "opening it again brings the same window back");
  list.minimize(); await sleep(300);
  main.openWindow("list"); await sleep(300);
  check(!list.isMinimized(), "and un-minimizes it");
  const tash = buddy("xXtashaRAWRxX");
  db.addMessage(tash.id, "buddy", "psst, u there?");
  main.blinkTray();
  check(main.trayState().blinking, "an unread IM makes the tray blink");
  db.markRead(tash.id); main.blinkTray();
  check(!main.trayState().blinking, "reading it stops the blink");

  // windows remember where they were
  const chat = await open(main, "chat", { id: String(tash.id) });
  chat.setContentBounds({ x: 320, y: 180, width: 500, height: 520 }); await sleep(200);
  const was = chat.getContentBounds();
  chat.close(); await sleep(400);
  const saved = db.settings().bounds.chat;
  check(saved && saved.x === 320 && saved.y === 180 && saved.width === was.width && saved.height === was.height, "closing an IM window saves where it was");
  const chat2 = await open(main, "chat", { id: String(tash.id) });
  const b2 = chat2.getContentBounds();
  check(b2.x === 320 && b2.y === 180 && b2.width === saved.width && b2.height === saved.height, "the next one opens right there, the same size");
  chat2.setPosition(-3000, -3000);
  chat2.close(); await sleep(300);
  db.setSettings({ bounds: { ...db.settings().bounds, chat: { x: -9000, y: -9000, width: 500, height: 520 } } });
  const chat3 = await open(main, "chat", { id: String(tash.id) });
  check(chat3.getBounds().x > -9000, "a spot that's off every screen is ignored");
  chat3.close();

  // auto-away
  main.idleCheck(10 * 60 + 1); await sleep(300);
  check(db.settings().awayMessage === "I am away from my computer right now." && /You're away/.test(await text(list, "me")), "10 idle minutes and you're away, AIM-style");
  check(db.settings().autoAway === true, "remembering the idle timer did it, so a restart still ends it");
  main.idleCheck(5); await sleep(300);
  check(!db.settings().awayMessage && db.settings().lastAwayText === "I am away from my computer right now." && /You're online/.test(await text(list, "me")), "touching the mouse brings you back, and buddies hear about it");
  db.setSettings({ awayMessage: "lunch", awaySince: Date.now() });
  main.idleCheck(5); main.idleCheck(99_999);
  check(db.settings().awayMessage === "lunch", "an away you set yourself is left alone");
  db.setSettings({ awayMessage: "", autoAwayMinutes: 0 });
  main.idleCheck(99_999);
  check(!db.settings().awayMessage, "never means never");

  // start with Windows (in development it only saves the setting)
  const st = await open(main, "settings");
  check((await value(st, "idle")) === "0" && !(await js(st, "document.getElementById('startup').checked")), "Setup shows the auto-away pick and the startup box");
  await click(st, "startup"); await set(st, { idle: "15" }); await sleep(200);
  check(db.settings().startWithWindows === true && db.settings().autoAwayMinutes === 15, "both save");
  check(/Your IMs take [\d.]+ (KB|MB) and pictures [\d.]+ (KB|MB)\. [\d.]+ (GB|MB) free/.test(await text(st, "storage")), `Setup shows how much room Netpals takes (${await text(st, "storage")})`);
  check(main.diskCheck(500e6) === true && main.diskCheck(50e9) === false, "under 1 GB free counts as low");
  st.close(); await sleep(300);

  // save a conversation
  db.addMessage(tash.id, "me", "hey :)");
  db.addMessage(tash.id, "auto", "brb mom needs the phone");
  const logFile = path.join(OUT, "tasha.txt");
  fs.mkdirSync(OUT, { recursive: true });
  const chat4 = await open(main, "chat", { id: String(tash.id) });
  t.files.save = logFile;
  await click(chat4, "save");
  check(await until(() => fs.existsSync(logFile), 3000), "Save… writes the conversation to the file you pick");
  const lines = fs.readFileSync(logFile, "utf8").split("\r\n").filter(Boolean);
  check(lines.length === 3 && /xXtashaRAWRxX: psst, u there\?$/.test(lines[0]) && /tester: hey :\)$/.test(lines[1]) && /\(auto response\): brb/.test(lines[2]), "three stamped lines, each under the right name");
  chat4.close();

  // screen names
  const asYou = await js(list, `api.invoke("buddy:update", { id: ${tash.id}, name: "Tasha", screenName: "tester", emoji: "⚡", era: 2006, nudge: true, personaPrompt: "A hype friend." })`);
  check(asYou.ok && db.buddy(tash.id).screenName !== "tester", "a buddy can't take your screen name");
  const asGordo = await js(list, `api.invoke("buddy:update", { id: ${tash.id}, name: "Tasha", screenName: "gordo_in_accounting", emoji: "⚡", era: 2006, nudge: true, personaPrompt: "A hype friend." })`);
  check(asGordo.ok && db.buddy(tash.id).screenName !== "gordo_in_accounting", "or another buddy's");
  db.updateBuddy(tash.id, { screenName: "xXtashaRAWRxX", personaPrompt: buddy("xXtashaRAWRxX")?.personaPrompt || "A hype friend." });

  // Edit…
  const prof = await open(main, "profile", { id: String(tash.id) });
  await click(prof, "edit");
  check(await until(() => win("addbuddy.html") && !win("profile.html"), 4000), "Edit… in Buddy Info opens the form");
  const ed = win("addbuddy.html"); await t.shown(ed); await sleep(700);
  check((await value(ed, "m-name")) === "Tasha" && (await value(ed, "m-sn")) === "xXtashaRAWRxX" && (await value(ed, "m-era")) === "2006" && (await js(ed, "document.getElementById('tab-random').hidden")) && (await text(ed, "ok")) === "Save", "filled in, no Randomize tab, and the button says Save");
  check(!(await js(ed, "document.getElementById('ok').disabled")) && (await text(ed, "status")) === "", "Save works even though the free list is full");
  await set(ed, { "m-name": "Natasha", "m-persona": "A hype friend who has calmed down a little." });
  await click(ed, "ok");
  check(await until(() => db.buddy(tash.id).name === "Natasha", 3000) && /calmed down/.test(db.buddy(tash.id).personaPrompt) && db.buddy(tash.id).profile.quote === "ur top 8 or ur nothing lol", "Save changes the name and personality and keeps the profile");
  check(await until(() => !win("addbuddy.html"), 3000), "and closes the form");

  // Lives in
  const pr = await open(main, "profile", { id: String(tash.id) });
  check((await value(pr, "era")) === "2006" && (await js(pr, "document.getElementById('era').options[0].textContent")) === "Today" && /0s$/.test(await js(pr, "document.querySelector('#era optgroup').label")), "Lives in shows 2006, with Today on top and years by decade");
  await set(pr, { era: "0" }); await sleep(300);
  check(db.buddy(tash.id).era === 0 && /lives in the present/.test(await text(pr, "since")), "Today makes her a present-day buddy");
  await set(pr, { era: "1999" }); await sleep(300);
  check(db.buddy(tash.id).era === 1999 && /lives in 1999/.test(await text(pr, "since")), "and a year puts her back in it");
  await snap(pr, "profile.png");
});
