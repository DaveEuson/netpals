// lib/db.js — SQLite via better-sqlite3: settings, buddies, messages, and the three seeded buddies.
// Lives at data/netpals.db next to the app so `npm start` is the whole setup.
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

// NETPALS_DATA moves the data folder (a throwaway one for tests). Each screen name has its own folder inside it
// (lib/accounts.js); this opens the one that signed on last, and open() switches before anyone signs on.
const accounts = require("./accounts");
let db, dir, tx = {};

function open(folder) {
  if (db?.open) db.close();
  fs.mkdirSync(folder, { recursive: true });
  db = new Database(path.join(folder, "netpals.db"));
  dir = folder;
  db.pragma("journal_mode = WAL");
  migrate();
  tx = {
    setSettings: db.transaction((patch) => { const up = db.prepare(UPSERT); for (const [k, v] of Object.entries(patch)) up.run(k, JSON.stringify(v)); }),
    removeBuddy: db.transaction((id) => {
      db.prepare("DELETE FROM messages WHERE buddyId = ?").run(id);
      db.prepare("DELETE FROM buddies WHERE id = ?").run(id);
    }),
    vote: db.transaction(voteNow),
  };
  if (!db.prepare("SELECT 1 FROM buddies LIMIT 1").get()) for (const b of SEED) addBuddy(b);
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS buddies (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, screenName TEXT NOT NULL, emoji TEXT NOT NULL,
      era INTEGER NOT NULL, personaPrompt TEXT NOT NULL, cadenceWeight REAL NOT NULL DEFAULT 0.5,
      status TEXT NOT NULL DEFAULT 'online', profile TEXT NOT NULL DEFAULT '{}', notes TEXT NOT NULL DEFAULT '',
      statusText TEXT NOT NULL DEFAULT '', statusAt INTEGER NOT NULL DEFAULT 0, readAt INTEGER NOT NULL DEFAULT 0,
      nudge INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY, buddyId INTEGER NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL,
      ts INTEGER NOT NULL, feedback INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS messages_buddy ON messages (buddyId, ts);
  `);
  // Columns added after the first release, for databases made before them. Adding one that's there throws; that's fine.
  const addColumn = (table, col, then) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col}`); if (then) db.exec(then); } catch { /* already there */ }
  };
  addColumn("buddies", "statusText TEXT NOT NULL DEFAULT ''"); // presence and unread tracking
  addColumn("buddies", "statusAt INTEGER NOT NULL DEFAULT 0");
  addColumn("buddies", "readAt INTEGER NOT NULL DEFAULT 0");
  addColumn("buddies", "nudge INTEGER NOT NULL DEFAULT 0", "UPDATE buddies SET nudge = cadenceWeight >= 0.5"); // "still there?": the chattier ones
  addColumn("messages", "file TEXT NOT NULL DEFAULT ''"); // a picture you sent, in data/files
  // Buddy Chat lines live in the same table with buddyId 0, roomId 1 and fromId = the buddy who spoke (0 for you).
  addColumn("messages", "roomId INTEGER NOT NULL DEFAULT 0");
  addColumn("messages", "fromId INTEGER NOT NULL DEFAULT 0");
}

