// lib/scheduler.js — decides when a buddy IMs you, and keeps buddies drifting online/idle/away/offline for flavor.
// Every 5 minutes it rolls dice. Chattiness 0-4 sets a daily target; quiet hours, a 20-minute gap since the last
// message, and your away message all hold pings back. The decision helpers are pure so the check can simulate a day.
const db = require("./db");
const context = require("./context");
const prompts = require("./prompts");

const TICK_MS = 5 * 60_000;
const GAP_MS = 20 * 60_000;
const TARGET = [0, 2, 5, 10, 20]; // pings per day, by chattiness
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

const inQuiet = (date, start, end) => { const h = date.getHours(); return start === end ? false : start > end ? h >= start || h < end : h >= start && h < end; };
const activeHours = (start, end) => 24 - ((end - start + 24) % 24);

// Per-tick chance that makes a day average TARGET pings. After each ping the gap blocks the next few ticks,
// so those are taken out of the ticks available.
function fireChance(chattiness, start, end) {
  const target = TARGET[chattiness] || 0;
  if (!target) return 0;
  const ticks = (activeHours(start, end) * 60 * 60_000) / TICK_MS;
  const blocked = target * (GAP_MS / TICK_MS - 1);
  return Math.min(1, target / Math.max(ticks - blocked, 1));
}

const canPing = (s, now, lastAt) =>
  Boolean(s.provider) && !s.awayMessage && TARGET[s.chattiness] > 0 && !inQuiet(now, s.quietStart, s.quietEnd) && now - lastAt >= GAP_MS;

// Weighted by cadenceWeight; away and offline buddies don't start conversations.
function pickBuddy(buddies, rand = Math.random) {
  const pool = buddies.filter((b) => b.status === "online" || b.status === "idle");
  let r = rand() * pool.reduce((n, b) => n + b.cadenceWeight, 0);
  for (const b of pool) if ((r -= b.cadenceWeight) < 0) return b;
  return null;
}

// Presence drift: where a buddy can go next, with odds. Whatever's left over means "stay put".
const DRIFT = {
  online: [["idle", 0.35], ["away", 0.3], ["offline", 0.15]],
  idle: [["online", 0.6], ["away", 0.2], ["offline", 0.2]],
  away: [["online", 0.7], ["offline", 0.3]],
  offline: [["online", 1]],
};

