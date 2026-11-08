// The Buddy List's two mutes: one silences the sound when you send (in an IM or Buddy Chat), the other the sound when
// buddies message you. Setup's Play sounds still turns everything off, and door sounds answer only to it.
// Each window's Audio is swapped for one that writes down what would have played.
const t = require("../harness");
const { db, check, js, sleep, until, click, open, snap, buddy } = t;
const main = t.start({ ...t.ACCOUNT, sound: true });
const ear = (w) => js(w, "window.played = []; window.Audio = function (src) { played.push(src.split('/').pop().replace('.wav', '')); return { play: () => Promise.resolve() }; }; true");
const heard = (w) => js(w, "window.played.splice(0)");
const hears = (w, name) => until(async () => (await js(w, `window.played.includes(${JSON.stringify(name)})`)), 3000);
const say = (w, line) => js(w, `document.getElementById('text').value = ${JSON.stringify(line)}; document.getElementById('send').click()`);
const pressed = (w, id) => js(w, `document.getElementById(${JSON.stringify(id)}).getAttribute('aria-pressed')`);

t.run(async () => {
  const list = await t.signedOn();
  check(await until(() => db.buddies().every((b) => b.status === "online"), 30_000), "everyone signs on");
  await ear(list);
  const gordo = buddy("gordo_in_accounting");
  const incoming = (text) => main.broadcast("message", { msg: db.addMessage(gordo.id, "buddy", text), buddy: db.buddy(gordo.id) });
  const doors = () => {
    db.updateBuddy(gordo.id, { status: "offline" }); main.broadcast("presence", { buddy: db.buddy(gordo.id), from: "online" });
    db.updateBuddy(gordo.id, { status: "online", statusAt: Date.now() }); main.broadcast("presence", { buddy: db.buddy(gordo.id), from: "offline" });
  };
  check((await pressed(list, "mute-send")) === "false" && (await pressed(list, "mute-receive")) === "false", "both mutes start off");

  const chat = await open(main, "chat", { id: String(gordo.id) });
  await ear(chat);
  await say(chat, "hey");
  check(await hears(chat, "im-send"), "sending an IM plays the send sound");
  incoming("you there?");
  check(await hears(list, "im"), "an IM coming in plays the IM sound");

  await click(list, "mute-send");
  check((await until(() => db.settings().muteSend === true, 2000)) && (await until(async () => (await pressed(list, "mute-send")) === "true", 2000)),
    "the send mute saves and shows pressed");
  check(/^Unmute the sound when you send/.test(await js(list, "document.getElementById('mute-send').title")), "and its tooltip says how to undo it");
  await snap(list, "mute.png"); // one muted, one not
  await heard(chat); await heard(list);
  await say(chat, "brb"); await sleep(800);
  check(!(await heard(chat)).includes("im-send"), "muted, sending is silent");
  incoming("k");
  check(await hears(list, "im"), "while IMs coming in still chime");

  await click(list, "mute-receive");
  check(await until(() => db.settings().muteReceive === true, 2000), "the receive mute saves");
  await sleep(200); await heard(list);
  incoming("hello??"); await sleep(400);
  check(!(await heard(list)).includes("im"), "and silences IMs coming in");
  doors(); await sleep(400);
  const both = await heard(list);
  check(both.includes("door-close") && both.includes("door-open"), `door sounds answer only to Setup (${both})`);

  const room = await open(main, "room"); await sleep(600);
  await ear(room);
  await say(room, "hi all"); await sleep(800);
  main.broadcast("room", { msg: db.addRoomMessage("buddy", "yo", gordo.id) }); await sleep(400);
  check((await heard(room)).length === 0, "Buddy Chat follows both mutes");
  await click(list, "mute-send"); await click(list, "mute-receive");
  check(await until(() => !db.settings().muteSend && !db.settings().muteReceive, 2000), "pressing them again turns both sounds back on");
  await sleep(200);
  await say(room, "ok now?");
  check(await hears(room, "im-send"), "unmuted, sending in Buddy Chat plays the send sound");
  main.broadcast("room", { msg: db.addRoomMessage("buddy", "sup", gordo.id) });
  check(await hears(room, "im"), "and a buddy's line in the room chimes");

  await js(list, "api.invoke('settings:set', { sound: false })");
  check(await until(() => db.settings().sound === false, 2000), "Play sounds goes off in Setup");
  await sleep(200);
  await Promise.all([heard(list), heard(chat), heard(room)]);
  await say(chat, "quiet now"); await say(room, "shh"); incoming("ok"); doors(); await sleep(800);
  const any = [...(await heard(list)), ...(await heard(chat)), ...(await heard(room))];
  check(any.length === 0, `with it off nothing plays, mutes or not (${any})`);
});