// ---- settings (JSON values; DEFAULTS is the schema) ----------------------------------------
const DEFAULTS = {
  provider: "", baseUrl: "", model: "", apiKey: "", detect: null,   // detect: { models, small } from first launch; apiKey: OpenRouter's
  claudeKey: "",                                                      // an Anthropic API key, for the Claude brain
  chattiness: 2, quietStart: 22, quietEnd: 8,
  awayMessage: "", awaySince: 0, awayUntil: 0, awayMinutes: 0,       // awayUntil: come back by itself at this time (0: when you say); awayMinutes: the last pick
  lastAwayText: "", lastAwayMinutes: 0,                               // handed to the next buddy once, then cleared
  alwaysOnTop: false, sound: true, notify: true, lastDropDay: "",     // lastDropDay: the 3x thumbs-down chattiness drop, once per day
  muteSend: false, muteReceive: false,                                // the Buddy List's two mutes: the sound when you send, and when an IM comes in
  checkUpdates: true, updateSkipped: "",                              // ask GitHub once a day for a newer version; updateSkipped: one you said Not now to
  // A Mac starts in Pinstripe, its own early-2000s look, and stays in it whatever macOS's dark mode says until you choose.
  theme: process.platform === "darwin" ? "pinstripe" : "dialup", darkWithSystem: process.platform !== "darwin",
  customTheme: null,                                                  // customTheme: { base, win, panel, ink, title, accent, them }
  screenName: "", passHash: "", age: null, gender: "", about: "",     // you: what buddies read; passHash is salt:scrypt, never the password
  savePassword: false, autoLogin: false, nudges: true, license: "",   // nudges: "still there?" check-ins; license: a Plus key
  chatRoom: null,                                                     // Buddy Chat: ids of the buddies in the room; null until it's first opened
  autoAway: false,                                                    // the away message was set by the idle timer, so a touch (even after a restart) ends it
  bounds: {}, autoAwayMinutes: 10, startWithWindows: false,           // bounds: where each kind of window was left; autoAway: 0 is never
  calendarUrl: "", weatherPlace: "", fieldyKey: "",                   // your day: a secret iCal link (or several); your town; a Fieldy API key
  quiz: {}, connected: false, modem: false,                           // quiz: setup's quick questions; connected: the first dial-up played, so Connecting offers Skip; modem: its 56k sound
  savedAways: ["out to lunch, back in a bit", "heads down till 4. send snacks", "brb", "gone for the day. the modem needs rest too"],
};
function settings() {
  const out = { ...DEFAULTS };
  for (const { key, value } of db.prepare("SELECT key, value FROM settings").all()) {
    try { out[key] = JSON.parse(value); } catch { /* a damaged value keeps its default rather than stopping the app */ }
  }
  return out;
}
const UPSERT = "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";
const setSettings = (patch) => tx.setSettings(patch);

// ---- buddies -------------------------------------------------------------------------------
const BUDDY_COLS = ["name", "screenName", "emoji", "era", "personaPrompt", "cadenceWeight", "status", "profile", "notes",
  "statusText", "statusAt", "readAt", "nudge"];
const parse = (b) => b && { ...b, profile: JSON.parse(b.profile || "{}") };
const buddies = () => db.prepare("SELECT * FROM buddies ORDER BY id").all().map(parse);
const buddy = (id) => parse(db.prepare("SELECT * FROM buddies WHERE id = ?").get(id));
function addBuddy(b) {
  const row = { cadenceWeight: 0.5, status: "online", notes: "", statusText: "", statusAt: Date.now(), readAt: 0, nudge: 0,
    ...b, profile: JSON.stringify(b.profile || {}) };
  return db.prepare(`INSERT INTO buddies (${BUDDY_COLS}) VALUES (${BUDDY_COLS.map((c) => "@" + c)})`).run(row).lastInsertRowid;
}
function updateBuddy(id, patch) {
  const keys = Object.keys(patch).filter((k) => BUDDY_COLS.includes(k));
  if (!keys.length) return;
  const row = { ...patch, id };
  if ("profile" in row) row.profile = JSON.stringify(row.profile || {});
  db.prepare(`UPDATE buddies SET ${keys.map((k) => `${k} = @${k}`).join(", ")} WHERE id = @id`).run(row);
}
const removeBuddy = (id) => tx.removeBuddy(id);

