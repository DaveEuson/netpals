// lib/context.js — what buddies know about your day, for every buddy prompt, and whether now's a bad time to IM you.
// Today that's your calendar (Setup's Calendar, a secret iCal link). Fieldy summaries could plug in here later.
// get() is a plain phrase or "", and lands in the prompt as "What you know about their day: <this>".
const db = require("./db");
const calendar = require("./calendar");

const todays = async (now) => {
  const link = db.settings().calendarUrl;
  if (!link) return [];
  try { return calendar.today(await calendar.load(link), now); } catch (e) { console.warn(`[calendar] ${e.message}`); return []; }
};

module.exports = {
  get: async (now = new Date()) => calendar.sayDay(await todays(now), now),
  inMeeting: async (now = new Date()) => calendar.busyAt(await todays(now), now), // buddies don't IM you first then
};
