// What a page can't do: leave its own page, open windows, write files where it likes, or set what only main sets.
const path = require("path");
const fs = require("fs");
const { BrowserWindow } = require("electron");
const t = require("../harness");
const { db, check, js, sleep, open, buddy } = t;
const main = t.start({ ...t.ACCOUNT });

t.run(async () => {
  const list = await t.signedOn();
  // A file dropped outside an IM window is a navigation to that file. An HTML one would have kept the api bridge.
  const dropped = path.join(process.env.NETPALS_DATA, "dropped.html");
  fs.writeFileSync(dropped, "<!doctype html><title>dropped</title>");
  await js(list, `location.href = ${JSON.stringify("file:///" + dropped.replace(/\\/g, "/"))}`).catch(() => {});
  await sleep(1000);
  check(list.webContents.getURL().endsWith("list.html"), "a file dropped on the Buddy List can't replace it");
  await js(list, "location.href = 'https://example.com'").catch(() => {});
  await sleep(500);
  check(list.webContents.getURL().endsWith("list.html"), "neither can a link out");

  const before = BrowserWindow.getAllWindows().length;
  await js(list, "void window.open('about:blank')");
  await sleep(500);
  check(BrowserWindow.getAllWindows().length === before, "window.open opens nothing");

  const tash = buddy("xXtashaRAWRxX");
  db.addMessage(tash.id, "me", "hello");
  const chat = await open(main, "chat", { id: String(tash.id) });
  const target = path.join(process.env.NETPALS_DATA, "chosen-by-a-page.txt");
  t.files.save = null; // the save dialog is canceled
  const saved = await js(chat, `api.invoke("chat:save", ${tash.id}, ${JSON.stringify(target)})`);
  check(saved === false && !fs.existsSync(target), "a page can't choose where a conversation is saved");

  const hash = db.settings().passHash;
  await js(chat, `api.invoke("settings:set", { license: "made-up", connected: false, awayMessage: "hacked", theme: "midnight" })`);
  const s = db.settings();
  check(s.license === "" && s.connected === true && s.awayMessage === "" && s.theme === "midnight" && s.passHash === hash,
    "settings:set ignores what only main sets, and still saves the rest");
});