// ---- messages ------------------------------------------------------------------------------
function addMessage(buddyId, role, text, ts = Date.now(), file = "", roomId = 0, fromId = 0) {
  const id = db.prepare("INSERT INTO messages (buddyId, role, text, ts, file, roomId, fromId) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(buddyId, role, text, ts, file, roomId, fromId).lastInsertRowid;
  return { id, buddyId, role, text, ts, feedback: 0, file, roomId, fromId };
}
const addRoomMessage = (role, text, fromId = 0) => addMessage(0, role, text, Date.now(), "", 1, fromId); // role: me | buddy | sys
const roomMessages = (n = 20) => db.prepare("SELECT * FROM messages WHERE roomId = 1 ORDER BY ts DESC, id DESC LIMIT ?").all(n).reverse();
const lastMessages = (buddyId, n = 5) => db.prepare("SELECT * FROM messages WHERE buddyId = ? ORDER BY ts DESC, id DESC LIMIT ?").all(buddyId, n).reverse();
const lastMessageAt = () => db.prepare("SELECT MAX(ts) AS ts FROM messages").get().ts || 0;
const thumbsDownToday = () => db.prepare("SELECT COUNT(*) AS n FROM messages WHERE feedback = -1 AND ts >= ?").get(new Date().setHours(0, 0, 0, 0)).n;
// Unread = buddy messages newer than the last time you opened that buddy's IM window. `last` is the newest one.
const unreadCounts = () => db.prepare(`
  SELECT m.buddyId, COUNT(*) AS n, (SELECT text FROM messages WHERE buddyId = m.buddyId AND role = 'buddy' ORDER BY ts DESC LIMIT 1) AS last
  FROM messages m JOIN buddies b ON b.id = m.buddyId WHERE m.role = 'buddy' AND m.ts > b.readAt GROUP BY m.buddyId`).all();
const markRead = (buddyId) => db.prepare("UPDATE buddies SET readAt = ? WHERE id = ?").run(Date.now(), buddyId);

// ---- feedback ------------------------------------------------------------------------------
// 👍 nudges that buddy's cadence up 0.05, 👎 down 0.1; changing or taking back a vote undoes the old nudge.
// The third 👎 of a day also turns global chattiness down a notch, once per day.
// Returns { vote, cadenceWeight, chattiness } where chattiness is set only when it just dropped.
const NUDGE = { 1: 0.05, 0: 0, "-1": -0.1 };
const vote = (msgId, v) => tx.vote(msgId, v);
function voteNow(msgId, v) {
  const m = db.prepare("SELECT * FROM messages WHERE id = ?").get(msgId);
  const b = m && buddy(m.buddyId);
  if (!b || m.role !== "buddy") return null;
  v = [1, -1].includes(v) ? v : 0;
  const cadenceWeight = Math.round(Math.min(1, Math.max(0.05, b.cadenceWeight + NUDGE[v] - NUDGE[m.feedback])) * 100) / 100;
  db.prepare("UPDATE messages SET feedback = ? WHERE id = ?").run(v, msgId);
  updateBuddy(b.id, { cadenceWeight });
  const s = settings();
  const today = new Date().toDateString();
  if (v !== -1 || s.chattiness === 0 || s.lastDropDay === today || thumbsDownToday() < 3) return { vote: v, cadenceWeight };
  setSettings({ chattiness: s.chattiness - 1, lastDropDay: today });
  return { vote: v, cadenceWeight, chattiness: s.chattiness - 1 };
}

// ---- seed: a calm coach, a hype friend, a dry-witted coworker; three different eras ---------
// Profiles are invented: no real songs, people, or sites.
const SEED = [
  { name: "Marisol", screenName: "stillwaterMB", emoji: "🌊", era: 1999, cadenceWeight: 0.4,
    personaPrompt: "A calm coach. Unhurried, grounded, warm. You notice what the person is carrying and lighten it with one small reframe, never a plan. You ask at most one gentle question and you are fine with silence. 1999 texture: dial-up, Y2K jokes, mix CDs, 'that's tight', 'no worries'. Lowercase is fine. No lists, no advice-column tone, no 'you should'.",
    profile: { quote: "the tide doesn't hurry and it still gets there.", listening: "Slow Modem - 'Carrier Signal (acoustic)'", link: "http://members.tripod.com/~stillwater/tidechart.html" },
  },
  { name: "Tasha", screenName: "xXtashaRAWRxX", emoji: "⚡", era: 2006, cadenceWeight: 0.7, nudge: 1,
    personaPrompt: "A hype friend. Loud, loyal, delighted by the person's existence. You hype their tiniest win like it's a stadium show. 2006 texture: MySpace top 8, flip phones, 'omg', 'lol', 'ur', one exclamation point too many. You never nag and never give instructions; you just believe in them out loud. One question max, usually 'wait what are you up to??'.",
    profile: { quote: "ur top 8 or ur nothing lol", listening: "The Dialtones - 'Modem Heart'", link: "http://www.myspace.com/xxtasharawrxx" },
  },
  { name: "Gordon", screenName: "gordo_in_accounting", emoji: "☕", era: 2003, cadenceWeight: 0.5, nudge: 1,
    personaPrompt: "A dry-witted coworker two cubicles over. Deadpan, economical, secretly kind. You comment on the absurdity of the workday in one flat line and leave it there. 2003 texture: cubicles, the fax machine, a Blackberry that never stops, breakroom coffee, 'per my last IM'. Never cheer, never nag, never list. One question at most, and it's usually about lunch.",
    profile: { quote: "it's not a bug, it's a feature. the feature is bugs.", listening: "the HVAC, movement 3", link: "http://intranet.local/breakroom-coffee-status.htm" },
  },
];
open(accounts.abs(accounts.lastDir()));

module.exports = {
  get dir() { return dir; }, open, close: () => db.close(), settings, setSettings,
  buddies, buddy, addBuddy, updateBuddy, removeBuddy,
  addMessage, addRoomMessage, roomMessages, lastMessages, lastMessageAt, unreadCounts, markRead, vote,
};
