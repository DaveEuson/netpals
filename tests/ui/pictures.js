// Pictures: sending, the copy in data/files, thumbnails, refusals. With --live, whether a real model can see them.
const path = require("path");
const fs = require("fs");
const t = require("../harness");
const { db, check, skip, js, sleep, until, open, snap, buddy, ROOT } = t;
const main = t.start({ ...t.ACCOUNT });
const send = (w, id, file) => js(w, `(async () => { const r = await api.invoke("chat:sendFile", ${id}, ${JSON.stringify(file)}); sent(r); return r; })()`);
const icon = path.join(ROOT, "assets", "icon.png");

t.run(async () => {
  await t.signedOn();
  const gordo = buddy("gordo_in_accounting");
  const chat = await open(main, "chat", { id: String(gordo.id) });
  const r1 = await send(chat, gordo.id, icon);
  check(r1.ok, "a png sends");
  const mine = db.lastMessages(gordo.id, 1)[0];
  check(mine.role === "me" && /icon\.png$/.test(mine.file) && fs.existsSync(path.join(db.dir, "files", mine.file)), "it's copied into the data folder");
  check(await until(() => js(chat, "document.querySelector('.msg.me img.pic')?.naturalWidth > 0"), 3000), "and shows as a thumbnail");
  check(await until(() => db.lastMessages(gordo.id, 1)[0].role === "buddy", 10_000), "Gordon answers it");
  check((await js(chat, `api.invoke("pic:thumb", ${JSON.stringify(mine.file)})`)).startsWith("data:image/png"), "a window can ask for a thumbnail on its own");
  const r2 = await send(chat, gordo.id, path.join(ROOT, "README.md"));
  check(!r2.ok && /png or jpg/.test(r2.error), "other files are refused");
  const r3 = await send(chat, gordo.id, path.join(ROOT, "build", "sidebar.bmp"));
  check(!r3.ok && /png or jpg/.test(r3.error), "so are bmp, gif and webp, which Electron can't decode");
  const r4 = await send(chat, gordo.id, path.join(ROOT, "no-such-file.png"));
  check(!r4.ok, "a file that's gone is an error in the window, not a crash");
  chat.reload(); await sleep(800);
  check(await until(() => js(chat, "[...document.querySelectorAll('img.pic')].every((i) => i.naturalWidth > 0)"), 3000), "reopening the window brings the thumbnails back");
  await snap(chat, "pictures.png");

  if (!t.LIVE) return skip("whether a real model sees the picture (--live)");
  db.setSettings({ baseUrl: "http://localhost:11434/v1", model: "gemma3:4b" });
  const seeing = await send(chat, gordo.id, icon);
  check(seeing.ok && seeing.seen === true, "gemma3:4b is known to see pictures");
  check(await until(() => db.lastMessages(gordo.id, 1)[0].role === "buddy" && db.lastMessages(gordo.id, 2)[0].file, 120_000), `and answers about it: "${db.lastMessages(gordo.id, 1)[0].text}"`);
  db.setSettings({ model: "mistral:7b" });
  const blind = await send(chat, gordo.id, icon);
  await sleep(300);
  check(blind.ok && blind.seen === false && /can't see pictures/.test(await js(chat, "[...document.querySelectorAll('.msg.notice .text')].map((e) => e.textContent).join(' ')")), "mistral:7b is known not to, and the window says so");
});