// chat({system, messages, maxTokens}) -> text. The on* callbacks tell windows: a message, a presence change,
// a buddy starting or stopping "typing", or a buddy who couldn't answer.
// picture(file) -> a data URL the model can look at, or null when it can't see pictures.
function createScheduler({ chat, picture = async () => null, onMessage = () => {}, onPresence = () => {}, onTyping = () => {}, onError = () => {}, onBack = () => {},
  onRoom = () => {}, onRoomTyping = () => {}, rand = Math.random }) {
  let busy = false;

  function setStatus(buddy, status, statusText = "") {
    const patch = { status, statusText, statusAt: Date.now() };
    db.updateBuddy(buddy.id, patch);
    onPresence({ ...buddy, ...patch }, buddy.status);
  }

  // One buddy says one thing: a ping out of the blue, or a reply to what you just sent. "Typing" shows while the
  // model works, and for at least as long as typing it would take. Uses the away handoff once; keeps a memory note.
  // nudge: minutes you've left their last IM unanswered, for a "still there?" follow-up.
  async function speak(buddy, { now = new Date(), reply = false, nudge = 0 } = {}) {
    const started = Date.now();
    busy = true; onTyping(buddy.id, true);
    try {
      const s = db.settings();
      const away = s.lastAwayText ? { text: s.lastAwayText, minutes: s.lastAwayMinutes } : null;
      const thread = db.lastMessages(buddy.id, reply ? 14 : 5).filter((m) => m.role !== "auto");
      let k = thread.length;
      if (reply) while (k > 0 && thread[k - 1].role === "me") k--; // your unanswered lines are what they answer
      const said = thread.slice(k).map((m) => m.text).filter(Boolean).join("\n");
      const pictures = thread.slice(k).filter((m) => m.file);
      if (reply && !said && !pictures.length) return null;
      const urls = (await Promise.all(pictures.map((m) => picture(m.file)))).filter(Boolean);
      const system = prompts.buddySystem(buddy, { now, recent: thread.slice(0, k), context: await context.get(), you: s, away, reply });
      const raw = await chat({ system, messages: [{ role: "user", content: reply ? prompts.saidWith(said, pictures, urls) : nudge ? prompts.nudge(buddy, nudge) : prompts.ping(buddy) }] });
      const text = prompts.cleanMessage(raw, buddy);
      if (!text) return null;
      if (away) db.setSettings({ lastAwayText: "", lastAwayMinutes: 0 });
      if (buddy.status !== "online") setStatus(buddy, "online");
      await sleep(Math.min(4000, 1200 + text.length * 25) - (Date.now() - started));
      const msg = db.addMessage(buddy.id, "buddy", text);
      onMessage(msg, db.buddy(buddy.id));
      if (!nudge) setTimeout(() => checkIn(buddy.id, msg.id), (4 + rand() * 3) * 60_000).unref?.();
      // Memory, after the message is out so it never slows it: the note the reply carried, or, for models that
      // never write one, a second small call when you said enough to be worth it.
      const note = reply && (prompts.extractNote(raw) || (prompts.worthNoting(said) ? prompts.cleanNote(await chat(prompts.memoryPrompt(said)).catch(() => "")) : ""));
      if (note) db.updateBuddy(buddy.id, { notes: prompts.appendNote(db.buddy(buddy.id)?.notes || "", note) });
      return msg;
    } catch (e) {
      console.warn(`[scheduler] ${buddy.screenName} couldn't ${reply ? "reply" : "send"}: ${e.message}`);
      onError(buddy, e);
      return null;
    } finally { onTyping(buddy.id, false); busy = false; }
  }
  const fire = (buddy, now) => speak(buddy, { now });

  // Left them hanging 4 to 7 minutes? A buddy who's the type (and only if you allow it) checks in once: never after
  // two of their own IMs in a row. Away, quiet hours and chattiness Off keep them quiet.
  function checkIn(id, msgId, now = new Date()) {
    const s = db.settings(), b = db.buddy(id), recent = db.lastMessages(id, 2), last = recent.at(-1); // recent: oldest first
    if (busy || !s.nudges || !b?.nudge || s.awayMessage || !s.chattiness || inQuiet(now, s.quietStart, s.quietEnd)) return null;
    if (last?.id !== msgId || recent.at(-2)?.role === "buddy" || !["online", "idle"].includes(b.status)) return null; // you answered, they sent two, or wandered off
    return speak(b, { now, nudge: Math.max(1, Math.round((now - last.ts) / 60_000)) });
  }

  // You IMed them. An away buddy's away message bounces back first, AIM-style; then they come back and answer.
  function reply(id) {
    const buddy = db.buddy(id);
    if (!buddy) return null;
    if (buddy.status === "away") onMessage(db.addMessage(id, "auto", buddy.statusText || "be right back"), buddy);
    return speak(buddy, { reply: true });
  }

  async function tick(now = new Date()) {
    const s = db.settings();
    if (busy || !canPing(s, now, db.lastMessageAt()) || rand() >= fireChance(s.chattiness, s.quietStart, s.quietEnd)) return null;
    const buddy = pickBuddy(db.buddies(), rand);
    return buddy ? fire(buddy, now) : null;
  }

  async function drift(now = new Date()) {
    const s = db.settings(), list = db.buddies();
    if (!list.length || inQuiet(now, s.quietStart, s.quietEnd)) return;
    const b = list[Math.floor(rand() * list.length)];
    let r = rand();
    const next = (DRIFT[b.status] || DRIFT.offline).find(([, p]) => (r -= p) < 0)?.[0];
    if (!next) return;
    const away = next === "away" && prompts.cleanAway(await chat({ ...prompts.awayMessage(b), maxTokens: 40 }).catch(() => ""));
    setStatus(b, next, next === "away" ? away || "be right back" : "");
  }

  // ---- Buddy Chat: one room. After your line, one to three members who are around answer in turn, then maybe one
  // riffs on the last buddy line. A line sent mid-chain gets its own round once this one is through.
  async function roomSpeak(buddy, riff = null) {
    const started = Date.now();
    busy = true; onRoomTyping(buddy, true);
    try {
      const s = db.settings(), members = db.buddies().filter((b) => (s.chatRoom || []).includes(b.id)), recent = db.roomMessages(24), last = recent.at(-1);
      const system = prompts.roomSystem(buddy, { now: new Date(), members, recent, you: s, riff });
      const speaker = !last ? "" : last.role === "me" ? "the host" : last.role === "sys" ? "*" : members.find((b) => b.id === last.fromId)?.screenName || "someone";
      const raw = await chat({ system, messages: [{ role: "user", content: last ? `${speaker}: ${last.text}` : "(say hi to the room)" }] });
      const text = prompts.cleanMessage(raw, buddy);
      if (!text) return null;
      if (buddy.status !== "online") setStatus(buddy, "online");
      await sleep(Math.min(4000, 1200 + text.length * 25) - (Date.now() - started));
      const msg = db.addRoomMessage("buddy", text, buddy.id);
      onRoom(msg, db.buddy(buddy.id));
      return msg;
    } catch (e) { onError(buddy, e); return null; } finally { onRoomTyping(buddy, false); busy = false; }
  }
  let roomBusy = false, roomAgain = false;
  async function roomReply() {
    if (roomBusy) { roomAgain = true; return 0; }
    roomBusy = true;
    try {
      const s = db.settings();
      const present = db.buddies().filter((b) => (s.chatRoom || []).includes(b.id) && ["online", "idle"].includes(b.status)).sort(() => rand() - 0.5);
      const order = present.filter((_, i) => i === 0 || rand() < 0.45).slice(0, 3);
      for (const b of order) await roomSpeak(b);
      const last = db.roomMessages(1)[0], riffers = present.filter((b) => b.id !== last?.fromId);
      if (last?.role === "buddy" && riffers.length && rand() < 0.5) await roomSpeak(riffers[Math.floor(rand() * riffers.length)], last);
      return order.length;
    } finally { roomBusy = false; if (roomAgain) { roomAgain = false; roomReply(); } }
  }

  // Away on: pings pause. Away off: the message and how long you were gone go to the next buddy who IMs you.
  // With a come-back time, a timer brings you back on its own (onBack tells the windows); a restart re-arms it.
  let backTimer;
  const armBack = (until) => { clearTimeout(backTimer); if (until) backTimer = setTimeout(() => { setAway(""); onBack(); }, Math.max(0, until - Date.now())); };
  function setAway(text, minutes = 0) {
    const s = db.settings();
    const away = String(text || "").trim().slice(0, 200);
    const awayUntil = away && minutes > 0 ? Date.now() + minutes * 60_000 : 0;
    armBack(awayUntil);
    if (away) db.setSettings({ awayMessage: away, awaySince: Date.now(), awayUntil });
    else if (s.awayMessage) db.setSettings({ awayMessage: "", awayUntil: 0, lastAwayText: s.awayMessage, lastAwayMinutes: Math.round((Date.now() - s.awaySince) / 60_000) });
  }

  // Everyone signs on a few seconds apart (door sounds), then the dice and the drift start.
  function start() {
    const s = db.settings();
    if (s.awayMessage) armBack(s.awayUntil);
    for (const b of db.buddies()) {
      db.updateBuddy(b.id, { status: "offline", statusText: "", statusAt: Date.now() });
      setTimeout(() => { const cur = db.buddy(b.id); if (cur) setStatus(cur, "online"); }, 1500 + rand() * 20_000);
    }
    setInterval(() => tick(), TICK_MS);
    const loop = () => setTimeout(() => { drift().finally(loop); }, (4 + rand() * 8) * 60_000);
    loop();
  }

  return { start, tick, fire, reply, drift, setAway, checkIn, roomReply };
}

module.exports = { createScheduler, inQuiet, fireChance, canPing, pickBuddy, TARGET, TICK_MS, GAP_MS };
