// The README's pictures, taken from the real app with a staged conversation:  npm test -- screenshots
// Writes docs/images/{hero,connect,room,themes,mac}.png. Every buddy and line here is made up.
const path = require("path");
const fs = require("fs");
const { BrowserWindow } = require("electron");
const t = require("../harness");
const { db, js, sleep, until, buddy, open, ROOT } = t;
const OUT = path.join(ROOT, "docs", "images");
const main = t.start({ ...t.ACCOUNT, screenName: "modem_kid", theme: "dialup", chattiness: 2, autoAwayMinutes: 0 });

// Two extra buddies so the list looks lived in.
db.addBuddy({ name: "Rae", screenName: "goth_baker04", emoji: "🎂", era: 2004, personaPrompt: "A goth kid who bakes elaborate cakes.",
  profile: { quote: "black frosting is a lifestyle", listening: "The Dusk Ovens - 'Proofing'", link: "http://goth-bakes.tripod.com" } });
db.addBuddy({ name: "Dai", screenName: "skate_or_dai", emoji: "🛹", era: 2001, personaPrompt: "A skater kid who can't sit still.", profile: { quote: "the board knows." } });
const ago = (minutes) => Date.now() - minutes * 60_000;
const gordo = buddy("gordo_in_accounting");
[["buddy", "per my last IM, the breakroom coffee has achieved sentience.", 4],
  ["me", "lol is it friendly", 3],
  ["buddy", "it filed a complaint about the creamer :)", 3],
  ["me", "honestly valid", 2],
  ["buddy", "lunch at 12:30? the taco place got a fax machine. we should see it.", 1]]
  .forEach(([role, text, minutes]) => db.addMessage(gordo.id, role, text, ago(minutes)));

// One page, laid out on a made-up desktop, captured as a single picture. Shots are scaled back to CSS pixels.
async function compose(name, width, height, shots, background = "linear-gradient(160deg, #4f8fd8 0%, #2c63b0 55%, #1d4a8f 100%)") {
  const imgs = shots.map(({ png, x, y }) => `<img src="data:image/png;base64,${png.toString("base64")}" style="position:absolute;left:${x}px;top:${y}px;` +
    "box-shadow:0 10px 28px rgba(0,0,0,.35);border-radius:4px 4px 0 0\" onload=\"this.style.width = this.naturalWidth / devicePixelRatio + 'px'\">").join("");
  const w = new BrowserWindow({ width, height, show: false, frame: false, useContentSize: true });
  await w.loadURL(`data:text/html,${encodeURIComponent(`<body style="margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${background}">${imgs}</body>`)}`);
  await sleep(600);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), (await w.capturePage()).toPNG());
  w.destroy();
  console.log(`wrote docs/images/${name}`);
}
const shot = async (w) => { await sleep(400); return (await w.capturePage()).toPNG(); };

t.run(async () => {
  const list = await t.signedOn();
  await until(() => db.buddies().every((b) => b.status === "online"), 30_000);
  const tash = buddy("xXtashaRAWRxX"), mari = buddy("stillwaterMB"), dai = buddy("skate_or_dai");
  db.updateBuddy(tash.id, { status: "away", statusText: "brb mom needs the phone line!!" });
  db.updateBuddy(mari.id, { status: "idle", statusAt: Date.now() - 12 * 60_000 });
  db.updateBuddy(dai.id, { status: "offline" });
  db.markRead(gordo.id);
  list.reload(); // forgets who "just signed on", so the list shows profile quotes
  await sleep(1200);

  // the hero: the Buddy List and an IM, Gordon typing
  const chat = await open(main, "chat", { id: String(gordo.id) });
  main.broadcast("typing", { id: gordo.id, on: true });
  await compose("hero.png", 820, 640, [{ png: await shot(list), x: 40, y: 36 }, { png: await shot(chat), x: 320, y: 120 }]);
  chat.close();

  // Connecting, mid-dial
  const c = await open(main, "connect");
  await until(async () => /56,000/.test(await t.text(c, "step")), 4000);
  await compose("connect.png", 460, 330, [{ png: await shot(c), x: 50, y: 40 }]);
  await t.click(c, "skip");

  // Buddy Chat
  db.updateBuddy(tash.id, { status: "online" }); db.updateBuddy(mari.id, { status: "online" });
  const members = [tash.id, gordo.id, mari.id];
  db.setSettings({ chatRoom: members });
  members.forEach((id) => db.addRoomMessage("sys", `${db.buddy(id).screenName} has entered the room.`, id));
  [["me", "ok who's watching the game tonight", 0], ["buddy", "OMG me!!! i made a SIGN :)", tash.id],
    ["buddy", "i'll be watching the fax machine. it's more predictable.", gordo.id],
    ["buddy", "no worries, i'll bring snacks. slow tide, good game.", mari.id],
    ["buddy", "gordo ur such a grandpa lol", tash.id]].forEach(([role, text, from]) => db.addRoomMessage(role, text, from));
  const room = await open(main, "room");
  await sleep(500);
  await compose("room.png", 620, 560, [{ png: await shot(room), x: 50, y: 40 }]);
  room.close();

  // three themes
  const shots = [];
  for (const theme of ["dialup", "midnight", "bubblegum"]) {
    main.broadcast("settings", { ...db.settings(), theme, darkWithSystem: false });
    await sleep(500);
    shots.push(await shot(list));
  }
  await compose("themes.png", 900, 640, shots.map((png, i) => ({ png, x: 40 + i * 290, y: 36 })));

  // the Mac's own look: the Buddy List and an IM in Pinstripe
  db.setSettings({ theme: "pinstripe" });
  main.broadcast("settings", db.settings());
  await sleep(500);
  const macChat = await open(main, "chat", { id: String(gordo.id) });
  main.broadcast("typing", { id: gordo.id, on: true });
  await compose("mac.png", 820, 640, [{ png: await shot(list), x: 40, y: 36 }, { png: await shot(macChat), x: 320, y: 120 }],
    "linear-gradient(170deg, #6c8fc7 0%, #3e65a8 50%, #27467f 100%)");
});
