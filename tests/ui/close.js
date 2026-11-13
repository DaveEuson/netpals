// The Buddy List's X asks: keep Netpals running in the tray, quit, or cancel; Don't ask again remembers the answer, and
// Setup changes it back. The question is answered by a stand-in for Electron's dialog, and quitting by one for app.quit.
const { app, dialog } = require("electron");
const t = require("../harness");
const { db, check, js, sleep, until, click, open, snap } = t;
const main = t.start({ ...t.ACCOUNT, closeList: "ask" });

const asked = [];
let answer = { response: 0, checkboxChecked: false };
dialog.showMessageBox = async (_w, opts) => { asked.push(opts); return answer; };
let quit = 0;
app.quit = () => { quit++; };
const closeList = async (list) => { list.close(); await sleep(300); };

t.run(async () => {
  const list = await t.signedOn();

  answer = { response: 2, checkboxChecked: true };
  await closeList(list);
  const q = asked[0];
  check(asked.length === 1 && q.message === "Keep Netpals running?" && /buddies can still IM you/.test(q.detail), "the X asks whether to keep Netpals running");
  check(q.buttons[0] === "Keep running in the tray" && q.buttons[1] === "Quit Netpals" && q.buttons[2] === "Cancel" && q.cancelId === 2 && /Don't ask again/.test(q.checkboxLabel),
    "with Keep running in the tray, Quit Netpals, Cancel and Don't ask again");
  check(list.isVisible() && db.settings().closeList === "ask" && !quit, "Cancel leaves the Buddy List open, and doesn't remember anything");

  answer = { response: 0, checkboxChecked: false };
  await closeList(list);
  check(!list.isDestroyed() && !list.isVisible() && db.settings().closeList === "ask" && !quit, "Keep running hides it to the tray, and asks again next time");
  main.openWindow("list"); await sleep(300);
  check(list.isVisible(), "the tray brings it back");

  answer = { response: 0, checkboxChecked: true };
  await closeList(list);
  check(!list.isVisible() && db.settings().closeList === "tray", "with Don't ask again, Keep running is remembered");
  main.openWindow("list"); await sleep(300);
  await closeList(list);
  check(asked.length === 3 && !list.isVisible(), "and the X just hides it from then on, without asking");
  main.openWindow("list"); await sleep(300);

  const st = await open(main, "settings");
  check((await js(st, "document.getElementById('close-list').value")) === "tray", "Setup shows what closing the Buddy List does");
  await js(st, "document.getElementById('close-list').scrollIntoView({ block: 'center' })");
  await snap(st, "close-setting.png");
  await t.set(st, { "close-list": "ask" }); await sleep(300);
  check(db.settings().closeList === "ask", "and changes it back to asking");
  st.close(); await sleep(300);

  answer = { response: 1, checkboxChecked: false };
  await closeList(list);
  check(quit === 1 && asked.length === 4 && db.settings().closeList === "ask", "Quit Netpals quits");
});
