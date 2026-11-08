// lib/calendar.js — your calendar, read from its secret iCal link (Google, Outlook and iCloud all give one), so no
// sign-in. From Good Day Sunshine's reader, plus COUNT, moved repeats and daylight saving. Times with a TZID are read
// as this computer's time, which is right unless the calendar lives in another time zone.
const keep = require("./keep");
const DAY = 86_400_000;
const DOW = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const FRESH_MS = 15 * 60_000; // how long a fetched calendar is used before it's fetched again
const MAX_BYTES = 20e6;

function parseDate(v, params = "") {
  if (/VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(v)) return { d: new Date(+v.slice(0, 4), +v.slice(4, 6) - 1, +v.slice(6, 8)), allDay: true };
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z?)$/);
  if (!m) return null;
  const parts = [+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)];
  return { d: m[7] ? new Date(Date.UTC(...parts)) : new Date(...parts), allDay: false };
}
const unescape = (v) => v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

function parseICS(text) {
  const events = [];
  let cur = null;
  for (const line of text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/)) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") { if (cur?.start) events.push(cur); cur = null; }
    else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [key, ...p] = line.slice(0, i).split(";");
      const val = line.slice(i + 1), params = p.join(";");
      if (key === "SUMMARY") cur.title = unescape(val);
      else if (key === "UID") cur.uid = val;
      else if (key === "STATUS") cur.status = val.toUpperCase();
      else if (key === "TRANSP") cur.free = val.toUpperCase() === "TRANSPARENT"; // marked "free", not busy
      else if (key === "DTSTART") { const t = parseDate(val, params); if (t) { cur.start = t.d; cur.allDay = t.allDay; } }
      else if (key === "DTEND") cur.end = parseDate(val, params)?.d;
      else if (key === "RECURRENCE-ID") cur.moved = parseDate(val, params)?.d; // this one repeat, changed
      else if (key === "RRULE") cur.rrule = Object.fromEntries(val.split(";").map((kv) => kv.split("=")));
      else if (key === "EXDATE") (cur.exdates ??= []).push(...val.split(",").map((v) => +parseDate(v, params)?.d));
    }
  }
  return events;
}

// The local wall time `days` calendar days on, so a 9 o'clock meeting stays at 9 across a daylight-saving change.
const shift = (d, days) => { const x = new Date(d); x.setDate(x.getDate() + days); return x; };

// Every occurrence that overlaps [from, to), soonest first. DAILY and WEEKLY repeat (INTERVAL, BYDAY, UNTIL, COUNT);
// anything else counts once, on its first date.
function expand(events, from, to) {
  const moved = new Set(events.filter((e) => e.moved).map((e) => `${e.uid} ${+e.moved}`));
  const out = [];
  for (const e of events) {
    if (e.status === "CANCELLED") continue; // a cancelled repeat still takes its slot out of the series, through `moved`
    const dur = e.end ? e.end - e.start : e.allDay ? DAY : 0;
    const add = (d) => {
      if (d >= to || +d + Math.max(dur, 1) <= from || e.exdates?.includes(+d) || (e.rrule && moved.has(`${e.uid} ${+d}`))) return;
      out.push({ title: e.title || "", start: d, end: new Date(+d + dur), allDay: Boolean(e.allDay), free: Boolean(e.free) });
    };
    const r = e.rrule;
    if (!r || !["DAILY", "WEEKLY"].includes(r.FREQ)) { add(e.start); continue; }
    const u = r.UNTIL && parseDate(r.UNTIL);
    const until = u ? +u.d + (u.allDay ? DAY - 1 : 0) : Infinity, count = +r.COUNT || Infinity;
    const step = Math.max(1, +r.INTERVAL || 1) * (r.FREQ === "WEEKLY" ? 7 : 1);
    const days = r.FREQ === "WEEKLY" ? String(r.BYDAY || "").split(",").map((x) => DOW[x.slice(-2)]).filter((x) => x >= 0) : [];
    const offsets = days.length ? days.map((x) => (x - e.start.getDay() + 7) % 7).sort((a, b) => a - b) : [0];
    let n = 0;
    run: for (let i = 0; ; i += step) {
      for (const o of offsets) {
        const d = shift(e.start, i + o);
        if (d > until || d >= to || n++ >= count) break run;
        add(d);
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

// One or more links, separated by spaces, commas or new lines. https or webcal, or http on this computer.
const links = (text) => String(text || "").split(/[\s,]+/).filter(Boolean);
const okLink = (u) => /^(https|webcal):\/\/[^/\s]+/i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(u);

async function fetchOne(url) {
  if (!okLink(url)) throw new Error("That doesn't look like a calendar link. It starts with https:// or webcal://.");
  let r;
  try { r = await fetch(url.replace(/^webcal:/i, "https:"), { signal: AbortSignal.timeout(15_000) }); } catch {
    throw new Error("Couldn't reach that calendar. Check the link and your internet connection.");
  }
  if (!r.ok) throw new Error(r.status === 404 || r.status === 403 ? "That calendar link doesn't work any more. Copy it again from your calendar's settings."
    : `The calendar answered ${r.status}.`);
  if (+r.headers.get("content-length") > MAX_BYTES) throw new Error("That calendar is too big to read.");
  const text = await r.text();
  if (!/BEGIN:VCALENDAR/.test(text.slice(0, 1000))) throw new Error("That link isn't a calendar. Use the iCal (.ics) link.");
  return parseICS(text);
}

// The parsed events behind `text`, fetched at most every 15 minutes (see keep.js).
const cached = keep(FRESH_MS, (key) => Promise.all(key.split(" ").map(fetchOne)).then((lists) => lists.flat()), []);
const load = (text, opts) => cached(links(text).join(" "), opts);

// Today's events, midnight to midnight, including one that started last night and is still going.
function today(events, now) {
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  return expand(events, from, shift(from, 1));
}

// Something timed and busy is on right now.
const busyAt = (list, now) => list.some((e) => !e.allDay && !e.free && e.start <= now && now < e.end);

// What buddies are told about the day: what's over (worth asking about), what's on now, and what's next.
const clock = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function sayDay(list, now) {
  const name = (e) => e.title.replace(/[\u0000-\u001f]/g, " ").slice(0, 60) || "something";
  const timed = list.filter((e) => !e.allDay);
  const over = timed.filter((e) => e.end <= now).slice(-2), on = timed.filter((e) => e.start <= now && now < e.end);
  const later = timed.filter((e) => e.start > now).slice(0, 3), allDay = list.filter((e) => e.allDay).slice(0, 2);
  const parts = [
    allDay.length && `All day: ${allDay.map(name).join(", ")}.`,
    over.length && `Already over: ${over.map((e) => `${name(e)} at ${clock(e.start)}`).join(", ")}. You could ask how it went.`,
    on.length && `Right now they're in ${on.map((e) => `${name(e)} until ${clock(e.end)}`).join(", and ")}.`,
    later.length && `Later: ${later.map((e) => `${name(e)} at ${clock(e.start)}`).join(", ")}.`,
  ].filter(Boolean);
  return parts.length ? `From their calendar today. ${parts.join(" ")}` : "";
}

module.exports = { parseICS, expand, load, today, busyAt, sayDay, links, okLink };
