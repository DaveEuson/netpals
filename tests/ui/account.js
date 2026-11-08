// Your account, across launches. PHASE (set by tests/run.js) picks the launch; the data folder carries over:
//   setup → signon → auto → reset (started with --reset-password, the way the Start menu shortcut does it)
const t = require("../harness");
const { db, check, skip, win, js, sleep, until, click, text, value, vis, set, open, snap, buddy } = t;
const PHASE = process.env.PHASE;
const main = t.start(PHASE === "setup" ? { theme: process.env.THEME || "dialup" } : {});

t.run(async () => {
  await until(() => win("welcome.html") || win("signon.html") || win("connect.html"), 15_000);
  await sleep(800);

  if (PHASE === "setup") {
    const w = win("welcome.html");
    check((await vis(w, "y-sn")) && !(await vis(w, "model")), "setup opens on the screen-name step");
    check((await text(w, "go")) === "Next" && !(await vis(w, "back")), "button says Next, no Back yet");
    await snap(w, "setup-you.png");
    await click(w, "signon"); await sleep(300);
    check(/screen name is 3 to 16/.test(await text(w, "status")), "an empty screen name is refused");
    await set(w, { "y-sn": "dialtone dave", "y-pw": "secret1", "y-pw2": "secret2" });
    await click(w, "signon"); await sleep(300);
    check(/don't match/.test(await text(w, "status")), "mismatched passwords are refused");
    await set(w, { "y-pw2": "secret1", "y-age": "9" });
    await click(w, "signon"); await sleep(300);
    check(/13 to 120/.test(await text(w, "status")), "age 9 is refused");
    await set(w, { "y-age": "41", "y-gender": "Man", "y-about": "makes synth music, owns too many cables", "y-sn": "xXtashaRAWRxX" });
    await click(w, "signon"); await sleep(300);
    check(/already has that screen name/.test(await text(w, "status")), "a buddy's screen name can't be yours");
    await set(w, { "y-sn": "dialtone dave" });
    await click(w, "signon"); await sleep(400);
    const s = db.settings();
    check(s.screenName === "dialtone dave" && s.age === 41 && s.gender === "Man" && s.about.includes("cables"), "Next saves screen name, age, gender, about");
    check(/^[0-9a-f]{32}:[0-9a-f]{64}$/.test(s.passHash) && !JSON.stringify(s).includes("secret1"), "the password is stored only as a salt:scrypt hash");
    check(!(await vis(w, "model")) && (await vis(w, "q-work")) && (await text(w, "go")) === "Next" && (await vis(w, "back")), "then five quick questions, still Next, with Back");
    await set(w, { "q-work": "fixing printers", "q-into": "synths and cables", "q-bug": "finishing the album" });
    await snap(w, "setup-quiz.png");
    await click(w, "signon"); await sleep(400);
    const quiz = db.settings().quiz;
    check(quiz.work === "fixing printers" && quiz.bug === "finishing the album" && quiz.peeve === "", "Next saves the answers; blanks stay blank");
    check((await vis(w, "model")) && (await text(w, "go")) === "Next" && (await vis(w, "back")) && (await text(w, "step-count")) === "Step 3 of 5", "then the brain step, step 3 of 5");
    check(/Turing/.test(await text(w, "expect")), "the brain step says what a local model is like");
    check(await until(async () => /answers an IM in about 2 seconds/.test(await text(w, "machine-text")), 5000), "and how fast this computer answers with it");
    await snap(w, "setup-brain.png");
    await click(w, "signon");
    check(await until(() => vis(w, "cal"), 5000), "Next says hi to the brain, then asks about your day");
    await click(w, "signon");
    check(await until(() => vis(w, "t-chat"), 3000) && (await text(w, "go")) === "Sign On", "then how it feels, with Sign On");
    await set(w, { "t-chat": "3" }); await sleep(200);
    check(db.settings().chattiness === 3, "choices there save as they change");
    await snap(w, "setup-touches.png");
    await click(w, "signon");
    check(await until(() => win("list.html"), 30_000), "Sign On dials up and opens the Buddy List");
    const list = win("list.html");
    check((await text(list, "title")) === "dialtone dave's Buddy List", "the list is titled with your screen name");
    check(await until(() => !win("welcome.html"), 3000), "and setup closes");

    const tash = buddy("xXtashaRAWRxX");
    db.addMessage(tash.id, "me", "hey tasha");
    const chat = await open(main, "chat", { id: String(tash.id) });
    check((await js(chat, "[...document.querySelectorAll('.msg.me .head b')].pop()?.textContent")) === "dialtone dave", "your IMs are signed with your screen name");
    chat.close();

    const st = await open(main, "settings");
    check((await value(st, "y-sn")) === "dialtone dave" && (await value(st, "y-about")).includes("cables"), "Setup's You section is filled in");
    check((await js(st, "document.getElementById('nudges').checked")) && !(await js(st, "document.getElementById('autologin').checked")), "check-ins on and auto-login off by default");
    const hash0 = db.settings().passHash;
    await set(st, { "y-about": "synths, cables, cats" }); await sleep(300);
    check(db.settings().about === "synths, cables, cats" && /Saved/.test(await text(st, "you-result")), "editing About saves at once");
    await set(st, { "q-peeve": "slow walkers" }); await sleep(300);
    check(db.settings().quiz.peeve === "slow walkers" && (await value(st, "q-into")) === "synths and cables", "Setup shows the quiz answers and saves a change");
    await set(st, { "y-pw": "newpass" }); await sleep(300);
    check(/again under Confirm/.test(await text(st, "you-result")) && db.settings().passHash === hash0, "a new password waits for Confirm");
    await set(st, { "y-pw2": "newpass" }); await sleep(300);
    check(db.settings().passHash !== hash0 && /new password/.test(await text(st, "you-result")), "and is saved once confirmed");
    await set(st, { nudges: false }); await sleep(200);
    check(db.settings().nudges === false, "the global check-in switch saves");
    await click(st, "cancel"); await sleep(600);
    const s2 = db.settings();
    check(s2.passHash === hash0 && s2.about.includes("too many cables") && s2.nudges === true, "Cancel puts the password, About and the switch back");

    const mari = buddy("stillwaterMB");
    const pr = await open(main, "profile", { id: String(mari.id) });
    check(!(await js(pr, "document.getElementById('nudge').checked")), "Marisol gives you space by default");
    await set(pr, { nudge: true }); await sleep(300);
    check(db.buddy(mari.id).nudge === 1, "Buddy Info's switch turns her check-ins on");
    await set(pr, { nudge: false }); await sleep(300);
    pr.close();

    const key = t.plusKey("Account Test");
    if (!key) skip("a fourth buddy needs a Plus key; this machine can't sign one");
    else {
      db.setSettings({ license: key });
      const ab = await open(main, "addbuddy");
      await click(ab, "tab-manual"); await sleep(200);
      await set(ab, { "m-name": "Kev", "m-sn": "kickflip_kev01", "m-persona": "A skater kid who can't sit still.", "m-nudge": true });
      await click(ab, "ok");
      check(await until(() => buddy("kickflip_kev01")?.nudge === 1, 3000), "Add Buddy's check-in switch is saved on the new buddy");
    }
  }

  if (PHASE === "signon") {
    const w = win("signon.html");
    check(Boolean(w) && !win("list.html") && !win("welcome.html"), "the second launch opens Sign On, not the list");
    check(await until(async () => (await js(w, "document.getElementById('sn').selectedOptions[0]?.textContent")) === "dialtone dave", 3000), "with your screen name picked");
    await snap(w, "signon.png");
    const still = JSON.stringify(db.buddies().map((b) => [b.status, b.statusAt]));
    await sleep(2500);
    check(JSON.stringify(db.buddies().map((b) => [b.status, b.statusAt])) === still, "buddies don't move while you're still at Sign On");
    await set(w, { pw: "nope" }); await click(w, "signon"); await sleep(600);
    check(/doesn't match/.test(await text(w, "status")) && !win("list.html"), "a wrong password is refused");
    await click(w, "forgot"); await sleep(200);
    check(await vis(w, "forgot-hint"), "Forgot password? shows the reset command");
    await set(w, { pw: "secret1", auto: true }); await sleep(100);
    check(await js(w, "document.getElementById('save').checked"), "ticking Auto-login ticks Save password");
    await click(w, "signon");
    check(await until(() => win("connect.html") && !win("signon.html"), 5000), "the right password opens Connecting and closes Sign On");
    check(await until(() => win("list.html") && !win("connect.html"), 15_000), "then the dial-up finishes and the list opens");
    check(db.settings().savePassword && db.settings().autoLogin, "Save password and Auto-login are remembered");
    check(await until(() => db.buddies().some((b) => b.status === "online"), 25_000), "and buddies sign on after you do");
  }

  if (PHASE === "auto") {
    check(Boolean(win("connect.html")) && !win("signon.html"), "auto-login skips Sign On and dials straight away");
    check(await until(() => win("list.html"), 15_000), "then the list opens");
  }

  if (PHASE === "reset") {
    const w = win("welcome.html");
    check(Boolean(w) && !win("signon.html") && !db.settings().passHash && !db.settings().autoLogin, "--reset-password clears the password and opens setup");
    check((await value(w, "y-sn")) === "dialtone dave", "with your screen name kept");
    check(db.buddies().length >= 3, "and your buddies kept");
  }
});
