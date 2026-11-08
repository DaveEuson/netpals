// Setup's Your day: a calendar link, your town for the weather, and (with Plus) a Fieldy key. Each Check it says
// what's wrong with a bad entry, and with a good one shows what buddies are told. Once filled in, buddies know your day
// and hold their IMs while a meeting's on; Fieldy only reaches a brain on this computer; Cancel takes it all back out.
// Against the fake's /calendar.ics (a dentist appointment on right now) and its stand-ins for Open-Meteo and Fieldy.
const path = require("path");
const t = require("../harness");
const { db, check, click, text, set, open, snap, until, js } = t;
const context = require(path.join(t.ROOT, "lib", "context")); // the same one the app's scheduler asks
const CAL = `${t.MODEL.replace(/\/v1\/?$/, "")}/calendar.ics`;
const main = t.start({ ...t.ACCOUNT });

t.run(async () => {
  await t.signedOn();
  const st = await open(main, "settings");
  const tryIt = async (id, value) => {
    await set(st, { [id]: value }); await click(st, `${id}-check`);
    await until(async () => { const r = await text(st, `${id}-result`); return r && !/^Checking/.test(r); }, 8000);
    return text(st, `${id}-result`);
  };

  // ---- calendar
  check(/Paste your calendar/.test(await tryIt("cal", "")), "Check it with no link asks for one");
  check(/doesn't look like a calendar link/.test(await tryIt("cal", "http://example.com/cal.ics")), "a plain-http link elsewhere is refused, unread");
  check(/doesn't work any more/.test(await tryIt("cal", CAL.replace("calendar.ics", "old.ics"))), "a dead link says to copy it again");
  check(/isn't a calendar/.test(await tryIt("cal", CAL.replace("calendar.ics", "page.html"))), "a web page says it isn't a calendar");
  const ok = await tryIt("cal", CAL);
  check(/^It works\. Buddies are told: ".*Right now they're in Dentist, Dr\. Ruiz until/.test(ok) && !/Cancelled/.test(ok), `a good link shows what buddies are told, without the cancelled meeting: ${ok}`);
  check(db.settings().calendarUrl === CAL && (await js(st, "document.getElementById('cal').type")) === "password", "it's saved, and hidden like a password");

  // ---- weather
  check(/Type your town/.test(await tryIt("wx", "")), "the weather's Check it with no town asks for one");
  check(/Couldn't find "Nowhere"/.test(await tryIt("wx", "Nowhere")), "a town it can't find says so");
  const sky = await tryIt("wx", "Springfield, Illinois");
  check(/^It works\. Buddies are told: "Where they are \(Springfield, Illinois, US\) it's 37°F, light rain\./.test(sky), `a town shows the weather buddies are told: ${sky}`);
  check(db.settings().weatherPlace === "Springfield, Illinois", "and it's saved");

  // ---- Fieldy: Plus only, and only with a brain on this computer
  check((await js(st, "document.getElementById('fy').disabled && document.getElementById('fy-check').disabled")), "Fieldy is locked without Plus");
  check(/comes with Netpals Plus/.test((await js(st, "api.invoke('fieldy:check', 'sk-fieldy-good')")).error), "and main says so too, whatever the page does");
  const key = t.plusKey("Your Day Test");
  if (!key) t.skip("Fieldy with Plus (needs the seller's key on this machine)");
  else {
    await set(st, { license: key }); await click(st, "unlock");
    await until(() => js(st, "!document.getElementById('fy').disabled"), 3000);
    check(/didn't take that key/.test(await tryIt("fy", "sk-fieldy-wrong")), "with Plus, a wrong Fieldy key says to copy it again");
    const talk = await tryIt("fy", "sk-fieldy-good");
    check(/^Connected as pat@example\.com\. Buddies are told: "From what they recorded today\. .*Standup: Launch slips a week\. .*Lunch with Sam/.test(talk) && !/Locked one/.test(talk),
      `a good key shows whose Fieldy it is and what buddies are told: ${talk.slice(0, 140)}…`);
    check(db.settings().fieldyKey === "sk-fieldy-good" && /Lunch with Sam/.test(await context.get()), "buddies with a model on this computer hear about lunch");
    const here = db.settings().baseUrl;
    db.setSettings({ baseUrl: "https://openrouter.ai/api/v1" });
    check(!/Lunch with Sam/.test(await context.get()), "a brain marked local but still pointed at OpenRouter doesn't");
    db.setSettings({ baseUrl: here });
    db.setSettings({ provider: "openrouter" });
    check(!/Lunch with Sam/.test(await context.get()) && /Dentist/.test(await context.get()), "with OpenRouter they don't, and the rest stays");
    check(/only hear it once your brain is on this computer/.test(await tryIt("fy", "sk-fieldy-good")), "and Check it says why");
    db.setSettings({ provider: "local" });
  }
  await js(st, "document.getElementById('cal').closest('fieldset').scrollIntoView()");
  await snap(st, "your-day-setup.png");

  const day = await context.get();
  check(/Dentist, Dr\. Ruiz/.test(day) && /Springfield, Illinois/.test(day) && /now and then/.test(day) && (await context.inMeeting()),
    "buddies know about the appointment and the weather, and hold their IMs during the appointment");
  await click(st, "cancel");
  check((await until(() => !t.win("settings.html"), 3000)) && ["calendarUrl", "weatherPlace", "fieldyKey"].every((k) => db.settings()[k] === ""), "Cancel takes it all back out");
  check((await context.get()) === "" && !(await context.inMeeting()), "and buddies know nothing about the day again");
});
