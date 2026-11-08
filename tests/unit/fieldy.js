// Runnable check for lib/fieldy.js:  npm test -- fieldy
// Today's conversations from Fieldy's public API (titles and summaries only, locked ones left out), markdown turned
// into plain text, what buddies are told, and plain errors. Against the fake model's stand-in for Fieldy.
const fakeModel = require("../fake-model");

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };

(async () => {
  const server = await fakeModel.start();
  process.env.NETPALS_FIELDY = `http://127.0.0.1:${server.address().port}/api/public/v2`;
  const fieldy = require("../../lib/fieldy");

  const list = await fieldy.load("sk-fieldy-good", { fresh: true });
  check(list.map((c) => c.title).join("|") === "Standup|Lunch with Sam", `today's conversations, oldest first, without the locked one (${list.map((c) => c.title)})`);
  const q = new URL(server.fieldyUrl, "http://x").searchParams, midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  check(q.get("mode") === "intersects-range" && +new Date(q.get("startTime")) === +midnight && Math.abs(new Date(q.get("endTime")) - Date.now()) < 5000,
    "it asks for everything that touched today, from this computer's midnight to now");
  check(list[1].summary.startsWith("Sam is moving to Denver in March; A long argument") && list[1].summary.length <= 161 && list[1].summary.endsWith("…"),
    `a markdown summary loses its heading and marks, and stops near 160 characters: "${list[1].summary}"`);
  const says = fieldy.say(list);
  check(/^From what they recorded today\. \d+:\d\d [AP]M, Standup: Launch slips a week\. \d+:\d\d [AP]M, Lunch with Sam: Sam is moving/.test(says) && /on\. You could ask about one\.$/.test(says),
    `buddies are told what was talked about, with times: "${says}"`);
  check(fieldy.say([]) === "", "a quiet day tells them nothing");
  check(fieldy.clean("1. **Bold** move\n2. `code` and _this_", 100) === "Bold move; code and this", "numbered lists and code marks come out too");
  check((await fieldy.me("sk-fieldy-good")).email === "pat@example.com", "Check it can say whose Fieldy it is");

  const err = (key) => fieldy.load(key, { fresh: true }).then(() => "no error", (e) => e.message);
  check(/didn't take that key/.test(await err("sk-fieldy-wrong")), "a wrong key says to copy it again");
  check(/too many requests/.test(await err("sk-fieldy-busy")), "Fieldy's rate limit says to wait a minute");
  check((await fieldy.load("")).length === 0, "no key, nothing asked");
  server.close();
  check(/Couldn't reach Fieldy/.test(await err("sk-fieldy-good")), "no answer from Fieldy says so");

  console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})();
