// list.js — the Buddy List: groups, presence, unread counts, door and IM sounds and their two mutes, chattiness, away.
// This window lives for the whole session, so it plays the door and incoming-IM sounds (the IM and Buddy Chat windows
// play the one for sending). All buddy text goes in via textContent.
// `api` is the global from preload.js (contextBridge makes it non-configurable, so it can't be redeclared).
const LABELS = ["Off · nobody pings", "Quiet · about 2 a day", "Chatty · about 5 a day", "Gabby · about 10 a day", "Motormouth · about 20 a day"];
const RANK = { online: 0, idle: 1, away: 2, offline: 3 };
const CHEVRON = '<svg width="9" height="9" viewBox="0 0 9 9" aria-hidden="true"><path d="M1 2.5l3.5 4 3.5-4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';

let s = api.settingsSync();
let buddies = [];
let unread = {}; // buddyId -> { n, last }
const signedOnAt = {}; // buddyId -> ms, for the bold "just signed on" minute
const open = { on: true, off: false };

const sound = (name) => chime(name, s);
// The two mutes beside your status: [button, setting, what it silences].
const MUTES = [["mute-send", "muteSend", "the sound when you send"], ["mute-receive", "muteReceive", "the sound when buddies message you"]];
const minsAgo = (t) => Math.max(1, Math.round((Date.now() - t) / 60_000));
const fresh = (b) => Date.now() - (signedOnAt[b.id] || 0) < 60_000;
const byStatusThenName = (a, b) => RANK[a.status] - RANK[b.status] || a.screenName.localeCompare(b.screenName, undefined, { sensitivity: "base" });

function snippet(b) {
  const quote = b.profile?.quote || "";
  if (b.status === "offline") return "signed off";
  if (b.status === "away") return `away · ${b.statusText || "be right back"}`;
  if (b.status === "idle") return [`idle ${minsAgo(b.statusAt)}m`, quote].filter(Boolean).join(" · ");
  if (unread[b.id]) return unread[b.id].last;
  return [fresh(b) && "just signed on", quote].filter(Boolean).join(" · ");
}

function row(b) {
  const r = el("button", `buddy row ${b.status}${b.status === "online" ? "" : " dim"}${fresh(b) ? " fresh" : ""}`, null, { role: "listitem" });
  const who = el("span", "who");
  who.append(el("span", "sn", b.screenName), el("span", "snip", snippet(b)));
  r.append(el("span", "tile", b.emoji, { "aria-hidden": "true" }), who);
  const n = unread[b.id]?.n;
  if (n) r.append(el("span", "pill", String(n), { "aria-label": `${n} new` }));
  r.onclick = () => api.invoke("win:open", "chat", { id: String(b.id) });
  r.oncontextmenu = (e) => { e.preventDefault(); api.invoke("buddy:menu", b.id); };
  return r;
}

function group(key, label, list) {
  const h = el("button", "group", null, { "aria-expanded": open[key] });
  h.innerHTML = CHEVRON;
  h.append(el("span", "", label));
  h.onclick = () => { open[key] = !open[key]; render(); };
  return [h, ...(open[key] ? list.map(row) : [])];
}

function render() {
  const on = buddies.filter((b) => b.status !== "offline").sort(byStatusThenName);
  const off = buddies.filter((b) => b.status === "offline").sort(byStatusThenName);
  $("list").replaceChildren(...group("on", `Buddies (${on.length}/${buddies.length})`, on), ...group("off", `Offline (${off.length})`, off));
  const total = Object.values(unread).reduce((n, u) => n + u.n, 0);
  const till = s.awayUntil ? ` till ${new Date(s.awayUntil).toLocaleTimeString([], { timeStyle: "short" })}` : "";
  $("me").textContent = s.awayMessage ? `You're away${till} · ${s.awayMessage}` : `You're online${total ? ` · ${total} new IM${total > 1 ? "s" : ""}` : ""}`;
  $("back").hidden = !s.awayMessage;
  $("chat").value = s.chattiness;
  $("chat-label").textContent = LABELS[s.chattiness];
  for (const [id, key, what] of MUTES) { $(id).setAttribute("aria-pressed", String(Boolean(s[key]))); $(id).title = `${s[key] ? "Unmute" : "Mute"} ${what}`; }
}

const upsert = (b) => { const i = buddies.findIndex((x) => x.id === b.id); if (i >= 0) buddies[i] = b; else buddies.push(b); };

async function load() {
  const [list, rows] = await Promise.all([api.invoke("buddies:list"), api.invoke("buddies:unread")]);
  buddies = list; unread = Object.fromEntries(rows.map((r) => [r.buddyId, r])); render();
}

const myList = () => { document.title = $("title").textContent = s.screenName ? `${s.screenName}'s Buddy List` : "Buddy List"; };
api.on("settings", (next) => { s = next; render(); myList(); });
myList();
api.on("buddies", load);
api.on("presence", ({ buddy, from }) => {
  upsert(buddy);
  if (from === "offline" && buddy.status !== "offline") { signedOnAt[buddy.id] = Date.now(); sound("door-open"); }
  if (buddy.status === "offline" && from !== "offline") sound("door-close");
  render();
});
api.on("message", ({ msg, buddy }) => {
  upsert(buddy);
  if (msg.role === "buddy") { unread[buddy.id] = { n: (unread[buddy.id]?.n || 0) + 1, last: msg.text }; sound("im"); }
  render();
});
api.on("read", (id) => { delete unread[id]; render(); });

$("chat").oninput = () => { $("chat-label").textContent = LABELS[$("chat").value]; };
$("chat").onchange = () => api.invoke("settings:set", { chattiness: Number($("chat").value) });
for (const [id, win] of [["away", "away"], ["add", "addbuddy"], ["chat", "room"], ["setup", "settings"]]) $(id).onclick = () => api.invoke("win:open", win);
$("back").onclick = () => api.invoke("away:set", "");
for (const [id, key] of MUTES) $(id).onclick = () => api.invoke("settings:set", { [key]: !s[key] });

setInterval(render, 30_000); // idle minutes tick up, "just signed on" fades
load();
