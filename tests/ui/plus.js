// The free version and Netpals Plus: the 3-buddy limit, the Randomize gate, the theme gate, unlocking with a key.
const t = require("../harness");
const { db, check, skip, win, js, sleep, until, click, text, set, open, snap, buddy } = t;
require(require("path").join(t.ROOT, "lib", "license.js")).BUY_URL = "https://example.com/plus"; // as if a store existed
const main = t.start({ ...t.ACCOUNT });

async function addBuddyWindow() {
  await until(() => !win("addbuddy.html"), 5000);
  return open(main, "addbuddy");
}

t.run(async () => {
  await t.signedOn();
  let ab = await addBuddyWindow();
  check(/free version holds 3/.test(await text(ab, "status")), "with 3 buddies, Add Buddy explains the free limit");
  check((await text(ab, "tab-random")) === "Randomize · Plus" && !(await js(ab, "document.getElementById('manual').hidden")), "free opens on Build your own, with Randomize marked Plus");
  await set(ab, { "m-name": "Kev", "m-sn": "kickflip_kev01", "m-persona": "A skater kid." });
  check(await js(ab, "document.getElementById('ok').disabled"), "Add stays disabled even with the form filled");
  await snap(ab, "plus-full.png");
  ab.close();

  db.removeBuddy(buddy("gordo_in_accounting").id);
  ab = await addBuddyWindow();
  check((await text(ab, "status")) === "", "with 2 buddies there's no limit message");
  await click(ab, "tab-random"); await sleep(200);
  await click(ab, "roll");
  await until(async () => /Plus/.test(await text(ab, "status")), 5000);
  check(/Randomize comes with Netpals Plus/.test(await text(ab, "status")), "free Randomize is refused");
  await click(ab, "tab-manual"); await sleep(200);
  await set(ab, { "m-name": "Kev", "m-sn": "kickflip_kev01", "m-persona": "A skater kid." });
  await click(ab, "ok");
  check(await until(() => buddy("kickflip_kev01"), 3000), "free can still build a buddy while under 3");
  check(await until(() => buddy("kickflip_kev01")?.profile.quote, 5000), "who writes their own profile in the background");
  ab = await addBuddyWindow();
  check(/free version holds 3/.test(await text(ab, "status")), "and the list is full again at 3");
  ab.close();

  const st = await open(main, "settings");
  check(/free version/.test(await text(st, "plus-status")) && !(await js(st, "document.getElementById('plus-entry').hidden")), "Setup shows the free version and a key box");
  const themes = await js(st, "[...document.getElementById('theme').options].map((o) => o.value + (o.disabled ? ':off' : ':on')).join(' ')");
  check(themes === "dialup:on pinstripe:on olive:off silver:off midnight:on bubblegum:off custom:off", `free gets Dial-Up, Pinstripe and Midnight (${themes})`);
  check(await js(st, "document.getElementById('load-theme').disabled"), "and can't load theme files");
  check(!(await js(st, "document.getElementById('plus-buy').hidden")) && (await js(st, "document.getElementById('buy').dataset.href")) === "https://example.com/plus", "free shows the Get Netpals Plus link");
  await set(st, { license: "not-a-real-key.at-all" }); await click(st, "unlock"); await sleep(400);
  check(/doesn't check out/.test(await text(st, "plus-result")) && !db.settings().license, "a bad key is refused and not saved");

  const key = t.plusKey("Plus Test");
  if (!key) return skip("unlocking needs a real key; this machine can't sign one");
  await set(st, { license: key.replace(/(.{60})/g, "$1\n") }); await click(st, "unlock"); await sleep(400);
  check(/Unlocked/.test(await text(st, "plus-result")) && /Licensed to Plus Test/.test(await text(st, "plus-status")), "a real key, pasted with line breaks, unlocks Plus");
  check((await js(st, "document.getElementById('plus-entry').hidden")) && !(await js(st, "document.getElementById('load-theme').disabled")), "the key box hides and theme files unlock");
  check(await js(st, "[...document.getElementById('theme').options].every((o) => !o.disabled)"), "every theme unlocks");
  check(db.settings().license === key, "the key is saved without the line breaks");
  check(await js(st, "document.getElementById('plus-buy').hidden"), "the buy link goes away");
  await snap(st, "plus-unlocked.png");
  await click(st, "cancel"); await sleep(400);
  check(db.settings().license === key, "Cancel doesn't take the license back");

  ab = await addBuddyWindow();
  check((await text(ab, "tab-random")) === "Randomize" && (await text(ab, "status")) === "" && !(await js(ab, "document.getElementById('random').hidden")), "with Plus, Add Buddy opens on Randomize with no limit");
  await set(ab, { vibe: "a goth kid from 2004 who bakes elaborate cakes" });
  await click(ab, "roll");
  check(await until(() => js(ab, "!document.getElementById('card').hidden"), 10_000) && (await text(ab, "c-sn")) === "goth_baker04", "Randomize rolls a whole buddy and shows the card");
  await click(ab, "ok");
  check(await until(() => db.buddies().length === 4 && buddy("goth_baker04"), 3000), "and Plus can add a fourth");
});
