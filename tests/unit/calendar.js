// Runnable check for lib/calendar.js:  npm test -- calendar
// Reading iCal text (repeats, skipped and moved repeats, cancelled ones, all-day, "free"), what buddies are told, and
// fetching a link (only https, webcal or this computer; at most every 15 minutes; plain errors) against a tiny server.
const http = require("http");
const cal = require("../../lib/calendar");

let failed = 0;
const check = (ok, label) => { console.log(`${ok ? "PASS" : "FAIL"}  ${label}`); if (!ok) failed++; };
const ics = (...events) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flatMap((e) => ["BEGIN:VEVENT", ...e, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
const day = (y, m, d) => new Date(y, m - 1, d);
const march = (events) => cal.expand(cal.parseICS(ics(...events)), day(2026, 3, 1), day(2026, 4, 1));
const dates = (list) => list.map((e) => `${e.start.getDate()}@${e.start.getHours()}`).join(" ");

(async () => {
  // ---- reading
  const [lunch] = cal.parseICS(ics(["SUMMARY:Lunch with Sam\\, Al", "DTSTART:20260302T120000", "DTEND:20260302T130000"]));
  check(lunch.title === "Lunch with Sam, Al" && lunch.start.getHours() === 12 && lunch.end - lunch.start === 3_600_000, "a plain event: escaped comma, start and end");
  check(cal.parseICS(ics(["SUMMARY:Long ti", " tle", "DTSTART:20260302T150000"]))[0].title === "Long title", "a folded line is put back together");
  const utc = cal.parseICS(ics(["SUMMARY:x", "DTSTART:20260302T150000Z"]))[0];
  check(+utc.start === Date.UTC(2026, 2, 2, 15), "a time ending in Z is UTC");

  // ---- repeats. The first two Mondays of March 2026 straddle the US daylight-saving change (March 8).
  const weekly = march([["UID:w", "SUMMARY:Gym", "DTSTART;TZID=America/Chicago:20260302T090000", "DTEND;TZID=America/Chicago:20260302T100000", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=4"]]);
  check(dates(weekly) === "2@9 4@9 6@9 9@9", `weekly on Mon, Wed, Fri, four times, still at 9 after the clocks change (${dates(weekly)})`);
  const daily = march([["UID:d", "SUMMARY:Standup", "DTSTART:20260301T090000", "DTEND:20260301T091500", "RRULE:FREQ=DAILY;UNTIL=20260306", "EXDATE:20260303T090000"],
    ["UID:d", "SUMMARY:Standup, late", "RECURRENCE-ID:20260304T090000", "DTSTART:20260304T110000", "DTEND:20260304T111500"],
    ["UID:d", "SUMMARY:Standup", "RECURRENCE-ID:20260305T090000", "DTSTART:20260305T090000", "STATUS:CANCELLED"]]);
  check(dates(daily) === "1@9 2@9 4@11 6@9", `daily until the 6th (that day too), less a skipped day, a moved one and a cancelled one (${dates(daily)})`);
  check(daily.find((e) => e.start.getDate() === 4).title === "Standup, late", "the moved one keeps its new name");
  const every2 = march([["SUMMARY:Book club", "DTSTART:20260303T190000", "RRULE:FREQ=WEEKLY;INTERVAL=2"]]);
  check(dates(every2) === "3@19 17@19 31@19", `every other week (${dates(every2)})`);
  const old = march([["SUMMARY:Since forever", "DTSTART:20150301T080000", "DTEND:20150301T083000", "RRULE:FREQ=DAILY"]]);
  check(old.length === 31, `a daily event from 2015 shows up every day in March 2026 (${old.length})`);
  const odd = march([["SUMMARY:a", "DTSTART:20260302T090000", "RRULE:FREQ=WEEKLY;INTERVAL=-1;BYDAY=XX"], ["SUMMARY:b", "DTSTART:20260310T090000", "RRULE:FREQ=MONTHLY"]]);
  check(dates(odd) === "2@9 9@9 10@9 16@9 23@9 30@9", `nonsense in a rule doesn't hang it, and a monthly one counts once (${dates(odd)})`);

  // ---- today, busy and what buddies are told
  const now = new Date(2026, 2, 10, 14, 30);
  const list = cal.parseICS(ics(
    ["SUMMARY:Late call", "DTSTART:20260309T230000", "DTEND:20260310T003000"],
    ["SUMMARY:Standup", "DTSTART:20260310T090000", "DTEND:20260310T091500"],
    ["SUMMARY:Dentist", "DTSTART:20260310T140000", "DTEND:20260310T150000"],
    ["SUMMARY:Dinner\\nwith Sam", "DTSTART:20260310T190000", "DTEND:20260310T210000"],
    ["SUMMARY:Mom's birthday", "DTSTART;VALUE=DATE:20260310", "DTEND;VALUE=DATE:20260311"],
    ["SUMMARY:Focus time", "DTSTART:20260310T160000", "DTEND:20260310T170000", "TRANSP:TRANSPARENT"],
    ["SUMMARY:Tomorrow", "DTSTART:20260311T090000"]));
  const today = cal.today(list, now);
  check(today.map((e) => e.title).join("|") === "Late call|Mom's birthday|Standup|Dentist|Focus time|Dinner with Sam", `today runs midnight to midnight, with last night's call that ran past it (${today.map((e) => e.title)})`);
  check(cal.busyAt(today, now) && !cal.busyAt(today, new Date(2026, 2, 10, 16, 30)) && !cal.busyAt(today, new Date(2026, 2, 10, 12)), "busy in the dentist's chair, not in time marked free, not over lunch with only an all-day event");
  const says = cal.sayDay(today, now);
  check(/^From their calendar today\./.test(says) && /All day: Mom's birthday\./.test(says) && /Already over: Late call at .+, Standup at 9:00/.test(says)
    && /Right now they're in Dentist until 3:00/.test(says) && /Later: Focus time at 4:00.+, Dinner with Sam at 7:00/.test(says) && /now and then/.test(says), `buddies are told what's over, on and next: "${says}"`);
  check(cal.sayDay([], now) === "", "an empty day tells them nothing");
  const weird = cal.sayDay([{ title: `x\u0007${"y".repeat(100)}`, start: day(2026, 3, 10), end: day(2026, 3, 11), allDay: true }], now);
  check(/All day: x y{58}\./.test(weird), "event names lose control characters and stop at 60 characters");

  // ---- links
  check(["https://calendar.google.com/x/basic.ics", "webcal://p01.icloud.com/x", "http://127.0.0.1:5000/x.ics", "http://localhost/x"].every(cal.okLink), "https, webcal and this computer are fine");
  check(!["http://example.com/x.ics", "file:///C:/x.ics", "javascript:alert(1)", "ftp://x/y", "https://"].some(cal.okLink), "plain http elsewhere, files and scripts aren't");
  check(cal.links(" https://a/x.ics,\nhttps://b/y.ics  ").length === 2, "more than one link, by commas, spaces or lines");

  let hits = 0;
  const server = http.createServer((req, res) => {
    hits++;
    if (req.url === "/cal.ics") { res.writeHead(200); return res.end(ics(["SUMMARY:Dentist", "DTSTART:20260310T140000", "DTEND:20260310T150000"])); }
    if (req.url === "/page") { res.writeHead(200); return res.end("<!doctype html><p>hello"); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const first = await cal.load(`${base}/cal.ics`);
  await cal.load(`${base}/cal.ics`);
  check(first.length === 1 && first[0].title === "Dentist" && hits === 1, "a link is read once, then kept for a while");
  await cal.load(`${base}/cal.ics`, { fresh: true });
  check(hits === 2, "Check it reads it again");
  const err = (p) => cal.load(p, { fresh: true }).then(() => "no error", (e) => e.message);
  check(/doesn't work any more/.test(await err(`${base}/gone.ics`)), "a link that's gone says so");
  check(/isn't a calendar/.test(await err(`${base}/page`)), "a page that isn't a calendar says so");
  check(/doesn't look like a calendar link/.test(await err("http://example.com/cal.ics")), "a link it won't read says so, without reading it");
  check(/Couldn't reach/.test(await err("http://127.0.0.1:1/cal.ics")), "a calendar that doesn't answer says so");
  hits = 0;
  check((await cal.load(`${base}/gone.ics`).catch(() => "threw")) === "threw" && (await cal.load(`${base}/gone.ics`)).length === 0 && hits === 1, "a broken link isn't fetched again for a while");
  server.close();

  console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})();
