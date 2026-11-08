// lib/context.js — what buddies know about your day, for every buddy prompt, and whether now's a bad time to IM you.
// Each source is off until you fill it in, in Setup's Your day: your calendar (a secret iCal link), the weather where
// you are, and, with Netpals Plus and a model on this computer, what you talked about today from Fieldy.
// get() is a plain phrase or "", and lands in the prompt as "What you know about their day: <this>".
// A source that can't be reached just says nothing.
const db = require("./db");
const license = require("./license");
const calendar = require("./calendar");
const weather = require("./weather");
const fieldy = require("./fieldy");

const quietly = (p, fallback) => p.catch((e) => { console.warn(`[context] ${e.message}`); return fallback; });
const todays = async (now, s = db.settings()) => (s.calendarUrl ? calendar.today(await quietly(calendar.load(s.calendarUrl), []), now) : []);
// Recordings hold other people's words, so they never leave this computer: only a local brain hears them.
const fieldyOn = (s) => Boolean(s.fieldyKey && s.provider === "local" && license.verify(s.license));

async function get(now = new Date()) {
  const s = db.settings();
  const [day, sky, talk] = await Promise.all([todays(now, s), s.weatherPlace ? quietly(weather.load(s.weatherPlace), null) : null,
    fieldyOn(s) ? quietly(fieldy.load(s.fieldyKey), []) : []]);
  const parts = [calendar.sayDay(day, now), weather.say(sky), fieldy.say(talk)].filter(Boolean);
  return parts.length ? `${parts.join(" ")} Bring it up now and then, not every time.` : "";
}

module.exports = {
  get,
  inMeeting: async (now = new Date()) => calendar.busyAt(await todays(now), now), // buddies don't IM you first then
};
