// The IM window: a reply with typing, an away buddy's auto response, smileys and emoticon faces, thumbs up and down.
const t = require("../harness");
const { db, check, js, sleep, until, click, text, open, snap, buddy } = t;
const main = t.start({ ...t.ACCOUNT, chattiness: 2 });

t.run(async () => {
  const list = await t.signedOn();
  await until(() => db.buddies().every((b) => b.status === "online"), 30_000);
  const gordo = buddy("gordo_in_accounting"), tash = buddy("xXtashaRAWRxX");

  const chat = await open(main, "chat", { id: String(gordo.id) });
  let typed = false;
  const poll = setInterval(async () => { try { if (/typing/.test(await text(chat, "typing"))) typed = true; } catch { /* closed */ } }, 100);
  await js(chat, "document.getElementById('text').value = 'ugh, deadline at 4'; document.getElementById('send').click()");
  check(await until(() => db.lastMessages(gordo.id, 1)[0]?.role === "buddy", 10_000), "Gordon answers");
  clearInterval(poll);
  check(typed, "with a typing line while he does");
  check((await js(chat, "[...document.querySelectorAll('.msg.buddy .text')].pop()?.textContent")) === "hey 🙂 long day?", "his reply shows, with :) drawn as a face");
  check(db.lastMessages(gordo.id, 1)[0].text === "hey :) long day?", "while the stored text keeps the emoticon");

  // smileys
  await click(chat, "smile"); await sleep(150);
  check((await js(chat, "document.getElementById('picker').children.length")) === 32, "the smiley button opens a 32-emoji picker");
  await js(chat, "document.getElementById('text').value = 'ok'; document.getElementById('text').setSelectionRange(2, 2); document.getElementById('picker').children[2].click()");
  check((await js(chat, "document.getElementById('text').value")) === "ok🙂" && (await js(chat, "document.getElementById('picker').hidden")), "picking one drops it in at the cursor and closes the picker");
  await snap(chat, "chat.png");

  // thumbs: three down in a day turns chattiness down a notch
  for (const line of ["the fax machine is haunted.", "meeting about meetings at 3.", "someone microwaved fish again."]) db.addMessage(gordo.id, "buddy", line);
  main.broadcast("buddies");
  chat.reload(); await sleep(800);
  const n = await js(chat, "document.querySelectorAll('.thumbs').length");
  check(n === db.lastMessages(gordo.id, 50).filter((m) => m.role === "buddy").length, "thumbs on every buddy message, none on yours");
  for (let i = 1; i <= 3; i++) { await js(chat, `[...document.querySelectorAll('.thumbs .down')].at(-${i}).click()`); await sleep(250); }
  check(db.settings().chattiness === 1 && /Quiet/.test(await js(chat, "document.querySelector('.msg.notice .text')?.textContent || ''")), "the third 👎 of the day turns Chattiness down and says so");
  check((await text(list, "chat-label")).startsWith("Quiet"), "and the Buddy List's slider follows");
  const before = db.buddy(gordo.id).cadenceWeight;
  await js(chat, "[...document.querySelectorAll('.thumbs .up')].at(-1).click()"); await sleep(300);
  check(db.buddy(gordo.id).cadenceWeight > before && (await js(chat, "[...document.querySelectorAll('.thumbs')].at(-1).querySelector('.up').getAttribute('aria-pressed')")) === "true", "switching a vote to 👍 moves his cadence back up");

  // an away buddy bounces her away message first
  db.updateBuddy(tash.id, { status: "away", statusText: "brb mom needs the phone line!!" });
  const chat2 = await open(main, "chat", { id: String(tash.id) });
  await js(chat2, "document.getElementById('text').value = 'you there?'; document.getElementById('send').click()");
  check(await until(() => js(chat2, "document.querySelector('.msg.auto .text')?.textContent === 'brb mom needs the phone line!!'"), 3000), "an away buddy's auto response comes first");
  check(await until(() => db.buddy(tash.id).status === "online" && db.lastMessages(tash.id, 1)[0].role === "buddy", 10_000), "then she comes back and answers");
  await snap(chat2, "chat-away.png");
});
