// Runnable check for lib/scheduler.js:  npm run check:scheduler   (add -- --live to also ping the real model)
// 1. Simulates 400 days of 5-minute ticks per chattiness level and checks each averages its daily target.
// 2. Checks the gates (quiet hours, 20-minute gap, away) and the weighted buddy pick.
// 3. Fires against a fake model to check message cleanup, the away-message handoff, what buddies know about you,
//    and the "still there?" check-in rules.
// 4. --live: one real ping per seeded buddy from the auto-detected model, checked against the same rules.
// Runs in a throwaway data folder, so your real netpals.db is never touched.
const fs = require("fs");
const os = require("os");
const path = require("path");
process.env.NETPALS_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "netpals-check-"));

const db = require("../lib/db");
const llm = require("../lib/llm");
const { createScheduler, inQuiet, fireChance, canPing, pickBuddy, TARGET, TICK_MS, GAP_MS } = require("../lib/scheduler");

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };
const at = (h, m = 0, dayOffset = 1) => { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return d; };
const sentences = (t) => (t.match(/[\s\S]*?(?:[.!?…]+["')\]]*(?=\s|$)|$)/g) || []).filter((x) => x.trim()).length;
const questions = (t) => (t.match(/\?+/g) || []).length;

(async () => {
  // 1. A simulated day hits each level's target.
  const base = { provider: "x", awayMessage: "", quietStart: 22, quietEnd: 8 };
  for (let level = 1; level <= 4; level++) {
    const s = { ...base, chattiness: level };
    const p = fireChance(level, 22, 8);
    let fires = 0;
    const DAYS = 400;
    for (let d = 0; d < DAYS; d++) {
      let last = -Infinity;
      for (let t = at(0, 0, d).getTime(); t < at(0, 0, d + 1).getTime(); t += TICK_MS) {
        if (canPing(s, new Date(t), last) && Math.random() < p) { fires++; last = t; }
      }
    }
    const avg = fires / DAYS;
    check(Math.abs(avg - TARGET[level]) / TARGET[level] < 0.12, `chattiness ${level}: ${avg.toFixed(1)} pings/day, target ${TARGET[level]} (p=${p.toFixed(3)} per tick)`);
  }
  check(fireChance(0, 22, 8) === 0, "chattiness 0 never fires");

  // 2. Gates and pick.
  const s = { ...base, chattiness: 4 };
  check(inQuiet(at(23), 22, 8) && inQuiet(at(7, 59), 22, 8) && !inQuiet(at(8), 22, 8) && !inQuiet(at(21, 59), 22, 8), "quiet hours 10pm-8am wrap past midnight");
  check(!canPing(s, at(23), 0), "no pings in quiet hours");
  check(!canPing(s, at(14), at(14).getTime() - GAP_MS + 60_000) && canPing(s, at(14), at(14).getTime() - GAP_MS), "20-minute gap holds, then releases");
  check(!canPing({ ...s, awayMessage: "lunch" }, at(14), 0), "no pings while you're away");
  const pool = [{ status: "online", cadenceWeight: 0.8 }, { status: "idle", cadenceWeight: 0.2 }, { status: "away", cadenceWeight: 1 }, { status: "offline", cadenceWeight: 1 }];
  const tally = [0, 0, 0, 0];
  for (let i = 0; i < 20_000; i++) tally[pool.indexOf(pickBuddy(pool))]++;
  check(tally[2] === 0 && tally[3] === 0 && Math.abs(tally[0] / 20_000 - 0.8) < 0.02, `pick follows cadenceWeight and skips away/offline (${tally.join("/")})`);

  // 3. Fake model: messy output is cleaned to the rules; the away message reaches the next buddy once.
  let lastSystem = "";
  const fake = async ({ system }) => { lastSystem = system; return 'gordo_in_accounting: "hey! did you eat lunch? are you drinking water? here\'s a plan:\n1. eat\n2. sleep"'; };
  const sched = createScheduler({ chat: fake });
  const gordo = db.buddies().find((b) => b.screenName === "gordo_in_accounting");
  db.setSettings({ provider: "local", chattiness: 4 });
  sched.setAway("out to lunch");
  check(db.settings().awayMessage === "out to lunch", "away message saved");
  sched.setAway("");
  check(db.settings().lastAwayText === "out to lunch" && !db.settings().awayMessage, "coming back hands the away message on");
  let backs = 0;
  const timed = createScheduler({ chat: fake, onBack: () => backs++ });
  timed.setAway("coffee", 0.002); // about a tenth of a second
  check(db.settings().awayMessage === "coffee" && db.settings().awayUntil > Date.now(), "a come-back time is saved with the away message");
  await new Promise((r) => setTimeout(r, 300));
  check(!db.settings().awayMessage && db.settings().awayUntil === 0 && db.settings().lastAwayText === "coffee" && backs === 1, "the timer brings you back and tells the windows");
  timed.setAway("still here", 0);
  check(db.settings().awayMessage === "still here" && db.settings().awayUntil === 0, "no limit means no timer");
  timed.setAway("");
  db.setSettings({ lastAwayText: "out to lunch", lastAwayMinutes: 1 }); // the hand-off the prompt check below reads
  const msg = await sched.fire(gordo, at(14, 5));
  check(msg?.text === "hey! did you eat lunch?", `cleanup keeps 1-2 sentences, 1 question, no list or name prefix -> "${msg?.text}"`);
  check(prompts().cleanMessage("omg hiii 🎉🔥 u there?? i miss u!!", gordo) === "omg hiii u there??", "emoji stripped, emoticon-free text kept, stops at the question");
  check(prompts().cleanMessage("Hey! 👋🏼 Just saw you online!", gordo) === "Hey! Just saw you online!", "skin-tone leftovers go with the emoji");
  const zoomer = { ...gordo, era: 2019 };
  check(prompts().cleanMessage("omg hiii 🎉 u there??", zoomer) === "omg hiii 🎉 u there??" && /emoji or two/.test(prompts().buddySystem(zoomer, {})) && /No emoji/.test(prompts().buddySystem(gordo, {})), "a 2019 buddy keeps emoji and is told they're fine; 2003 Gordon isn't");
  check(prompts().cleanAway('"Out gettin snacks!! back soon? 🍕"') === "Out gettin snacks!!", "away line: one sentence, no quotes or emoji");
  check(lastSystem.includes('"out to lunch"') && lastSystem.includes("2003") && lastSystem.includes("nothing specific yet"), "prompt carries away text, era and the context line");
  check(db.settings().lastAwayText === "", "away handoff is used once");
  await sched.fire(gordo, at(14, 30));
  check(!lastSystem.includes("out to lunch") && lastSystem.includes("hey! did you eat lunch?"), "next prompt drops the away note and shows the thread");
  const seen = new Set();
  const drifter = createScheduler({ chat: async () => "gone fishin, brb", onPresence: (b) => seen.add(b.status) });
  for (let i = 0; i < 60; i++) await drifter.drift(at(14));
  check(seen.size >= 3, `presence drifts between states (${[...seen].join(", ")})`);

  // 3a. You: the prompt carries what you told setup; without a gender, buddies are told not to guess one.
  const you = { screenName: "dialtone_dave", age: 41, gender: "", about: "makes synth music, owns too many cables" };
  const sys = prompts().buddySystem(gordo, { you, recent: [] });
  check(!sys.includes("dialtone_dave") && sys.includes("41 years old") && sys.includes("too many cables") && sys.includes("don't know their gender"), "prompt carries your age and about (not your screen name); no gender guessing");
  check(!prompts().buddySystem(gordo, { you: { ...you, gender: "man" } }).includes("don't know their gender"), "a gender you give replaces the don't-guess rule");

  // 3b. "Still there?": one check-in after an unanswered IM, only from buddies who are the type, never twice in a row.
  let asked = "";
  const nudger = createScheduler({ chat: async ({ messages }) => { asked = messages[0].content; return "helloooo, earth to you :P"; } });
  const tasha = db.buddies().find((b) => b.screenName === "xXtashaRAWRxX");
  const mari = db.buddies().find((b) => b.screenName === "stillwaterMB");
  db.setSettings({ chattiness: 2, nudges: true, awayMessage: "" });
  for (const b of [tasha, mari]) db.updateBuddy(b.id, { status: "online" });
  db.addMessage(tasha.id, "me", "hey");
  const t0 = db.addMessage(tasha.id, "buddy", "omg guess what");
  const n1 = await nudger.checkIn(tasha.id, t0.id, at(14, 6));
  check(n1?.text === "helloooo, earth to you :P" && /haven't answered/.test(asked), `unanswered IM gets a check-in: "${n1?.text}"`);
  check((await nudger.checkIn(tasha.id, n1.id, at(14, 12))) === null, "never a second check-in in a row");
  db.addMessage(tasha.id, "me", "sorry, back");
  const t2 = db.addMessage(tasha.id, "buddy", "yay");
  db.addMessage(tasha.id, "me", "so anyway");
  check((await nudger.checkIn(tasha.id, t2.id, at(14, 20))) === null, "no check-in once you've answered");
  const t3 = db.addMessage(tasha.id, "buddy", "ok real question");
  const m0 = db.addMessage(mari.id, "buddy", "how's the afternoon?");
  check((await nudger.checkIn(mari.id, m0.id, at(14, 26))) === null, "a buddy who gives you space doesn't check in");
  db.setSettings({ nudges: false });
  check((await nudger.checkIn(tasha.id, t3.id, at(14, 30))) === null, "the global switch turns check-ins off");
  db.setSettings({ nudges: true, awayMessage: "lunch" });
  check((await nudger.checkIn(tasha.id, t3.id, at(14, 30))) === null, "no check-ins while you're away");
  db.setSettings({ awayMessage: "" });
  check((await nudger.checkIn(tasha.id, t3.id, at(23, 30))) === null, "no check-ins in quiet hours");
  check((await nudger.checkIn(tasha.id, t3.id, at(14, 30)))?.text === "helloooo, earth to you :P", "same IM, all clear: the check-in goes");

  // 3c. Feedback: thumbs nudge cadence, votes can be changed or taken back, the third 👎 of a day drops chattiness once.
  const tash = db.buddies().find((b) => b.screenName === "xXtashaRAWRxX");
  const ids = [1, 2, 3, 4].map((i) => db.addMessage(tash.id, "buddy", `ping ${i}`).id);
  const w0 = db.buddy(tash.id).cadenceWeight;
  const w = () => db.buddy(tash.id).cadenceWeight;
  db.vote(ids[0], 1);
  check(Math.abs(w() - (w0 + 0.05)) < 1e-9, `👍 nudges cadence up 0.05 (${w0} -> ${w()})`);
  db.vote(ids[0], 0);
  check(Math.abs(w() - w0) < 1e-9, "taking the 👍 back undoes it");
  db.vote(ids[0], -1);
  check(Math.abs(w() - (w0 - 0.1)) < 1e-9, `👎 nudges cadence down 0.1 (-> ${w()})`);
  db.vote(ids[0], 1);
  check(Math.abs(w() - (w0 + 0.05)) < 1e-9, "switching 👎 to 👍 swaps the nudge");
  check(db.vote(db.addMessage(tash.id, "me", "hi").id, 1) === null, "your own messages can't be voted on");
  db.setSettings({ chattiness: 4, lastDropDay: "" });
  const r2 = db.vote(ids[1], -1), r3 = db.vote(ids[2], -1);
  check(r2.chattiness === undefined && r3.chattiness === undefined && db.settings().chattiness === 4, "two 👎 today: chattiness stays");
  const r4 = db.vote(ids[3], -1);
  check(r4.chattiness === 3 && db.settings().chattiness === 3, "third 👎 today turns chattiness down a notch");
  db.vote(ids[0], -1);
  check(db.settings().chattiness === 3, "a fourth 👎 the same day doesn't drop it again");
  for (let i = 0; i < 20; i++) db.vote(db.addMessage(tash.id, "buddy", "x").id, -1);
  check(w() === 0.05, `cadence never drops below 0.05 (${w()})`);

  // 4. Live model.
  if (process.argv.includes("--live")) {
    const cfg = await llm.detect();
    if (cfg.provider === "openrouter") cfg.apiKey = process.env.OPENROUTER_API_KEY || "";
    console.log(`\nlive: ${cfg.provider} ${cfg.model}`);
    const live = createScheduler({ chat: (o) => llm.chat(o, cfg) });
    for (const b of db.buddies()) {
      db.updateBuddy(b.id, { status: "online" });
      const t0 = Date.now();
      const m = await live.fire(db.buddy(b.id), at(15, 20));
      const text = m?.text ?? "(no message)";
      console.log(`  ${b.emoji} ${b.screenName} (${b.era}, ${Date.now() - t0} ms): ${text}`);
      check(m && sentences(text) <= 2 && questions(text) <= 1, `${b.screenName}: 1-2 sentences, at most 1 question`);
    }
    const away = prompts().cleanAway(await llm.chat({ ...prompts().awayMessage(db.buddies()[1]), maxTokens: 40 }, cfg));
    console.log(`  away message sample: ${away}`);
    check(away && away.length <= 61 && !away.includes("?"), "away message: short statement, no question");
  }

  console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

function prompts() { return require("../lib/prompts"); }
