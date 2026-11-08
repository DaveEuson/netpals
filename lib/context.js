// lib/context.js — what buddies know about your day, for every buddy prompt, and whether now's a bad time to IM you.
// Each source is off until you fill it in, in Setup's Your day: your calendar (a secret iCal link) and the weather
// where you are. get() is a plain phrase or "", and lands in the prompt as "What you know about their day: <this>".
// A source that can't be reached just says nothing.
const db = require("./db");
const calendar = require("./calendar");
const weather = require("./weather");

const quietly = (p, fallback) => p.catch((e) => { console.warn(`[context] ${e.message}`); return fallback; });
const todays = async (now, s = db.settings()) => (s.calendarUrl ? calendar.today(await quietly(calendar.load(s.calendarUrl), []), now) : []);

async function get(now = new Date()) {
  const s = db.settings();
  const [day, sky] = await Promise.all([todays(now, s), s.weatherPlace ? quietly(weather.load(s.weatherPlace), null) : null]);
  const parts = [calendar.sayDay(day, now), weather.say(sky)].filter(Boolean);
  return parts.length ? `${parts.join(" ")} Bring it up now and then, not every time.` : "";
}

module.exports = {
  get,
  inMeeting: async (now = new Date()) => calendar.busyAt(await todays(now), now), // buddies don't IM you first then
};
