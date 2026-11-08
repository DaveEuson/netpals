// Linking a calendar in Setup. Check it says what's wrong with a bad link, and with a good one shows what buddies are
// told. Once it's linked, buddies know your day and hold their IMs while a meeting's on; Cancel takes it back out.
// Against the fake's /calendar.ics, where a dentist appointment is on right now.
const path = require("path");
const t = require("../harness");
const { db, check, click, text, set, open, snap, until, js } = t;
const context = require(path.join(t.ROOT, "lib", "context")); // the same one the app's scheduler asks
const CAL = `${t.MODEL.replace(/\/v1\/?$/, "")}/calendar.ics`;
const main = t.start({ ...t.ACCOUNT });

t.run(async () => {
  await t.signedOn();
  const st = await open(main, "settings");
  const tryLink = async (link) => {
    await set(st, { cal: link }); await click(st, "cal-check");
    await until(async () => { const r = await text(st, "cal-result"); return r && !/^Reading/.test(r); }, 8000);
    return text(st, "cal-result");
  };
  check(/Paste your calendar/.test(await tryLink("")), "Check it with no link asks for one");
  check(/doesn't look like a calendar link/.test(await tryLink("http://example.com/cal.ics")), "a plain-http link elsewhere is refused, unread");
  check(/doesn't work any more/.test(await tryLink(CAL.replace("calendar.ics", "old.ics"))), "a dead link says to copy it again");
  check(/isn't a calendar/.test(await tryLink(CAL.replace("calendar.ics", "page.html"))), "a web page says it isn't a calendar");
  const ok = await tryLink(CAL);
  check(/^It works\. Buddies are told: ".*Right now they're in Dentist, Dr\. Ruiz until/.test(ok) && !/Cancelled/.test(ok), `a good link shows what buddies are told, without the cancelled meeting: ${ok}`);
  check(db.settings().calendarUrl === CAL && (await js(st, "document.getElementById('cal').type")) === "password", "it's saved, and hidden like a password");
  await js(st, "document.getElementById('cal').closest('fieldset').scrollIntoView()");
  await snap(st, "calendar-setup.png");

  check(/Dentist, Dr\. Ruiz/.test(await context.get()) && (await context.inMeeting()), "buddies know about the appointment, and hold their IMs during it");
  await click(st, "cancel");
  check((await until(() => !t.win("settings.html"), 3000)) && db.settings().calendarUrl === "", "Cancel takes the link back out");
  check((await context.get()) === "" && !(await context.inMeeting()), "and buddies know nothing about the day again");
});
