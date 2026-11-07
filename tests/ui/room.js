// Buddy Chat: who's in the room, nobody around, buddies answering in turn, leaving, and staying out of IMs.
const t = require("../harness");
const { db, check, js, sleep, until, click, text, open, snap, buddy, win } = t;
const main = t.start({ ...t.ACCOUNT });
const sysLines = (w) => js(w, "[...document.querySelectorAll('.msg.sys .text')].map((e) => e.textContent)");
const say = (w, line) => js(w, `document.getElementById('text').value = ${JSON.stringify(line)}; document.getElementById('send').click()`);
const tick = (w, on) => js(w, `for (const box of document.querySelectorAll('#members input')) { box.checked = ${on}; box.dispatchEvent(new Event('change')); }`);

t.run(async () => {
  const list = await t.signedOn();
  check(await until(() => db.buddies().every((b) => b.status === "online"), 30_000), "everyone signs on");
  await click(list, "chat");
  check(await until(() => win("room.html"), 5000), "the Chat button opens Buddy Chat");
  let room = win("room.html"); await t.shown(room); await sleep(900);
  check((await js(room, "[...document.querySelectorAll('#members input')].filter((i) => i.checked).length")) === 3, "the first time, everyone who's around is in");
  check((await sysLines(room)).filter((l) => /entered the room/.test(l)).length === 3 && db.settings().chatRoom.length === 3, "with three 'has entered the room' lines");

  for (const b of db.buddies()) db.updateBuddy(b.id, { status: "away" });
  await say(room, "anyone here?");
  check(await until(async () => /Nobody in the room is around/.test((await sysLines(room)).at(-1)), 3000) && db.roomMessages(1)[0].role === "me", "with everyone away, the room says nobody's around");
  for (const b of db.buddies()) db.updateBuddy(b.id, { status: "online" });

  let typed = false;
  const poll = setInterval(async () => { try { if (/is typing/.test(await text(room, "typing"))) typed = true; } catch { /* closed */ } }, 100);
  await say(room, "hey everyone, whats everybody up to tonight?");
  check(await until(() => db.roomMessages(10).some((m) => m.role === "buddy"), 15_000), "a buddy answers");
  await sleep(6000); // the rest of the round
  clearInterval(poll);
  const lines = db.roomMessages(20).filter((m) => m.role === "buddy");
  check(typed, "with a typing line while they write");
  check(lines.length >= 1 && lines.length <= 4 && lines.every((m) => db.buddy(m.fromId)), `one to three answer, maybe one riffs (${lines.length})`);
  check((await js(room, "document.querySelectorAll('.msg.buddy').length")) === lines.length, "each shows under its buddy's name");
  await snap(room, "room.png");

  await tick(room, false); await sleep(600);
  room.close(); await until(() => !win("room.html"), 3000);
  room = await open(main, "room"); await sleep(400);
  check(db.settings().chatRoom.length === 0 && (await js(room, "[...document.querySelectorAll('#members input')].filter((i) => i.checked).length")) === 0, "a room you emptied stays empty when reopened");
  await tick(room, true); await sleep(600);
  const gordo = buddy("gordo_in_accounting");
  await js(room, `const box = [...document.querySelectorAll('#members input')][${db.buddies().findIndex((b) => b.id === gordo.id)}]; box.checked = false; box.dispatchEvent(new Event('change'))`);
  await sleep(400);
  check(!db.settings().chatRoom.includes(gordo.id) && /gordo_in_accounting has left the room/.test((await sysLines(room)).at(-1)), "unticking a buddy shows them the door");

  const dm = await open(main, "chat", { id: String(buddy("xXtashaRAWRxX").id) });
  check((await js(dm, "document.querySelectorAll('.msg').length")) === 0, "room lines stay out of one-on-one IMs");
});
