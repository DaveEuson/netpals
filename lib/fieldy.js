// lib/fieldy.js — what you talked about today, from Fieldy (the wearable that records your conversations), through its
// public API with a key from Developer Settings in the Fieldy app. Titles and Fieldy's own summaries only, never
// transcripts. NETPALS_FIELDY points it somewhere else (the tests use the fake model).
// API: https://api.fieldy.ai/docs (GET /user/me, GET /conversations?startTime&endTime&mode, Bearer sk-fieldy-…).
const keep = require("./keep");

const API = process.env.NETPALS_FIELDY || "https://api.fieldy.ai/api/public/v2";

async function call(key, path) {
  let r;
  try { r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) }); } catch {
    throw new Error("Couldn't reach Fieldy. Check your internet connection.");
  }
  if (r.status === 401 || r.status === 403) throw new Error("Fieldy didn't take that key. Copy it again from Developer Settings in the Fieldy app.");
  if (r.status === 429) throw new Error("Fieldy says that's too many requests. Try again in a minute.");
  if (!r.ok) throw new Error(`Fieldy answered ${r.status}.`);
  return r.json();
}

// Plain text: no headings, bullets become "; ", no markdown marks, cut at a word near `max` characters.
function clean(text, max) {
  const t = String(text || "").split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).map((l) => l.replace(/^\s*([-*+]|\d+\.)\s+/, "").trim())
    .filter(Boolean).join("; ").replace(/[*_`>|[\]]+/g, "").replace(/[\u0000-\u001f\s]+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

// Today's conversations so far, oldest first: { title, summary, start }. Ones a free Fieldy plan has locked are left out.
async function today(key, now = new Date()) {
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const q = new URLSearchParams({ startTime: from.toISOString(), endTime: now.toISOString(), mode: "intersects-range", pageSize: "50" });
  const { items } = await call(key, `/conversations?${q}`);
  return (items || []).filter((c) => c && !c.locked && (c.title || c.summary) && c.startTime && !isNaN(new Date(c.startTime)))
    .map((c) => ({ title: clean(c.title, 60), summary: clean(c.summary, 160), start: new Date(c.startTime) }))
    .sort((a, b) => a.start - b.start);
}

// Fetched at most every 10 minutes (see keep.js), and afresh each new day.
const cached = keep(10 * 60_000, (k) => today(k.slice(k.indexOf("|") + 1)), []);
const load = (key, opts) => cached(key ? `${new Date().toDateString()}|${key}` : "", opts);
const me = (key) => call(key, "/user/me"); // { email }: Check it says whose Fieldy it is

// What buddies are told: the last few conversations, with times.
const clock = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function say(list) {
  const last = list.slice(-4).map((c) => `${clock(c.start)}, ${[c.title, c.summary].filter(Boolean).join(": ")}`.replace(/[\s.;,…]+$/, ""));
  return last.length ? `From what they recorded today. ${last.join(". ")}. You could ask about one.` : "";
}

module.exports = { load, me, say, clean };
